import { createClient } from '@base44/sdk';
import { Pool } from 'pg';

const NEON_URL = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_Ae8UCthEPc4v@ep-autumn-star-b5tqcybh-pooler.c-7.us-east-2.aws.neon.tech/neondb?sslmode=require';
const pool = new Pool({
  connectionString: NEON_URL,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  const client = createClient({
    appId: '6a61bd121042205c7e94e102',
    serverUrl: 'https://ottmconnect.com',
    appBaseUrl: 'https://ottmconnect.com',
    requiresAuth: false
  });

  const email = process.env.SYNC_USER_EMAIL || 'user@example.com';
  const password = process.env.SYNC_USER_PASSWORD || 'password';
  console.log('Logging in to live ottmconnect.com...');
  const authRes = await client.auth.loginViaEmailPassword(email, password);
  const user = authRes.user;
  console.log('Logged in! User ID:', user.id, 'Role:', user.role, 'Access Role:', user.access_role, 'Party ID:', user.party_id);

  // Save this user into Neon DB
  const pgClient = await pool.connect();
  try {
    const userToSave = {
      ...user,
      password: password,
      name: user.full_name || 'User'
    };
    await pgClient.query(`
      INSERT INTO "entity_user" (id, data, created_date, updated_date)
      VALUES ($1, $2::jsonb, NOW(), NOW())
      ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_date = NOW();
    `, [userToSave.id, JSON.stringify(userToSave)]);

    const entities = [
      'Party', 'ClientAccount', 'Release', 'SubLabel',
      'LabelMapping', 'ArtistMapping', 'MonthlyAggregate',
      'Payout', 'ActivityLog', 'SupportTicket', 'TicketMessage',
      'Vendor'
    ];

    for (const ent of entities) {
      try {
        if (!client.entities[ent]) continue;
        const records = await client.entities[ent].list('-created_date', 500);
        console.log(`[Entity] ${ent}: Fetched ${records.length} records`);

        const tbl = `entity_${ent.toLowerCase()}`;
        for (const item of records) {
          await pgClient.query(`
            INSERT INTO "${tbl}" (id, data, created_date, updated_date)
            VALUES ($1, $2::jsonb, NOW(), NOW())
            ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_date = NOW();
          `, [item.id, JSON.stringify(item)]);
        }
      } catch (err) {
        console.log(`[Entity] ${ent} error:`, err.message);
      }
    }

    // Also call listPartyUsers
    try {
      const partyUsersRes = await client.functions.invoke('listPartyUsers', {});
      console.log('listPartyUsers result:', partyUsersRes);
      if (partyUsersRes?.data?.users) {
        for (const u of partyUsersRes.data.users) {
          await pgClient.query(`
            INSERT INTO "entity_user" (id, data, created_date, updated_date)
            VALUES ($1, $2::jsonb, NOW(), NOW())
            ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_date = NOW();
          `, [u.id, JSON.stringify(u)]);
        }
      }
    } catch (e) {
      console.log('listPartyUsers error:', e.message);
    }

  } finally {
    pgClient.release();
    await pool.end();
  }

  console.log('Done syncing live sumana session to Neon database!');
}

run().catch(console.error);
