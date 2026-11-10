import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { db, pool } from './pg-db.js';
import { sendEmail } from './email-service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const HOUSE_IMPRINTS = ['HOUSE CATALOG', 'OTT HOUSE', 'HOUSE', 'HOUSE ACCOUNT', 'OTT HOUSE CATALOG'];

function parseCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

export async function processCsvUpload(jobId) {
  try {
    console.log(`[CsvProcessor] Starting job: ${jobId}`);
    const job = await db.get('CsvUploadJob', jobId);
    if (!job) {
      console.warn(`[CsvProcessor] Job ${jobId} not found`);
      return;
    }

    await db.update('CsvUploadJob', jobId, { status: 'processing', rows_processed: 0 });

    let filePath = '';
    const uploadsDir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    if (job.file_url) {
      if (job.file_url.startsWith('/uploads/')) {
        filePath = path.join(__dirname, '..', job.file_url);
      } else if (job.file_url.startsWith('http://') || job.file_url.startsWith('https://')) {
        console.log(`[CsvProcessor] Downloading remote file from ${job.file_url}`);
        const res = await fetch(job.file_url);
        if (res.ok) {
          const buffer = Buffer.from(await res.arrayBuffer());
          filePath = path.join(uploadsDir, `downloaded_${Date.now()}.csv`);
          fs.writeFileSync(filePath, buffer);
          console.log(`[CsvProcessor] Downloaded ${buffer.length} bytes to ${filePath}`);
        } else {
          throw new Error(`Failed to download remote file (HTTP ${res.status}): ${job.file_url}`);
        }
      } else {
        filePath = path.join(uploadsDir, path.basename(job.file_url));
      }
    }

    if (!filePath || !fs.existsSync(filePath)) {
      await db.update('CsvUploadJob', jobId, {
        status: 'failed',
        error: `Upload file not found at ${job.file_url || 'empty path'}`
      });
      return;
    }

    const fileSize = fs.statSync(filePath).size;

    // 1. Load mappings and accounts from DB
    console.log(`[CsvProcessor] Loading label mappings and client accounts...`);
    const [labelMappings, clientAccounts] = await Promise.all([
      db.list('LabelMapping', '-created_date', 1000, 0),
      db.list('ClientAccount', '-created_date', 1000, 0)
    ]);

    const mappingMap = new Map();
    for (const lm of labelMappings) {
      const imprintKey = (lm.raw_imprint || lm.imprint_name || lm.name || '').trim().toUpperCase();
      if (imprintKey && lm.client_account_id) {
        mappingMap.set(imprintKey, lm.client_account_id);
      }
    }

    const clientMap = new Map();
    for (const ca of clientAccounts) {
      clientMap.set(ca.id, ca.client_name);
    }

    // 2. Read file lines synchronously & safely
    console.log(`[CsvProcessor] Reading file content...`);
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const rawLines = fileContent.split(/\r?\n/);
    console.log(`[CsvProcessor] Total raw lines in file: ${rawLines.length}`);

    let headers = null;
    let colIndices = {};
    let total = 0;
    let house = 0;
    let client = 0;
    let unmapped = 0;
    const unmappedImprints = new Set();
    const affectedMonths = new Set();
    const revenueRows = [];

    for (let lineIdx = 0; lineIdx < rawLines.length; lineIdx++) {
      const line = rawLines[lineIdx].trim();
      if (!line) continue;

      if (!headers) {
        headers = parseCsvLine(line).map(h => h.trim().toUpperCase().replace(/[\s/_-]+/g, ''));
        console.log(`[CsvProcessor] Found headers:`, headers);
        headers.forEach((h, idx) => {
          if (h.includes('TRACK') || h.includes('TITLE') || h.includes('SONG') || h.includes('NAME') && !h.includes('ARTIST') && !h.includes('LABEL')) {
            colIndices.track = colIndices.track ?? idx;
          }
          if (h.includes('ARTIST')) colIndices.artist = colIndices.artist ?? idx;
          if (h.includes('ISRC')) colIndices.isrc = colIndices.isrc ?? idx;
          if (h.includes('LABEL') || h.includes('IMPRINT')) colIndices.label = colIndices.label ?? idx;
          if (h.includes('STORE') || h.includes('DSP') || h.includes('SERVICE') || h.includes('PARTNER') || h.includes('PLATFORM')) {
            colIndices.store = colIndices.store ?? idx;
          }
          if (h.includes('GROSS') || h.includes('ROYALTY') || h.includes('INCOME') || h.includes('TOTAL') || h.includes('NET') || h.includes('AMOUNT')) {
            colIndices.gross = colIndices.gross ?? idx;
          }
          if (h.includes('UNITS') || h.includes('QUANTITY') || h.includes('STREAMS') || h.includes('QTY') || h.includes('PLAYCOUNT') || h.includes('PLAY') || h.includes('COUNT')) {
            colIndices.units = colIndices.units ?? idx;
          }
          if (h.includes('COUNTRY') || h.includes('TERRITORY')) colIndices.country = colIndices.country ?? idx;
          if (h === 'MONTH') colIndices.month = colIndices.month ?? idx;
          if (h === 'YEAR') colIndices.year = colIndices.year ?? idx;
        });
        console.log(`[CsvProcessor] Detected column indices:`, colIndices);
        continue;
      }

      const cols = parseCsvLine(line);
      const track_title = cols[colIndices.track] || 'Unknown Track';
      const artist_name = (colIndices.artist !== undefined ? cols[colIndices.artist] : '') || 'Unknown Artist';
      const isrc = (colIndices.isrc !== undefined ? cols[colIndices.isrc] : '') || '';
      const label_imprint = (colIndices.label !== undefined ? cols[colIndices.label] : '') || '';
      const store_dsp = (colIndices.store !== undefined ? cols[colIndices.store] : 'Other') || 'Other';
      const gross_revenue = parseFloat(cols[colIndices.gross]) || 0;
      const units = parseInt(cols[colIndices.units], 10) || 1;
      const country = (colIndices.country !== undefined ? cols[colIndices.country] : 'World') || 'World';

      // Detect report_month for multi-month files
      let rowMonth = job.report_month || new Date().toISOString().slice(0, 7);
      if (colIndices.month !== undefined && colIndices.year !== undefined) {
        const mVal = String(cols[colIndices.month] || '').trim();
        const yVal = String(cols[colIndices.year] || '').trim();
        if (mVal && yVal) {
          const mPad = mVal.length === 1 ? `0${mVal}` : mVal;
          rowMonth = `${yVal}-${mPad}`;
        }
      }
      if (rowMonth) affectedMonths.add(rowMonth);

      total++;

      const normalizedLabel = label_imprint.trim().toUpperCase();
      let client_account_id = null;
      let client_name = null;
      let is_house_label = false;
      let is_unmapped = false;

      if (HOUSE_IMPRINTS.includes(normalizedLabel)) {
        is_house_label = true;
        house++;
      } else if (mappingMap.has(normalizedLabel)) {
        client_account_id = mappingMap.get(normalizedLabel);
        client_name = clientMap.get(client_account_id) || 'Client Label';
        client++;
      } else {
        is_unmapped = true;
        unmapped++;
        if (label_imprint) unmappedImprints.add(label_imprint);
      }

      revenueRows.push({
        upload_job_id: jobId,
        track_title,
        artist_name,
        isrc,
        label_imprint,
        store_dsp,
        gross_revenue,
        units,
        country,
        report_month: rowMonth,
        vendor_name: job.vendor_name || 'PDL',
        client_account_id,
        client_name,
        is_house_label,
        is_unmapped
      });

      // Periodic progress update in DB every 100 rows
      if (total % 100 === 0) {
        await db.update('CsvUploadJob', jobId, { rows_processed: total });
      }
    }

    console.log(`[CsvProcessor] Parsed ${revenueRows.length} revenue rows. Inserting into DB...`);

    // Bulk insert rows using direct SQL for high performance
    if (revenueRows.length > 0) {
      const BATCH_SIZE = 100;
      for (let i = 0; i < revenueRows.length; i += BATCH_SIZE) {
        const batch = revenueRows.slice(i, i + BATCH_SIZE);
        const queryValues = [];
        const queryPlaceholders = [];
        let pIdx = 1;

        for (const r of batch) {
          const rowId = `revrow_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
          const rowData = JSON.stringify({ id: rowId, ...r });
          queryValues.push(rowId, rowData);
          queryPlaceholders.push(`($${pIdx}, $${pIdx + 1}, NOW(), NOW())`);
          pIdx += 2;
        }

        try {
          await pool.query(
            `INSERT INTO entity_revenuerow (id, data, created_date, updated_date) VALUES ${queryPlaceholders.join(', ')}`,
            queryValues
          );
        } catch (dbErr) {
          console.warn(`[CsvProcessor] Batch insert fallback:`, dbErr.message);
          for (const r of batch) {
            await db.create('RevenueRow', r).catch(() => {});
          }
        }
      }
    }

    // Recompute MonthlyAggregate for affected months so dashboards and client profiles populate immediately
    if (affectedMonths.size > 0) {
      console.log(`[CsvProcessor] Recomputing MonthlyAggregates for:`, Array.from(affectedMonths));
      for (const m of affectedMonths) {
        await recomputeMonthlyAggregate(m);
      }
    } else if (job.report_month) {
      await recomputeMonthlyAggregate(job.report_month);
    }

    const unmappedList = Array.from(unmappedImprints).slice(0, 50);

    // Update job status to completed!
    console.log(`[CsvProcessor] Ingestion complete: total=${total}, client=${client}, house=${house}, unmapped=${unmapped}`);
    await db.update('CsvUploadJob', jobId, {
      status: 'completed',
      total,
      house,
      client,
      unmapped,
      unmapped_imprints: unmappedList,
      rows_processed: total,
      bytes_processed: fileSize,
      bytes_total: fileSize,
      completed_at: new Date().toISOString()
    });

    console.log(`[CsvProcessor] Job ${jobId} marked as completed successfully!`);

    // Non-blocking email attempt
    try {
      sendEmail({
        to: 'amit@ottsol.com',
        subject: `CSV Upload Ingested: ${job.vendor_name || 'Royalty File'} (${job.report_month})`,
        html: `
          <div style="font-family:sans-serif;padding:20px;">
            <h2>CSV Ingestion Completed Successfully</h2>
            <p><strong>Month:</strong> ${job.report_month}</p>
            <p><strong>Vendor:</strong> ${job.vendor_name || 'PDL'}</p>
            <p><strong>Total Rows:</strong> ${total.toLocaleString()}</p>
            <ul>
              <li>Client Rows: ${client.toLocaleString()}</li>
              <li>House Catalog Rows: ${house.toLocaleString()}</li>
              <li>Unmapped Rows: ${unmapped.toLocaleString()}</li>
            </ul>
          </div>
        `
      }).catch(() => {});
    } catch {}

  } catch (err) {
    console.error(`[CsvProcessor] Error processing job ${jobId}:`, err);
    try {
      await db.update('CsvUploadJob', jobId, { status: 'failed', error: err.message });
    } catch {}
  }
}

export async function processCatalogSearch(jobId) {
  try {
    const job = await db.get('CatalogSearchJob', jobId);
    if (!job || !job.query) return;

    await db.update('CatalogSearchJob', jobId, { status: 'processing' });

    const q = job.query.toLowerCase().trim();
    const rows = await db.filter('RevenueRow', {}, '-created_date', 5000, 0);

    const matchingTracks = [];
    const imprintsSet = new Set();
    const seenTracks = new Map();

    for (const r of rows) {
      const match =
        (r.track_title && r.track_title.toLowerCase().includes(q)) ||
        (r.isrc && r.isrc.toLowerCase().includes(q)) ||
        (r.artist_name && r.artist_name.toLowerCase().includes(q));

      if (match) {
        if (r.label_imprint) imprintsSet.add(r.label_imprint);
        const key = r.isrc || r.track_title;
        const existing = seenTracks.get(key) || {
          track_title: r.track_title,
          artist_name: r.artist_name,
          isrc: r.isrc,
          label_imprint: r.label_imprint,
          client_name: r.client_name,
          gross_revenue: 0,
          units: 0
        };
        existing.gross_revenue += Number(r.gross_revenue) || 0;
        existing.units += Number(r.units) || 0;
        seenTracks.set(key, existing);
      }
    }

    const topTracks = Array.from(seenTracks.values())
      .sort((a, b) => b.gross_revenue - a.gross_revenue)
      .slice(0, 50);

    await db.update('CatalogSearchJob', jobId, {
      status: 'completed',
      matching_tracks: topTracks,
      imprints_found: Array.from(imprintsSet),
      total_matches: seenTracks.size,
      completed_at: new Date().toISOString()
    });
  } catch (err) {
    console.error(`[CatalogSearch] Error:`, err);
    try {
      await db.update('CatalogSearchJob', jobId, { status: 'failed', error: err.message });
    } catch {}
  }
}

export async function recomputeMonthlyAggregate(reportMonth) {
  if (!reportMonth) return;
  try {
    const rowsRes = await pool.query(
      `SELECT data FROM entity_revenuerow WHERE data->>'report_month' = $1 OR data->>'statement_period' = $1`,
      [reportMonth]
    );
    const rows = rowsRes.rows.map(r => r.data);

    let totalRows = 0;
    let houseGross = 0, houseRows = 0, houseUnits = 0;
    let clientGross = 0, clientRows = 0, clientUnits = 0;
    let unmappedGross = 0, unmappedRows = 0;
    const unmappedImprints = new Set();
    const perClient = new Map();
    const perCountry = new Map();
    const perStore = new Map();
    const perImprint = new Map();
    const perVendor = new Map();

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
          const e = perClient.get(r.client_account_id) || { client_account_id: r.client_account_id, gross: 0, units: 0, trackCount: 0, isrcs: new Set() };
          e.gross += g; e.units += u;
          if (r.isrc || r.track_title) e.isrcs.add(r.isrc || r.track_title);
          perClient.set(r.client_account_id, e);
        }
      }

      const store = r.store_dsp || 'Unknown';
      const se = perStore.get(store) || { key: store, gross: 0, units: 0, rows: 0 };
      se.gross += g; se.units += u; se.rows++;
      perStore.set(store, se);

      const country = r.country || 'World';
      const ce = perCountry.get(country) || { key: country, gross: 0, units: 0, rows: 0 };
      ce.gross += g; ce.units += u; ce.rows++;
      perCountry.set(country, ce);

      const imprint = r.label_imprint || 'Unknown';
      const ie = perImprint.get(imprint) || { key: imprint, gross: 0, units: 0, rows: 0, is_house: !!r.is_house_label, is_unmapped: !!r.is_unmapped };
      ie.gross += g; ie.units += u; ie.rows++;
      perImprint.set(imprint, ie);

      const vendor = r.vendor_name || 'PDL';
      const ve = perVendor.get(vendor) || { key: vendor, gross: 0, units: 0, rows: 0 };
      ve.gross += g; ve.units += u; ve.rows++;
      perVendor.set(vendor, ve);
    }

    const perClientArr = Array.from(perClient.values()).map(c => ({
      client_account_id: c.client_account_id,
      gross: Math.round(c.gross * 100) / 100,
      units: c.units,
      trackCount: c.isrcs.size
    }));

    const perStoreArr = Array.from(perStore.values()).map(s => ({
      ...s,
      gross: Math.round(s.gross * 100) / 100
    })).sort((a, b) => b.gross - a.gross);

    const perCountryArr = Array.from(perCountry.values()).map(c => ({
      ...c,
      gross: Math.round(c.gross * 100) / 100
    })).sort((a, b) => b.gross - a.gross);

    const perImprintArr = Array.from(perImprint.values()).map(i => ({
      ...i,
      gross: Math.round(i.gross * 100) / 100
    })).sort((a, b) => b.gross - a.gross);

    const perVendorArr = Array.from(perVendor.values()).map(v => ({
      ...v,
      gross: Math.round(v.gross * 100) / 100
    })).sort((a, b) => b.gross - a.gross);

    const aggRecord = {
      id: `agg_${reportMonth}`,
      report_month: reportMonth,
      total_rows: totalRows,
      house_gross: Math.round(houseGross * 100) / 100,
      house_rows: houseRows,
      house_units: houseUnits,
      client_gross: Math.round(clientGross * 100) / 100,
      client_rows: clientRows,
      client_units: clientUnits,
      unmapped_gross: Math.round(unmappedGross * 100) / 100,
      unmapped_rows: unmappedRows,
      unmapped_imprints: Array.from(unmappedImprints),
      per_client: JSON.stringify(perClientArr),
      per_store: JSON.stringify(perStoreArr),
      per_country: JSON.stringify(perCountryArr),
      per_imprint: JSON.stringify(perImprintArr),
      per_vendor: JSON.stringify(perVendorArr),
      scan_complete: true,
      computed_at: new Date().toISOString()
    };

    await pool.query(
      `INSERT INTO entity_monthlyaggregate (id, data, created_date, updated_date)
       VALUES ($1, $2::jsonb, NOW(), NOW())
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_date = NOW()`,
      [aggRecord.id, JSON.stringify(aggRecord)]
    );
    console.log(`[CsvProcessor] Recomputed MonthlyAggregate for ${reportMonth} successfully`);
  } catch (err) {
    console.error(`[CsvProcessor] Failed to recompute MonthlyAggregate for ${reportMonth}:`, err.message);
  }
}
