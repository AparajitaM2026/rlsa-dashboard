import { pool } from './pg-db.js';

console.log('=== UPDATING PASSWORD FOR aparajita@ottsol.com ===');

// Update password in entity_user
const email = 'aparajita@ottsol.com';
const newPass = 'AdminUser2026!';

const res = await pool.query(`SELECT id, data FROM entity_user WHERE (data->>'email') = $1`, [email]);
if (res.rows.length > 0) {
  const user = res.rows[0];
  const updatedData = {
    ...user.data,
    password: newPass,
    access_role: 'SUPER_ADMIN',
    role: 'admin',
    updated_date: new Date().toISOString()
  };
  await pool.query(
    `UPDATE entity_user SET data = $1::jsonb, updated_date = NOW() WHERE id = $2`,
    [JSON.stringify(updatedData), user.id]
  );
  console.log(`✅ Successfully updated password for ${email} to "${newPass}".`);
  console.log(`Role: ${updatedData.access_role} (Full Super Admin access)`);
} else {
  console.log(`User ${email} not found.`);
}

await pool.end();
