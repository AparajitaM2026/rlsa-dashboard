import { pool } from './pg-db.js';

console.log('=== CHECKING REMAINING 29 LABEL MAPPINGS ===\n');

const res = await pool.query(`SELECT id, data->>'raw_imprint' as imprint, data->>'client_account_id' as ca_id FROM entity_labelmapping ORDER BY data->>'raw_imprint' ASC`);

// Check which imprints have revenue in MonthlyAggregate
const aggs = await pool.query(`SELECT data->'per_imprint' as imprints FROM entity_monthlyaggregate`);
const revImprints = new Set();
for (const row of aggs.rows) {
  let pi = typeof row.imprints === 'string' ? JSON.parse(row.imprints || '[]') : (row.imprints || []);
  pi.forEach(i => {
    if (i.key && (Number(i.gross) > 0 || Number(i.units) > 0)) {
      revImprints.add(i.key.trim().toLowerCase());
    }
  });
}

console.log(`Found ${res.rows.length} total mappings in DB.`);
console.log(`Active imprints with revenue in MonthlyAggregate: ${revImprints.size}\n`);

for (const row of res.rows) {
  const norm = (row.imprint || '').trim().toLowerCase();
  const hasRev = revImprints.has(norm);
  console.log(`ID: ${row.id.padEnd(35)} | Imprint: ${row.imprint.padEnd(35)} | Has Revenue: ${hasRev ? '✅ Yes' : '⚠️ No'}`);
}

await pool.end();
