import { pool } from './pg-db.js';

const users = await pool.query(`SELECT id, data FROM entity_user`);
for (const u of users.rows) {
  console.log(`User: ${u.data.email} | client_account_id: ${u.data.client_account_id} | party_id: ${u.data.party_id} | role: ${u.data.access_role}`);
}

const cas = await pool.query(`SELECT id, data->>'client_name' as name, data->>'contact_email' as email, data->>'party_id' as party FROM entity_clientaccount WHERE id = 'clientaccount_1793436306188_klwik'`);
console.log('\nTarget Account for Ahana:', cas.rows);

await pool.end();
