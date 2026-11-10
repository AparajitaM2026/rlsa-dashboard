import { pool } from './pg-db.js';

async function syncSumana() {
  const sumana = {
    id: '6a6c6e500ddc61654fd832d1',
    email: 'sumana@ottsol.com',
    password: process.env.USER_PASSWORD || 'password123',
    name: 'Sumana',
    full_name: 'Sumana',
    role: 'user',
    access_role: 'PARTY_ADMIN',
    party_id: '6ac5faafb0b3371e62e9bf63',
    is_verified: true
  };
  await pool.query(
    'INSERT INTO entity_user (id, data, created_date, updated_date) VALUES ($1, $2::jsonb, NOW(), NOW()) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data;',
    [sumana.id, JSON.stringify(sumana)]
  );

  const party = {
    id: '6ac5faafb0b3371e62e9bf63',
    name: 'OTT Solutions',
    code: 'OTT',
    status: 'active'
  };
  await pool.query(
    'INSERT INTO entity_party (id, data, created_date, updated_date) VALUES ($1, $2::jsonb, NOW(), NOW()) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data;',
    [party.id, JSON.stringify(party)]
  );

  console.log('Successfully saved sumana & party in Neon!');
  await pool.end();
}

syncSumana().catch(console.error);
