import { pool } from './pg-db.js';

console.log('=== CHECKING USERS, PARTIES & LABEL MAPPINGS ===\n');

const users = await pool.query(`SELECT id, data FROM entity_user`);
console.log('Users:');
for (const u of users.rows) {
  console.log(` - ${u.data.email} | Role: ${u.data.access_role} | Party: ${u.data.party_id}`);
}

const parties = await pool.query(`SELECT id, data FROM entity_party`);
console.log('\nParties:');
for (const p of parties.rows) {
  console.log(` - ${p.id} | Name: ${p.data.name}`);
}

const cas = await pool.query(`SELECT id, data->>'client_name' as name, data->>'party_id' as party FROM entity_clientaccount`);
console.log('\nClient Accounts:');
for (const c of cas.rows) {
  console.log(` - [${c.id}] ${c.name} | party: ${c.party}`);
}

const lms = await pool.query(`SELECT id, data->>'raw_imprint' as imp, data->>'client_account_id' as ca, data->>'party_id' as party FROM entity_labelmapping`);
console.log('\nLabel Mappings:');
for (const l of lms.rows) {
  console.log(` - ${l.imp} -> CA: ${l.ca} | Party: ${l.party}`);
}

await pool.end();
