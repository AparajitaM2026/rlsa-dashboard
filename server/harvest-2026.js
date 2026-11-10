import { Pool } from 'pg';

const NEON_URL = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_Ae8UCthEPc4v@ep-autumn-star-b5tqcybh-pooler.c-7.us-east-2.aws.neon.tech/neondb?sslmode=require';
const pool = new Pool({
  connectionString: NEON_URL,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  const periods = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07'];
  for (const p of periods) {
    try {
      console.log('Fetching:', p);
      const res = await fetch('https://ottmconnect.com/api/functions/aggregateRevenue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ report_month: p })
      });
      if (!res.ok) {
        console.log(p, 'failed HTTP', res.status);
        continue;
      }
      const aggData = await res.json();
      console.log(p, 'Success! Total rows:', aggData.totalRows, 'imprints:', aggData.perImprint?.length);

      const aggRecord = {
        id: 'agg_' + p,
        report_month: p,
        complete: aggData.complete ?? true,
        total_rows: aggData.totalRows ?? 0,
        house_gross: aggData.houseGross ?? 0,
        house_rows: aggData.houseRows ?? 0,
        house_units: aggData.houseUnits ?? 0,
        client_gross: aggData.clientGross ?? 0,
        client_rows: aggData.clientRows ?? 0,
        client_units: aggData.clientUnits ?? 0,
        unmapped_gross: aggData.unmappedGross ?? 0,
        unmapped_rows: aggData.unmappedRows ?? 0,
        unmapped_imprints: JSON.stringify(aggData.unmappedImprints || []),
        per_client: JSON.stringify(aggData.perClient || []),
        per_imprint: JSON.stringify(aggData.perImprint || []),
        per_store: JSON.stringify(aggData.perStore || []),
        per_country: JSON.stringify(aggData.perCountry || []),
        per_vendor: JSON.stringify(aggData.perVendor || [])
      };

      await pool.query(`
        INSERT INTO "entity_monthlyaggregate" (id, data, created_date, updated_date)
        VALUES ($1, $2::jsonb, NOW(), NOW())
        ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_date = NOW();
      `, [aggRecord.id, JSON.stringify(aggRecord)]);

      // Insert imprints
      let idx = 1;
      for (const imp of (aggData.perImprint || [])) {
        const clientId = 'ca_imp_' + p + '_' + idx;
        const cl = {
          id: clientId,
          client_name: imp.key,
          contact_email: imp.key.toLowerCase().replace(/[^a-z0-9]/g, '') + '@ottm.com',
          revenue_share_pct: imp.is_house ? 100 : 85,
          is_house_account: !!imp.is_house,
          status: 'active',
          created_date: new Date().toISOString()
        };
        await pool.query(`
          INSERT INTO "entity_clientaccount" (id, data, created_date, updated_date)
          VALUES ($1, $2::jsonb, NOW(), NOW())
          ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data;
        `, [cl.id, JSON.stringify(cl)]);

        await pool.query(`
          INSERT INTO "entity_labelmapping" (id, data, created_date, updated_date)
          VALUES ($1, $2::jsonb, NOW(), NOW())
          ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data;
        `, ['lm_' + clientId, JSON.stringify({ id: 'lm_' + clientId, raw_imprint: imp.key, client_account_id: clientId })]);
        idx++;
      }

    } catch(e) {
      console.error(p, e.message);
    }
    // Small delay between requests to not overwhelm endpoint
    await new Promise(r => setTimeout(r, 1500));
  }
  await pool.end();
}
run();
