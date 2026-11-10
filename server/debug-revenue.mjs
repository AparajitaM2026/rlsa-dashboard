// Debug revenue routing for ca_001
import { pool } from './pg-db.js';

// Get ca_001 account
const ca = await pool.query(`SELECT data FROM entity_clientaccount WHERE id = 'ca_001'`);
console.log('ca_001:', JSON.stringify(ca.rows[0]?.data));

// Get label mappings for ca_001
const lm = await pool.query(`SELECT data FROM entity_labelmapping WHERE (data->>'client_account_id') = 'ca_001'`);
console.log('\nLabelMappings for ca_001:', lm.rows.map(r => r.data.raw_imprint));

// Get all ca IDs from MonthlyAggregate per_client (2026-07)
const agg = await pool.query(`SELECT data FROM entity_monthlyaggregate WHERE (data->>'report_month') = '2026-07'`);
const d = agg.rows[0].data;
let pc = typeof d.per_client === 'string' ? JSON.parse(d.per_client) : d.per_client;
console.log('\nAll client_account_ids in per_client for 2026-07:');
pc.slice(0, 10).forEach(c => console.log(`  ${c.client_account_id}: gross=${c.gross}, units=${c.units}`));

// Check what client accounts these IDs correspond to
const ids = pc.slice(0, 5).map(c => c.client_account_id);
const caRes = await pool.query(`SELECT id, data->>'client_name' as name FROM entity_clientaccount WHERE id = ANY($1)`, [ids]);
console.log('\nMatching ClientAccounts:', caRes.rows);

// Check label mappings for these IDs
const lmRes = await pool.query(`SELECT data->>'client_account_id' as cid, data->>'raw_imprint' as imprint FROM entity_labelmapping WHERE (data->>'client_account_id') = ANY($1)`, [ids]);
console.log('\nLabelMappings for these IDs:', lmRes.rows.slice(0, 5));

// What does the OTT Arabia account look like?
const ott = await pool.query(`SELECT data FROM entity_clientaccount WHERE (data->>'client_name') ILIKE '%OTT Arabia%' LIMIT 3`);
console.log('\nOTT Arabia accounts:', ott.rows.map(r => ({ id: r.data.id, name: r.data.client_name })));

await pool.end();
