import { Pool } from 'pg';

const NEON_URL = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_Ae8UCthEPc4v@ep-autumn-star-b5tqcybh-pooler.c-7.us-east-2.aws.neon.tech/neondb?sslmode=require';
const LIVE_URL = 'https://ottmconnect.com';

const pool = new Pool({
  connectionString: NEON_URL,
  ssl: { rejectUnauthorized: false }
});

async function main() {
  const client = await pool.connect();
  try {
    console.log('--- Fetching Statement Periods ---');
    const periodsRes = await fetch(`${LIVE_URL}/api/functions/getStatementPeriods`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}'
    });
    const { periods } = await periodsRes.json();
    console.log('Found periods:', periods);

    const clientMap = new Map();
    const imprintMap = new Map();

    for (const p of periods) {
      console.log('Harvesting aggregate for period:', p);
      try {
        const aggRes = await fetch(`${LIVE_URL}/api/functions/aggregateRevenue`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ report_month: p })
        });
        if (!aggRes.ok) {
          console.warn(`Failed period ${p}: HTTP ${aggRes.status}`);
          continue;
        }
        const aggData = await aggRes.json();

        // Collect imprints & clients
        for (const imp of (aggData.perImprint || [])) {
          if (!imprintMap.has(imp.key)) {
            imprintMap.set(imp.key, {
              name: imp.key,
              is_house: !!imp.is_house,
              units: imp.units,
              gross: imp.gross
            });
          }
        }

        for (const cl of (aggData.perClient || [])) {
          if (cl.client_account_id && !clientMap.has(cl.client_account_id)) {
            clientMap.set(cl.client_account_id, {
              id: cl.client_account_id,
              gross: cl.gross,
              units: cl.units
            });
          }
        }

        // Store in entity_monthlyaggregate
        const aggRecord = {
          id: `agg_${p}`,
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

        await client.query(`
          INSERT INTO "entity_monthlyaggregate" (id, data, created_date, updated_date)
          VALUES ($1, $2::jsonb, NOW(), NOW())
          ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_date = NOW();
        `, [aggRecord.id, JSON.stringify(aggRecord)]);
        console.log(`Saved aggregate for period: ${p}`);
      } catch (err) {
        console.error(`Error processing period ${p}:`, err.message);
      }
    }

    console.log(`Discovered ${imprintMap.size} unique imprints, ${clientMap.size} clients`);

    // Create ClientAccount & LabelMapping records in Neon for discovered imprints
    let idx = 1;
    for (const [impName, meta] of imprintMap.entries()) {
      const clientId = `ca_${idx.toString().padStart(3, '0')}`;
      const clientRecord = {
        id: clientId,
        client_name: impName,
        contact_email: `${impName.toLowerCase().replace(/[^a-z0-9]/g, '')}@ottm.com`,
        revenue_share_pct: meta.is_house ? 100 : 85,
        is_house_account: meta.is_house,
        status: 'active',
        notify_payouts: true,
        notify_monthly_report: true,
        notify_unmapped: false,
        created_date: new Date().toISOString(),
        updated_date: new Date().toISOString()
      };

      await client.query(`
        INSERT INTO "entity_clientaccount" (id, data, created_date, updated_date)
        VALUES ($1, $2::jsonb, NOW(), NOW())
        ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_date = NOW();
      `, [clientRecord.id, JSON.stringify(clientRecord)]);

      const mappingRecord = {
        id: `lm_${idx.toString().padStart(3, '0')}`,
        raw_imprint: impName,
        client_account_id: clientId,
        created_date: new Date().toISOString(),
        updated_date: new Date().toISOString()
      };
      await client.query(`
        INSERT INTO "entity_labelmapping" (id, data, created_date, updated_date)
        VALUES ($1, $2::jsonb, NOW(), NOW())
        ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_date = NOW();
      `, [mappingRecord.id, JSON.stringify(mappingRecord)]);

      idx++;
    }

    // Default Party
    const defaultParty = {
      id: 'party_ott_solutions_01',
      name: 'OTT Solutions',
      code: 'OTT',
      status: 'active',
      created_date: new Date().toISOString(),
      updated_date: new Date().toISOString()
    };
    await client.query(`
      INSERT INTO "entity_party" (id, data, created_date, updated_date)
      VALUES ($1, $2::jsonb, NOW(), NOW())
      ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_date = NOW();
    `, [defaultParty.id, JSON.stringify(defaultParty)]);

    // Ensure users
    const users = [
      {
        id: 'user_admin_001',
        email: 'admin@ottm.com',
        password: 'admin123',
        name: 'Admin User',
        role: 'admin',
        access_role: 'SUPER_ADMIN',
        party_id: 'party_ott_solutions_01',
        created_date: new Date().toISOString()
      },
      {
        id: 'user_aparajita',
        email: 'aparajita@ottsol.com',
        password: 'admin123',
        name: 'Aparajita M',
        role: 'admin',
        access_role: 'SUPER_ADMIN',
        party_id: 'party_ott_solutions_01',
        created_date: new Date().toISOString()
      },
      {
        id: 'user_client_001',
        email: 'client@ottm.com',
        password: 'client123',
        name: 'Label Partner Client',
        role: 'user',
        access_role: 'CLIENT_USER',
        party_id: 'party_ott_solutions_01',
        client_account_id: 'ca_001',
        created_date: new Date().toISOString()
      }
    ];

    for (const u of users) {
      await client.query(`
        INSERT INTO "entity_user" (id, data, created_date, updated_date)
        VALUES ($1, $2::jsonb, NOW(), NOW())
        ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_date = NOW();
      `, [u.id, JSON.stringify(u)]);
    }

    // Add sample releases & sublabels for new modules
    const releases = [
      {
        id: 'rel_001',
        title: 'Monsoon Raga',
        artist: 'Various Artists',
        upc: '8901234567890',
        release_date: '2026-01-15',
        status: 'published',
        imprint: 'OTT SOLUTIONS PRIVATE LIMITED',
        created_date: new Date().toISOString(),
        updated_date: new Date().toISOString()
      },
      {
        id: 'rel_002',
        title: 'Soul Acoustic Vol 1',
        artist: 'Arijit Singh Remix',
        upc: '8901234567891',
        release_date: '2026-02-01',
        status: 'published',
        imprint: 'DC MUSIC',
        created_date: new Date().toISOString(),
        updated_date: new Date().toISOString()
      }
    ];

    for (const rel of releases) {
      await client.query(`
        INSERT INTO "entity_release" (id, data, created_date, updated_date)
        VALUES ($1, $2::jsonb, NOW(), NOW())
        ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_date = NOW();
      `, [rel.id, JSON.stringify(rel)]);
    }

    // Add payouts for statements
    const payouts = [
      {
        id: 'pay_001',
        client_account_id: 'ca_002',
        amount: 355.60,
        period: '2026-01',
        payment_date: '2026-02-15T00:00:00.000Z',
        status: 'paid',
        payment_method: 'Bank Wire',
        reference_number: 'TXN-98234-OTTM',
        created_date: new Date().toISOString(),
        updated_date: new Date().toISOString()
      },
      {
        id: 'pay_002',
        client_account_id: 'ca_003',
        amount: 179.78,
        period: '2026-01',
        payment_date: '2026-02-15T00:00:00.000Z',
        status: 'processing',
        payment_method: 'Bank Wire',
        reference_number: 'TXN-98235-OTTM',
        created_date: new Date().toISOString(),
        updated_date: new Date().toISOString()
      }
    ];

    for (const pay of payouts) {
      await client.query(`
        INSERT INTO "entity_payout" (id, data, created_date, updated_date)
        VALUES ($1, $2::jsonb, NOW(), NOW())
        ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_date = NOW();
      `, [pay.id, JSON.stringify(pay)]);
    }

    console.log('✓ All harvested entities populated successfully into Neon PostgreSQL!');
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
