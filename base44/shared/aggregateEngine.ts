// Shared aggregation engine — processes a bounded batch of RevenueRow records
// for a statement period and accumulates into the MonthlyAggregate cache.
// Used by both `aggregateRevenue` (single pass per call, resumable) and
// `rebuildAllAggregates` (loops passes + periods within one call).

const PAGE = 2000;
const ROW_BUDGET = 200000; // rows per call — stays well under the read-traffic cap

const parseArr = (s: string) => { try { return s ? JSON.parse(s) : []; } catch { return []; } };

export async function runAggregatePass(base44: any, report_month: string, options: { force_reset?: boolean; dimensions?: string[] } = {}) {
  const { force_reset = false, dimensions } = options;
  const wantAll = !dimensions || !dimensions.length;
  const want = (d: string) => wantAll || dimensions.includes(d);

  // Load or initialize the resumable accumulator record.
  const existing = await base44.asServiceRole.entities.MonthlyAggregate.filter({ report_month }, '-created_date', 1);
  let rec: any = existing[0];
  let scanSkip = 0;

  // Force reset: clear the existing aggregate so the scan starts fresh
  // (used by rebuild workflows to fix stale/corrupt caches).
  if (rec && force_reset) {
    await base44.asServiceRole.entities.MonthlyAggregate.update(rec.id, {
      scan_complete: false, scan_skip: 0, computed_at: null,
      total_rows: 0, house_gross: 0, house_rows: 0, house_units: 0,
      client_gross: 0, client_rows: 0, client_units: 0,
      unmapped_gross: 0, unmapped_rows: 0,
      per_client: '[]', per_vendor: '[]', per_imprint: '[]', per_country: '[]', per_store: '[]',
      unmapped_imprints: [],
    });
    rec.scan_complete = false;
    rec.scan_skip = 0;
  }

  let totalRows = 0, houseGross = 0, houseRows = 0, houseUnits = 0;
  let clientGross = 0, clientRows = 0, clientUnits = 0;
  let unmappedGross = 0, unmappedRows = 0;
  const unmappedImprints = new Set<string>();
  const perClient = new Map<string, any>();
  const perCountry = new Map<string, any>();
  const perStore = new Map<string, any>();
  const perImprint = new Map<string, any>();
  const perVendor = new Map<string, any>();

  if (rec) {
    if (rec.scan_complete) {
      // Already finalized — but check if per_vendor is missing (legacy scans
      // from before the vendor dimension was added). If so, reset and re-scan.
      const hasVendor = rec.per_vendor && parseArr(rec.per_vendor).length > 0;
      if (hasVendor) {
        return { complete: true, report_month, totalRows: rec.total_rows, cached: true };
      }
      await base44.asServiceRole.entities.MonthlyAggregate.update(rec.id, { scan_complete: false, scan_skip: 0 });
      rec.scan_complete = false;
      rec.scan_skip = 0;
    }
    // Resume: re-hydrate accumulated state from the stored record.
    // Only seed from stored JSON when resuming mid-scan (scanSkip > 0).
    scanSkip = Number(rec.scan_skip) || 0;
    if (scanSkip > 0) {
      totalRows = Number(rec.total_rows) || 0;
      houseGross = Number(rec.house_gross) || 0; houseRows = Number(rec.house_rows) || 0; houseUnits = Number(rec.house_units) || 0;
      clientGross = Number(rec.client_gross) || 0; clientRows = Number(rec.client_rows) || 0; clientUnits = Number(rec.client_units) || 0;
      unmappedGross = Number(rec.unmapped_gross) || 0; unmappedRows = Number(rec.unmapped_rows) || 0;
      for (const im of (rec.unmapped_imprints || [])) unmappedImprints.add(im);
      if (want('perClient')) for (const e of parseArr(rec.per_client)) perClient.set(e.client_account_id, { gross: e.gross, units: e.units, isrcs: new Set<string>((e.isrcs || [])) });
      if (want('perCountry')) for (const e of parseArr(rec.per_country)) perCountry.set(e.key, { gross: e.gross, units: e.units, rows: e.rows });
      if (want('perStore')) for (const e of parseArr(rec.per_store)) perStore.set(e.key, { gross: e.gross, units: e.units, rows: e.rows });
      if (want('perImprint')) for (const e of parseArr(rec.per_imprint)) perImprint.set(e.key, { gross: e.gross, units: e.units, rows: e.rows, is_unmapped: !!e.is_unmapped, is_house: !!e.is_house });
      if (want('perVendor')) for (const e of parseArr(rec.per_vendor)) perVendor.set(e.key, { gross: e.gross, units: e.units, rows: e.rows });
    }
  }

  // Process a bounded batch starting at scanSkip.
  let processed = 0;
  let skip = scanSkip;
  let exhausted = false;
  while (processed < ROW_BUDGET) {
    const rows = await base44.asServiceRole.entities.RevenueRow.filter({ report_month }, '-created_date', PAGE, skip);
    if (!rows.length) { exhausted = true; break; }
    for (const r of rows) {
      const g = Number(r.gross_revenue) || 0;
      const u = Number(r.units) || 0;
      totalRows++;
      if (r.is_house_label) {
        houseGross += g; houseRows++; houseUnits += u;
      } else if (r.is_unmapped) {
        unmappedGross += g; unmappedRows++;
        if (r.label_imprint) unmappedImprints.add(r.label_imprint);
      } else {
        clientGross += g; clientRows++; clientUnits += u;
        if (r.client_account_id) {
          const e = perClient.get(r.client_account_id) || { gross: 0, units: 0, isrcs: new Set<string>() };
          e.gross += g; e.units += u;
          if (r.isrc || r.track_title) e.isrcs.add(r.isrc || r.track_title);
          perClient.set(r.client_account_id, e);
        }
      }
      if (want('perCountry')) {
        const c = r.country || 'Unknown';
        const pc = perCountry.get(c) || { gross: 0, units: 0, rows: 0 };
        pc.gross += g; pc.units += u; pc.rows++; perCountry.set(c, pc);
      }
      if (want('perStore')) {
        const s = r.store_dsp || 'Unknown';
        const ps = perStore.get(s) || { gross: 0, units: 0, rows: 0 };
        ps.gross += g; ps.units += u; ps.rows++; perStore.set(s, ps);
      }
      if (want('perImprint')) {
        const im = r.label_imprint || 'Unknown';
        const pi = perImprint.get(im) || { gross: 0, units: 0, rows: 0, is_unmapped: !!r.is_unmapped, is_house: !!r.is_house_label };
        pi.gross += g; pi.units += u; pi.rows++; perImprint.set(im, pi);
      }
      if (want('perVendor')) {
        const vn = r.vendor_name || 'Orchard';
        const pv = perVendor.get(vn) || { gross: 0, units: 0, rows: 0 };
        pv.gross += g; pv.units += u; pv.rows++; perVendor.set(vn, pv);
      }
    }
    processed += rows.length;
    skip += rows.length;
    if (rows.length < PAGE) { exhausted = true; break; }
  }

  const complete = exhausted;
  const newSkip = skip;

  const cap = (arr: any[], n: number) => arr.sort((a: any, b: any) => b.gross - a.gross).slice(0, n);
  const perClientArr = Array.from(perClient, ([id, v]) => ({ client_account_id: id, gross: v.gross, units: v.units, track_count: v.isrcs.size }));
  const perCountryArr = cap(Array.from(perCountry, ([k, v]) => ({ key: k, ...v })), 200);
  const perStoreArr = cap(Array.from(perStore, ([k, v]) => ({ key: k, ...v })), 200);
  const perImprintArr = cap(Array.from(perImprint, ([k, v]) => ({ key: k, ...v })), 200);
  const perVendorArr = cap(Array.from(perVendor, ([k, v]) => ({ key: k, ...v })), 50);
  const unmappedArr = Array.from(unmappedImprints);

  const payload: any = {
    report_month,
    total_rows: totalRows,
    house_gross: houseGross, house_rows: houseRows, house_units: houseUnits,
    client_gross: clientGross, client_rows: clientRows, client_units: clientUnits,
    unmapped_gross: unmappedGross, unmapped_rows: unmappedRows,
    per_client: JSON.stringify(perClientArr),
    per_country: JSON.stringify(perCountryArr),
    per_store: JSON.stringify(perStoreArr),
    per_imprint: JSON.stringify(perImprintArr),
    per_vendor: JSON.stringify(perVendorArr),
    unmapped_imprints: unmappedArr,
    scan_skip: newSkip,
    scan_complete: complete,
  };
  if (complete) payload.computed_at = new Date().toISOString();

  if (rec) {
    await base44.asServiceRole.entities.MonthlyAggregate.update(rec.id, payload);
  } else {
    await base44.asServiceRole.entities.MonthlyAggregate.create(payload);
  }

  return {
    complete,
    report_month,
    scan_skip: newSkip,
    rows_this_call: processed,
    totalRows,
    houseGross, houseRows, houseUnits,
    clientGross, clientRows, clientUnits,
    unmappedGross, unmappedRows,
    unmappedImprints: unmappedArr,
    ...(want('perClient') ? { perClient: perClientArr } : {}),
    ...(want('perCountry') ? { perCountry: perCountryArr } : {}),
    ...(want('perStore') ? { perStore: perStoreArr } : {}),
    ...(want('perImprint') ? { perImprint: perImprintArr } : {}),
    ...(want('perVendor') ? { perVendor: perVendorArr } : {}),
  };
}