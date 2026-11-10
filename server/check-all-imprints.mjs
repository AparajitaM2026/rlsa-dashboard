import { pool } from './pg-db.js';

// Let's check all ClientAccounts
const cas = await pool.query(`SELECT id, data->>'client_name' as name, data->>'party_id' as party_id FROM entity_clientaccount`);
console.log('Total ClientAccounts:', cas.rows.length);

// Get distinct imprints from MonthlyAggregate
const aggs = await pool.query(`SELECT data->'per_imprint' as imprints FROM entity_monthlyaggregate`);
const distinctImprints = new Set();
for (const row of aggs.rows) {
  let pi = typeof row.imprints === 'string' ? JSON.parse(row.imprints || '[]') : (row.imprints || []);
  pi.forEach(i => distinctImprints.add(i.key));
}
console.log('Distinct imprints in MonthlyAggregate:', distinctImprints.size);

// Check how many match ClientAccount name directly
let directMatches = 0;
const matched = [];
for (const imp of distinctImprints) {
  const ca = cas.rows.find(c => c.name && c.name.trim().toLowerCase() === imp.trim().toLowerCase());
  if (ca) {
    directMatches++;
    matched.push({ imprint: imp, caId: ca.id, caName: ca.name });
  }
}
console.log('Direct imprint to ClientAccount matches:', directMatches);
console.log('Sample matches:', matched.slice(0, 10));

// Also let's check current label mappings:
const lms = await pool.query(`SELECT data->>'raw_imprint' as imprint, data->>'client_account_id' as caId FROM entity_labelmapping`);
console.log('Total Label Mappings in DB:', lms.rows.length);

await pool.end();
