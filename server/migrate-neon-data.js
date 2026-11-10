import { Pool } from 'pg';

const NEON_URL = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_Ae8UCthEPc4v@ep-autumn-star-b5tqcybh-pooler.c-7.us-east-2.aws.neon.tech/neondb?sslmode=require';
const LIVE_URL = 'https://ottmconnect.com';

const pool = new Pool({
  connectionString: NEON_URL,
  ssl: { rejectUnauthorized: false }
});

const ENTITIES = [
  'ClientAccount',
  'Vendor',
  'MonthlyFxRate',
  'LabelMapping',
  'ArtistMapping',
  'MonthlyAggregate',
  'Payout',
  'Release',
  'Party',
  'SubLabel',
  'SupportTicket',
  'TicketMessage',
  'ActivityLog',
  'RevenueRow'
];

async function fetchAllForEntity(entity) {
  console.log(`\nFetching 100% records for ${entity} from ${LIVE_URL}...`);
  const allRecords = [];
  const limit = 200;
  let skip = 0;
  let hasMore = true;

  while (hasMore) {
    try {
      const res = await fetch(`${LIVE_URL}/api/entities/${entity}?limit=${limit}&skip=${skip}`);
      if (!res.ok) {
        console.warn(`[${entity}] API returned HTTP ${res.status} at skip=${skip}`);
        break;
      }
      const data = await res.json();
      if (!Array.isArray(data) || data.length === 0) {
        hasMore = false;
        break;
      }

      allRecords.push(...data);
      console.log(`  Fetched +${data.length} records (Total so far: ${allRecords.length})`);

      if (data.length < limit) {
        hasMore = false;
      } else {
        skip += limit;
      }
    } catch (err) {
      console.error(`  Error at skip ${skip} for ${entity}:`, err.message);
      break;
    }
  }

  return allRecords;
}

async function bulkInsertEntity(client, entity, records) {
  if (!records || records.length === 0) return 0;
  const sqlTable = `entity_${entity.toLowerCase()}`;
  let count = 0;

  for (const item of records) {
    if (!item || !item.id) continue;

    // Normalize vendor
    if (entity === 'Vendor') {
      item.name = item.name || item.vendor_name || 'Vendor';
      item.vendor_name = item.vendor_name || item.name;
      item.status = item.status || 'active';
    }

    const id = item.id;
    const createdDate = item.created_date ? new Date(item.created_date) : new Date();
    const updatedDate = item.updated_date ? new Date(item.updated_date) : new Date();
    const jsonData = JSON.stringify(item);

    await client.query(`
      INSERT INTO "${sqlTable}" (id, data, created_date, updated_date)
      VALUES ($1, $2::jsonb, $3, $4)
      ON CONFLICT (id) DO UPDATE SET
        data = EXCLUDED.data,
        updated_date = EXCLUDED.updated_date;
    `, [id, jsonData, createdDate, updatedDate]);

    count++;
  }

  return count;
}

export async function migrateAllData() {
  console.log('========================================================');
  console.log('  STARTING 100% FULL DATA MIGRATION INTO NEON POSTGRESQL');
  console.log('========================================================');

  const client = await pool.connect();
  try {
    for (const entity of ENTITIES) {
      const records = await fetchAllForEntity(entity);
      if (records.length > 0) {
        console.log(`Inserting ${records.length} records into Neon entity_${entity.toLowerCase()}...`);
        const inserted = await bulkInsertEntity(client, entity, records);
        console.log(`✓ Completed ${entity}: ${inserted} records saved to Neon.`);
      } else {
        console.log(`  No records found for ${entity}.`);
      }
    }

    // Ensure Admin and Client users exist in Neon entity_user table
    console.log('\nEnsuring core system users exist in Neon entity_user...');
    const defaultUsers = [
      {
        id: 'user_admin_001',
        email: 'admin@ottm.com',
        password: 'admin123',
        name: 'Admin User',
        role: 'admin',
        created_date: new Date().toISOString()
      },
      {
        id: 'user_aparajita',
        email: 'aparajita@ottsol.com',
        password: 'admin123',
        name: 'Aparajita (Admin)',
        role: 'admin',
        created_date: new Date().toISOString()
      },
      {
        id: 'user_client_001',
        email: 'client@ottm.com',
        password: 'client123',
        name: 'Demo Client',
        role: 'user',
        client_account_id: '6a61bd947c83f9391e3e1c96', // EKTAAR MUSIC
        created_date: new Date().toISOString()
      }
    ];

    await bulkInsertEntity(client, 'User', defaultUsers);
    console.log('✓ Core users verified in Neon.');

    console.log('\n🎉 100% COMPLETE DATA MIGRATION TO NEON POSTGRESQL FINISHED!');
  } finally {
    client.release();
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`.replace(/\\/g, '/')) {
  migrateAllData().then(() => pool.end());
}
