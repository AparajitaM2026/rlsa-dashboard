import { parseCsvStream, parseCsvBytes, stripBom } from "./csvStream.ts";
import { getMonthlyFxRate } from "./fxRates.ts";
import { applyCountrySplit } from "./countryFallback.ts";

const HOUSE_IMPRINTS = ["HOUSE CATALOG", "OTT HOUSE", "HOUSE", "HOUSE ACCOUNT"];
const BATCH_SIZE = 5000;

const normalize = (s: unknown) => (s == null ? "" : String(s)).trim().toUpperCase();

// Parse a numeric CSV cell. parseFloat handles scientific notation such as
// "1.00E-06" exactly like Number(); blank/NaN values default to 0 so
// micro-payout rows are never dropped or turned into null.
const toNum = (v: unknown) => {
  if (v == null || v === "") return 0;
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
};

// Idempotency hash for additive ingestion: rows with the same
// (vendor, isrc/track, report_month, store, units, gross_revenue) are
// treated as duplicates and skipped — new files append without wiping
// historical data.
function computeRowHash(row: Record<string, any>): string {
  const parts = [
    String(row.vendor_name || ""),
    String(row.isrc || row.track_title || ""),
    String(row.report_month || ""),
    String(row.store_dsp || ""),
    String(row.units || 0),
    String(row.gross_revenue || 0),
  ];
  const str = parts.join("|").toUpperCase();
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash + str.charCodeAt(i)) & 0x7fffffff;
  }
  return String(hash);
}

// Query existing RevenueRow records matching any hash in the batch and
// return only the rows that are NOT already in the database.
async function dedupBatch(base44: any, batch: any[]): Promise<any[]> {
  if (!batch.length) return batch;
  const hashes = batch.map((r) => r.row_hash).filter(Boolean);
  if (!hashes.length) return batch;
  // Chunk the $in query — the SDK encodes filter queries as URL params, so
  // a large $in array (5000+) exceeds the URI/header size limit (414/431).
  const DEDUP_CHUNK = 1000;
  const existingHashes = new Set<string>();
  for (let i = 0; i < hashes.length; i += DEDUP_CHUNK) {
    const chunk = hashes.slice(i, i + DEDUP_CHUNK);
    const existing = await base44.asServiceRole.entities.RevenueRow.filter(
      { row_hash: { $in: chunk } },
      "-created_date",
      chunk.length + 10,
    );
    for (const r of existing) existingHashes.add(r.row_hash);
  }
  return batch.filter((r) => !existingHashes.has(r.row_hash));
}

type ArtistEntry = { client_account_id: string; override_label: boolean };
type ArtistMaps = {
  isrc: Map<string, ArtistEntry>;
  track: Map<string, ArtistEntry>;
  album: Map<string, ArtistEntry>;
};

function buildArtistMaps(rules: any[]): ArtistMaps {
  const maps: ArtistMaps = { isrc: new Map(), track: new Map(), album: new Map() };
  for (const am of rules) {
    const val = normalize(am.match_value);
    if (!val || !am.client_account_id) continue;
    const entry: ArtistEntry = { client_account_id: am.client_account_id, override_label: !!am.override_label };
    let target: Map<string, ArtistEntry> | null = null;
    if (am.match_type === "isrc") target = maps.isrc;
    else if (am.match_type === "track_title") target = maps.track;
    else if (am.match_type === "album_title") target = maps.album;
    if (!target) continue;
    // Prefer override=true when duplicate keys exist
    const existing = target.get(val);
    if (!existing || entry.override_label) target.set(val, entry);
  }
  return maps;
}

function resolveArtistRoute(
  isrc: string, track: string, album: string,
  maps: ArtistMaps, requireOverride: boolean
): string | null {
  if (isrc) {
    const am = maps.isrc.get(normalize(isrc));
    if (am && am.override_label === requireOverride) return am.client_account_id;
  }
  if (track) {
    const am = maps.track.get(normalize(track));
    if (am && am.override_label === requireOverride) return am.client_account_id;
  }
  if (album) {
    const am = maps.album.get(normalize(album));
    if (am && am.override_label === requireOverride) return am.client_account_id;
  }
  return null;
}

// Multi-vendor column normalization. Maps vendor-specific CSV header names
// (Orchard, PDL, Symphonic, and future vendors) to our canonical schema
// fields using fuzzy substring matching. The first matching column wins per
// field (guarded by !map.<field>) so duplicate revenue/title columns never
// overwrite the preferred one.
const buildColumnMap = (headers: string[]) => {
  const map: Record<string, number> = {};
  headers.forEach((raw, i) => {
    const h = raw.toLowerCase().trim();
    // Label / imprint — Orchard uses "LABEL IMPRINT"; PDL/Symphonic may use just "Label"
    if (h.includes("label") && (h.includes("imprint") || h === "label" || h.includes("label name")))
      map.label_imprint = i;
    else if (h.includes("isrc")) map.isrc = i;
    // Track / Song title — exclude TRACK ARTIST / TRACK ALBUM / TRACK VERSION
    else if (
      (h.includes("track") || h.includes("song")) &&
      !h.includes("artist") &&
      !h.includes("album") &&
      !h.includes("version") &&
      !h.includes("writer")
    )
      map.track_title = i;
    // Standalone "Title" or "Track Name" / "Song Title" / "Track/Song Title"
    else if (h === "title" || h.includes("track name") || h.includes("song title") || h.includes("track/song"))
      map.track_title = i;
    // Album / Release name — Orchard uses "PRODUCT" for the album/release name
    else if (
      h.includes("album") ||
      h.includes("release name") ||
      (h.includes("product") &&
        !h.includes("artist") &&
        !h.includes("version") &&
        !h.includes("code"))
    )
      map.album_title = i;
    // Artist / Performer
    else if (h.includes("artist") || h.includes("performer")) map.artist = i;
    // Country / Territory
    else if (h.includes("country") || h.includes("territory")) map.country = i;
    // Store / DSP — prefer "store" or "dsp" over "service"/"platform"/"source"
    // (Orchard has both "Store" and "Service details"; without a first-match
    // guard "Service details" overwrites "Store" because it appears later.)
    else if (!map.store_dsp && (h.includes("store") || h.includes("dsp")))
      map.store_dsp = i;
    else if (!map.store_dsp && (h.includes("platform") || h.includes("service") || h.includes("source")))
      map.store_dsp = i;
    // Caller tune
    else if (h.includes("caller") || h.includes("tune")) map.caller_tune = i;
    // Units / Quantity / Qty / Play Count / Downloads / Streams
    else if (h.includes("quantity") || h.includes("qty") || h.includes("play count") || h.includes("play_count") || h === "plays") map.units = i;
    else if (!map.units && (h.includes("unit") || h.includes("download") || h.includes("stream")) && !h.includes("price"))
      map.units = i;
    // Revenue — priority: NET SHARE > gross > payout/earnings > revenue > royalty/amount
    else if (h.includes("net") && h.includes("share")) map.gross_revenue = i;
    else if (!map.gross_revenue && (h.includes("gross") || h.includes("payout") || h.includes("earning")))
      map.gross_revenue = i;
    else if (!map.gross_revenue && h.includes("revenue") && !h.includes("type"))
      map.gross_revenue = i;
    else if (!map.gross_revenue && (h === "amount" || (h.includes("royalty") && !h.includes("type")) || h.includes("net revenue")))
      map.gross_revenue = i;
    // Revenue / Transaction type
    else if (h.includes("revenue") && h.includes("type")) map.revenue_type = i;
    else if (h.includes("transaction") && h.includes("type")) map.revenue_type = i;
    // PDL-specific columns (Month, Year, Income, Admin, Currency)
    else if (h === "income" || h === "total income") map.income = i;
    else if (h === "admin" || h === "admin fee") map.admin_fee = i;
    else if (h === "month" || h === "month no" || h === "month number") map.month = i;
    else if (h === "year") map.year = i;
    else if (h === "currency") map.currency = i;
  });
  return map;
};

export type Progress = {
  rows: number;
  bytes: number;
  totalBytes: number;
};

/**
 * Stream an uploaded Orchard CSV, route every row (house / mapped client /
 * unmapped), and batch-insert RevenueRow records in chunks. Calls onProgress
 * periodically so callers can persist progress for a live UI.
 */
export async function routeRevenueCsv(
  base44: any,
  file_url: string,
  report_month: string,
  vendor_name: string,
  onProgress?: (p: Progress) => void | Promise<void>
) {
  const res = await fetch(file_url);
  if (!res.ok || !res.body) {
    throw new Error(`Failed to download CSV (HTTP ${res.status})`);
  }
  const totalBytes = Number(res.headers.get("content-length") || 0);

  // Load routing rules once.
  const [mappings, clients, artistRules] = await Promise.all([
    base44.asServiceRole.entities.LabelMapping.list("-created_date", 500),
    base44.asServiceRole.entities.ClientAccount.list("-created_date", 500),
    base44.asServiceRole.entities.ArtistMapping.list("-created_date", 500),
  ]);

  const imprintMap = new Map<string, { client_account_id: string | null; is_house: boolean }>();
  for (const m of mappings) {
    imprintMap.set(normalize(m.raw_imprint), {
      client_account_id: m.client_account_id || null,
      is_house: !!m.is_house,
    });
  }
  for (const c of clients) {
    imprintMap.set(normalize(c.client_name), {
      client_account_id: c.id,
      is_house: !!c.is_house_account,
    });
  }
  const clientNameMap = new Map<string, string>();
  for (const c of clients) clientNameMap.set(c.id, c.client_name);
  const artistMaps = buildArtistMaps(artistRules);

  let header: string[] | null = null;
  let colMap: Record<string, number> = {};
  let batch: any[] = [];

  let total = 0;
  let house = 0;
  let client = 0;
  let unmapped = 0;
  let bytes = 0;
  let flushCount = 0;
  const unmappedImprints = new Set<string>();
  const seenHashes = new Set<string>();

  const flush = async () => {
    if (!batch.length) return;
    const newRows = await dedupBatch(base44, batch);
    if (newRows.length) await base44.asServiceRole.entities.RevenueRow.bulkCreate(newRows);
    batch = [];
  };

  // Push a routed row (or multiple rows when a country fallback split applies)
  // into the batch. Each split row gets a unique hash that includes the country
  // so dedup doesn't collapse them back into one.
  const pushRouted = (baseRow: any, isHouse: boolean, isUnmapped: boolean, clientId: string | null) => {
    const clientName = clientId ? (clientNameMap.get(clientId) || null) : null;
    const splitRows = applyCountrySplit(baseRow, clientName);
    for (const r of splitRows) {
      const h = computeRowHash(r) + (r.country ? "|" + String(r.country) : "");
      batch.push({ ...r, row_hash: h, is_house_label: isHouse, is_unmapped: isUnmapped, client_account_id: clientId });
    }
  };

  for await (const row of parseCsvStream(res.body, {
    onChunk: (n) => (bytes += n),
  })) {
    if (!header) {
      header = row.map((c, i) => (i === 0 ? stripBom(c) : c));
      colMap = buildColumnMap(header);
      // PDL: use "Income" column as gross_revenue (overrides generic "Royalty" match)
      if (vendor_name.toUpperCase() === "PDL" && colMap.income != null) {
        colMap.gross_revenue = colMap.income;
      }
      continue;
    }

    const get = (key: string) => (colMap[key] != null ? row[colMap[key]] ?? "" : "");
    const raw = get("label_imprint");
    const key = normalize(raw);
    const route = imprintMap.get(key);

    let grossRev = toNum(get("gross_revenue"));
    let currency = "USD";
    let rowReportMonth = report_month;
    // PDL: convert INR revenue to USD using the row's Month/Year exchange rate
    // and assign the row to its own statement period (YYYY-MM) from the CSV.
    if (vendor_name.toUpperCase() === "PDL") {
      const fxMonth = Math.round(parseFloat(get("month")) || 0);
      const fxYear = Math.round(parseFloat(get("year")) || 0);
      if (fxMonth && fxYear) {
        rowReportMonth = `${fxYear}-${String(fxMonth).padStart(2, "0")}`;
      }
      const rowCurrency = (get("currency") || "INR").toUpperCase().trim();
      if (rowCurrency === "INR") {
        if (fxMonth && fxYear) {
          const rate = await getMonthlyFxRate(base44, fxYear, fxMonth);
          if (rate && rate > 0) {
            grossRev = grossRev / rate;
            currency = "USD";
          } else {
            currency = "INR";
          }
        } else {
          currency = "INR";
        }
      } else {
        currency = rowCurrency;
      }
    }

    const base = {
      report_month: rowReportMonth,
      vendor_name,
      label_imprint: raw,
      track_title: get("track_title") || get("album_title"),
      isrc: get("isrc"),
      album_title: get("album_title"),
      artist: get("artist"),
      country: get("country"),
      store_dsp: get("store_dsp"),
      units: toNum(get("units")),
      gross_revenue: grossRev,
      currency,
      caller_tune: get("caller_tune"),
      revenue_type: get("revenue_type"),
    };

    const rowHash = computeRowHash(base);
    if (seenHashes.has(rowHash)) { total++; continue; }
    seenHashes.add(rowHash);

    const overrideArtist = resolveArtistRoute(base.isrc, base.track_title, base.album_title, artistMaps, true);
    if (overrideArtist) {
      pushRouted(base, false, false, overrideArtist);
      client++;
    } else if (route) {
      if (route.is_house) {
        pushRouted(base, true, false, null);
        house++;
      } else {
        pushRouted(base, false, false, route.client_account_id);
        client++;
      }
    } else if (HOUSE_IMPRINTS.includes(key)) {
      pushRouted(base, true, false, null);
      house++;
    } else {
      const fallbackArtist = resolveArtistRoute(base.isrc, base.track_title, base.album_title, artistMaps, false);
      if (fallbackArtist) {
        pushRouted(base, false, false, fallbackArtist);
        client++;
      } else {
        pushRouted(base, false, true, null);
        unmapped++;
        if (raw) unmappedImprints.add(raw);
      }
    }

    total++;

    if (batch.length >= BATCH_SIZE) {
      await flush();
      flushCount++;
      // Persist progress every ~10k rows (every 5 batches), not every batch —
      // writing the job entity on every 2k-row batch serialises many DB calls
      // per fragment and can push a single fragment past the 300s function limit.
      if (onProgress && flushCount % 5 === 0)
        await onProgress({ rows: total, bytes, totalBytes });
    }
  }

  await flush();
  if (onProgress) await onProgress({ rows: total, bytes, totalBytes });

  return {
    total,
    house,
    client,
    unmapped,
    unmapped_imprints: Array.from(unmappedImprints),
  };
}

// --- Resumable chunked processing -------------------------------------------------
// Processes a bounded byte range of the CSV per invocation so very large files
// (hundreds of MB) complete across multiple function calls instead of hitting
// a single-invocation time limit. The workflow re-invokes this until `done`.
const CHUNK_FETCH = 12 * 1024 * 1024; // 12MB fetched per invocation (stays under the function time limit)

export async function routeRevenueCsvChunk(
  base44: any,
  opts: {
    file_url: string;
    report_month: string;
    vendor_name: string;
    offset: number;
    totalBytesKnown: number;
    header: string | null;
    acc: { total: number; house: number; client: number; unmapped: number };
    unmappedImprints: string[];
  },
  onProgress?: (p: any) => void | Promise<void>
) {
  const { file_url, report_month, vendor_name, offset, totalBytesKnown, header: knownHeader, acc, unmappedImprints: knownImprints } = opts;

  // Fetch this chunk's byte range.
  const end = offset + CHUNK_FETCH - 1;
  const res = await fetch(file_url, { headers: { Range: `bytes=${offset}-${end}` } });
  if (!res.ok || !res.body) {
    throw new Error(`Failed to download CSV (HTTP ${res.status})`);
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  const fetchedLen = bytes.length;

  let totalBytes = totalBytesKnown;
  if (!totalBytes) {
    const cr = res.headers.get("content-range");
    if (cr) {
      const m = cr.match(/\/(\d+)/);
      if (m) totalBytes = Number(m[1]);
    }
    if (!totalBytes) totalBytes = offset + fetchedLen;
  }
  const eof = fetchedLen < CHUNK_FETCH;

  // Load routing rules once per chunk.
  const [mappings, clients, artistRules] = await Promise.all([
    base44.asServiceRole.entities.LabelMapping.list("-created_date", 500),
    base44.asServiceRole.entities.ClientAccount.list("-created_date", 500),
    base44.asServiceRole.entities.ArtistMapping.list("-created_date", 500),
  ]);
  const imprintMap = new Map<string, { client_account_id: string | null; is_house: boolean }>();
  for (const m of mappings) {
    imprintMap.set(normalize(m.raw_imprint), { client_account_id: m.client_account_id || null, is_house: !!m.is_house });
  }
  for (const c of clients) {
    imprintMap.set(normalize(c.client_name), { client_account_id: c.id, is_house: !!c.is_house_account });
  }
  const clientNameMap = new Map<string, string>();
  for (const c of clients) clientNameMap.set(c.id, c.client_name);
  const artistMaps = buildArtistMaps(artistRules);

  const { rows, consumed } = parseCsvBytes(bytes, eof);
  if (consumed === 0 && bytes.length > 0) {
    throw new Error("A single CSV row exceeded the chunk size — cannot resume safely.");
  }

  // Header handling: first chunk reads it, later chunks reuse the cached one.
  let header: string[] | null = knownHeader ? JSON.parse(knownHeader) : null;
  let colMap: Record<string, number> = header ? buildColumnMap(header) : {};
  let dataRows = rows;
  if (!header) {
    if (rows.length === 0) throw new Error("CSV has no header row");
    header = rows[0].map((c, i) => (i === 0 ? stripBom(c) : c));
    colMap = buildColumnMap(header);
    dataRows = rows.slice(1);
  }
  // PDL: use "Income" column as gross_revenue (overrides generic "Royalty" match)
  if (vendor_name.toUpperCase() === "PDL" && colMap.income != null) {
    colMap.gross_revenue = colMap.income;
  }

  const get = (row: string[], key: string) => (colMap[key] != null ? row[colMap[key]] ?? "" : "");

  let batch: any[] = [];
  let flushCount = 0;
  let total = acc.total || 0;
  let house = acc.house || 0;
  let client = acc.client || 0;
  let unmapped = acc.unmapped || 0;
  const unmappedImprints = new Set<string>(knownImprints || []);
  const seenHashes = new Set<string>();

  const flush = async () => {
    if (!batch.length) return;
    const newRows = await dedupBatch(base44, batch);
    if (newRows.length) await base44.asServiceRole.entities.RevenueRow.bulkCreate(newRows);
    batch = [];
  };

  // Push a routed row (or multiple rows when a country fallback split applies)
  // into the batch. Each split row gets a unique hash that includes the country
  // so dedup doesn't collapse them back into one.
  const pushRouted = (baseRow: any, isHouse: boolean, isUnmapped: boolean, clientId: string | null) => {
    const clientName = clientId ? (clientNameMap.get(clientId) || null) : null;
    const splitRows = applyCountrySplit(baseRow, clientName);
    for (const r of splitRows) {
      const h = computeRowHash(r) + (r.country ? "|" + String(r.country) : "");
      batch.push({ ...r, row_hash: h, is_house_label: isHouse, is_unmapped: isUnmapped, client_account_id: clientId });
    }
  };

  for (const row of dataRows) {
    const raw = get(row, "label_imprint");
    const key = normalize(raw);
    const route = imprintMap.get(key);

    let grossRev = toNum(get(row, "gross_revenue"));
    let currency = "USD";
    let rowReportMonth = report_month;
    // PDL: convert INR revenue to USD using the row's Month/Year exchange rate
    // and assign the row to its own statement period (YYYY-MM) from the CSV.
    if (vendor_name.toUpperCase() === "PDL") {
      const fxMonth = Math.round(parseFloat(get(row, "month")) || 0);
      const fxYear = Math.round(parseFloat(get(row, "year")) || 0);
      if (fxMonth && fxYear) {
        rowReportMonth = `${fxYear}-${String(fxMonth).padStart(2, "0")}`;
      }
      const rowCurrency = (get(row, "currency") || "INR").toUpperCase().trim();
      if (rowCurrency === "INR") {
        if (fxMonth && fxYear) {
          const rate = await getMonthlyFxRate(base44, fxYear, fxMonth);
          if (rate && rate > 0) {
            grossRev = grossRev / rate;
            currency = "USD";
          } else {
            currency = "INR";
          }
        } else {
          currency = "INR";
        }
      } else {
        currency = rowCurrency;
      }
    }

    const base = {
      report_month: rowReportMonth,
      vendor_name,
      label_imprint: raw,
      track_title: get(row, "track_title") || get(row, "album_title"),
      isrc: get(row, "isrc"),
      album_title: get(row, "album_title"),
      artist: get(row, "artist"),
      country: get(row, "country"),
      store_dsp: get(row, "store_dsp"),
      units: toNum(get(row, "units")),
      gross_revenue: grossRev,
      currency,
      caller_tune: get(row, "caller_tune"),
      revenue_type: get(row, "revenue_type"),
    };

    const rowHash = computeRowHash(base);
    if (seenHashes.has(rowHash)) { total++; continue; }
    seenHashes.add(rowHash);

    const overrideArtist = resolveArtistRoute(base.isrc, base.track_title, base.album_title, artistMaps, true);
    if (overrideArtist) {
      pushRouted(base, false, false, overrideArtist);
      client++;
    } else if (route) {
      if (route.is_house) {
        pushRouted(base, true, false, null);
        house++;
      } else {
        pushRouted(base, false, false, route.client_account_id);
        client++;
      }
    } else if (HOUSE_IMPRINTS.includes(key)) {
      pushRouted(base, true, false, null);
      house++;
    } else {
      const fallbackArtist = resolveArtistRoute(base.isrc, base.track_title, base.album_title, artistMaps, false);
      if (fallbackArtist) {
        pushRouted(base, false, false, fallbackArtist);
        client++;
      } else {
        pushRouted(base, false, true, null);
        unmapped++;
        if (raw) unmappedImprints.add(raw);
      }
    }

    total++;
    if (batch.length >= BATCH_SIZE) {
      await flush();
      flushCount++;
      // Periodic live row-count updates within the chunk (every 5 batches ≈
      // 10k rows). bytes stays at the chunk start so this never re-triggers.
      if (onProgress && flushCount % 5 === 0) {
        await onProgress({
          rows: total,
          bytes: offset,
          totalBytes,
          total,
          house,
          client,
          unmapped,
          header: header ? JSON.stringify(header) : null,
          unmapped_imprints: Array.from(unmappedImprints),
          done: false,
        });
      }
    }
  }
  await flush();

  const newOffset = offset + consumed;
  const done = eof && newOffset >= totalBytes;

  if (onProgress) {
    await onProgress({
      rows: total,
      bytes: newOffset,
      totalBytes,
      total,
      house,
      client,
      unmapped,
      header: header ? JSON.stringify(header) : null,
      unmapped_imprints: Array.from(unmappedImprints),
      done,
    });
  }

  return { done, total, house, client, unmapped, unmapped_imprints: Array.from(unmappedImprints), bytes: newOffset, totalBytes };
}