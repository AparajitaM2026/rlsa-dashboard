import { pool } from './pg-db.js';

const res = await pool.query(`SELECT id, data->>'raw_imprint' as imp, data->>'client_account_id' as ca FROM entity_labelmapping`);
console.log('Total mappings in DB:', res.rows.length);

const map = {};
res.rows.forEach(r => {
  map[r.imp] = (map[r.imp] || 0) + 1;
});

const duplicates = Object.entries(map).filter(([k, v]) => v > 1);
console.log('\nDuplicate imprints count:', duplicates.length);
console.log('Sample duplicates:', duplicates.slice(0, 10));

await pool.end();
