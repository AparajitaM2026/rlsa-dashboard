import { createClient } from '@base44/sdk';
import { pool } from './pg-db.js';

async function syncAllPayouts() {
  const client = createClient({
    appId: '6a61bd121042205c7e94e102',
    serverUrl: 'https://ottmconnect.com',
    appBaseUrl: 'https://ottmconnect.com',
    requiresAuth: false
  });

  const email = process.env.SYNC_USER_EMAIL || 'user@example.com';
  const password = process.env.SYNC_USER_PASSWORD || 'password';
  await client.auth.loginViaEmailPassword(email, password);
  const livePayouts = await client.entities.Payout.list('-created_date', 500);
  console.log(`Fetched ${livePayouts.length} live payouts from ottmconnect.com`);

  for (const p of livePayouts) {
    await pool.query(
      `INSERT INTO entity_payout (id, data, created_date, updated_date)
       VALUES ($1, $2::jsonb, $3, $4)
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_date = EXCLUDED.updated_date;`,
      [p.id, JSON.stringify(p), p.created_date || new Date().toISOString(), p.updated_date || new Date().toISOString()]
    );
  }

  console.log('✓ All live payouts successfully stored in Neon PostgreSQL!');
  await pool.end();
}

syncAllPayouts().catch(console.error);
