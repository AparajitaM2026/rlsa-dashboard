import { pool } from './pg-db.js';

console.log('=== Checking DMH Mapping ===');
// We need to map 'DEMO MUSIC HOLDINGS' to '6a6c6cff3f35cc52d824ad23' (Demo Music Holdings main account)
const existing = await pool.query(`SELECT id FROM entity_labelmapping WHERE (data->>'raw_imprint') ILIKE '%DEMO MUSIC HOLDINGS%' AND (data->>'client_account_id') = '6a6c6cff3f35cc52d824ad23'`);
if (existing.rows.length === 0) {
  const newMapping = {
    id: 'lm_dmh_main_6a6c6cff3f35cc52d824ad23',
    raw_imprint: 'DEMO MUSIC HOLDINGS',
    client_account_id: '6a6c6cff3f35cc52d824ad23',
    created_date: new Date().toISOString()
  };
  await pool.query(`INSERT INTO entity_labelmapping (id, data, created_date, updated_date) VALUES ($1, $2::jsonb, NOW(), NOW()) ON CONFLICT (id) DO NOTHING`, [newMapping.id, JSON.stringify(newMapping)]);
  console.log('Added DEMO MUSIC HOLDINGS mapping for 6a6c6cff3f35cc52d824ad23');
} else {
  console.log('Mapping already exists');
}

// Also map OTT SOLUTIONS PRIVATE LIMITED and OTT Arabia
const ottArabia = await pool.query(`SELECT id FROM entity_labelmapping WHERE (data->>'raw_imprint') ILIKE '%OTT Arabia%' AND (data->>'client_account_id') = 'ca_001'`);
console.log('OTT Arabia mappings:', ottArabia.rows.length);

await pool.end();
