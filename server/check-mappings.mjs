import { pool } from './pg-db.js';

// Check Demo Music Holdings and its accounts & imprints
const dmh = await pool.query(`SELECT id, data FROM entity_clientaccount WHERE (data->>'client_name') ILIKE '%demo%' OR (data->>'client_name') ILIKE '%jrn%'`);
console.log('Demo/JRN Client Accounts:');
dmh.rows.forEach(r => console.log(r.id, r.data.client_name, 'party:', r.data.party_id));

// Check label mappings
const lms = await pool.query(`SELECT data FROM entity_labelmapping`);
console.log('\nTotal Label Mappings:', lms.rows.length);
const mappedImprints = new Set(lms.rows.map(r => r.data.raw_imprint));
console.log('Mapped imprints sample:', Array.from(mappedImprints).slice(0, 15));

// Check which ClientAccounts are in LabelMapping
const cidMap = new Map();
lms.rows.forEach(r => {
  const cid = r.data.client_account_id;
  cidMap.set(cid, (cidMap.get(cid) || 0) + 1);
});
console.log('\nClient accounts with mappings count:', cidMap.size);

// Look at some client accounts that have mappings
const sampleCids = Array.from(cidMap.keys()).slice(0, 5);
const cas = await pool.query(`SELECT id, data->>'client_name' as name, data->>'party_id' as party_id FROM entity_clientaccount WHERE id = ANY($1)`, [sampleCids]);
console.log('Sample mapped accounts:', cas.rows);

// Check Sumana's accounts (party 6ac5faafb0b3371e62e9bf63)
const sumanaCas = await pool.query(`SELECT id, data->>'client_name' as name, data->>'party_id' as party_id FROM entity_clientaccount WHERE (data->>'party_id') = '6ac5faafb0b3371e62e9bf63'`);
console.log('\nSumana Party Accounts:', sumanaCas.rows);

// What imprints are mapped to Sumana's party accounts?
const sumanaCids = sumanaCas.rows.map(r => r.id);
const sumanaLms = await pool.query(`SELECT data FROM entity_labelmapping WHERE (data->>'client_account_id') = ANY($1)`, [sumanaCids]);
console.log('Sumana Label Mappings:', sumanaLms.rows.map(r => ({ cid: r.data.client_account_id, imprint: r.data.raw_imprint })));

await pool.end();
