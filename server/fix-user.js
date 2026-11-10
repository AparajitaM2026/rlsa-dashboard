import { Pool } from 'pg';

const NEON_URL = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_Ae8UCthEPc4v@ep-autumn-star-b5tqcybh-pooler.c-7.us-east-2.aws.neon.tech/neondb?sslmode=require';
const pool = new Pool({
  connectionString: NEON_URL,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  const partyRecord = {
    id: '6ac5faafb0b3371e62e9bf63',
    name: 'OTT Solutions',
    code: 'OTT',
    status: 'active'
  };
  await pool.query(`
    INSERT INTO entity_party (id, data, created_date, updated_date)
    VALUES ($1, $2::jsonb, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data;
  `, [partyRecord.id, JSON.stringify(partyRecord)]);

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
  await pool.query(`
    INSERT INTO entity_user (id, data, created_date, updated_date)
    VALUES ($1, $2::jsonb, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data;
  `, [sumana.id, JSON.stringify(sumana)]);

  console.log('Successfully updated party and Sumana in Neon DB!');
  await pool.end();
}

run().catch(console.error);
