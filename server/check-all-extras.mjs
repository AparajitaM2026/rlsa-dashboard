import { pool } from './pg-db.js';

console.log('=== CHECKING ALL ENTITY TABLES FOR UNNECESSARY OR DUMMY DATA ===\n');

// 1. Check Releases
const rels = await pool.query(`SELECT id, data->>'release_title' as title, data->>'source' as src, created_date FROM entity_release`);
console.log('Releases count:', rels.rows.length);
for (const r of rels.rows) {
  console.log('  Release:', r.id, '| Title:', r.title, '| Source:', r.src);
}

// 2. Check ClientAccounts
const cas = await pool.query(`SELECT COUNT(*) FROM entity_clientaccount`);
console.log('\nClientAccounts count:', cas.rows[0].count);

// Check if there are duplicate ClientAccounts by client_name
const caDups = await pool.query(`
  SELECT data->>'client_name' as name, COUNT(*) as cnt 
  FROM entity_clientaccount 
  GROUP BY data->>'client_name' 
  HAVING COUNT(*) > 1 
  ORDER BY COUNT(*) DESC
`);
console.log('Duplicate ClientAccount names count:', caDups.rows.length);
console.log('Sample duplicate ClientAccounts:', caDups.rows.slice(0, 5));

// 3. Check Users
const users = await pool.query(`SELECT id, data->>'email' as email, data->>'access_role' as role FROM entity_user`);
console.log('\nUsers count:', users.rows.length);
for (const u of users.rows) {
  console.log('  User:', u.email, '| Role:', u.role);
}

await pool.end();
