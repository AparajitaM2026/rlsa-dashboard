import { createClient } from '@base44/sdk';
import { pool } from './pg-db.js';

async function syncAllSumanaData() {
  const client = createClient({
    appId: '6a61bd121042205c7e94e102',
    serverUrl: 'https://ottmconnect.com',
    appBaseUrl: 'https://ottmconnect.com',
    requiresAuth: false
  });
  const email = process.env.SYNC_USER_EMAIL || 'user@example.com';
  const password = process.env.SYNC_USER_PASSWORD || 'password';
  await client.auth.loginViaEmailPassword(email, password);
  
  const periods = ['all', '2026-07', '2026-06', '2026-05', '2026-04', '2026-03', '2026-02', '2026-01', '2025-12'];
  const accountIds = ['6ac89e9fb9caf5ecdd7ca891', '6ac89dab352df83a4ecc36b4', '6ac626d17a2bca2252b802ca', '6a6c6cff3f35cc52d824ad23'];

  // Table to store client aggregate cache
  await pool.query(
    'CREATE TABLE IF NOT EXISTS entity_clientaggregate_cache (id TEXT PRIMARY KEY, data JSONB, updated_date TIMESTAMPTZ DEFAULT NOW());'
  );

  for (const p of periods) {
    console.log('Fetching live aggregate for period:', p);
    try {
      const res = await client.functions.invoke('aggregateClientRevenue', {
        client_account_ids: accountIds,
        period: p
      });
      if (res?.data) {
        await pool.query(
          'INSERT INTO entity_clientaggregate_cache (id, data, updated_date) VALUES ($1, $2::jsonb, NOW()) ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_date = NOW();',
          ['client_agg_' + p, JSON.stringify(res.data)]
        );
        console.log('Saved period', p);
      }
    } catch (e) {
      console.error('Error for period', p, e.message);
    }
  }

  console.log('Finished saving all Sumana client aggregates to Neon!');
  await pool.end();
}

syncAllSumanaData().catch(console.error);
