import { pool } from './pg-db.js';

const res = await pool.query(`SELECT data->>'email' as email, data->>'password' as pw, data->>'access_role' as role FROM entity_user WHERE (data->>'access_role') = 'SUPER_ADMIN'`);
console.log('=== SUPER ADMIN CREDENTIALS ===');
res.rows.forEach(r => console.log(`Email: ${r.email} | Password: ${r.pw} | Role: ${r.role}`));
await pool.end();
