import { Pool } from 'pg';

const NEON_URL = process.env.DATABASE_URL || 'postgresql://neondb_owner:npg_Ae8UCthEPc4v@ep-autumn-star-b5tqcybh-pooler.c-7.us-east-2.aws.neon.tech/neondb?sslmode=require';

export const pool = new Pool({
  connectionString: NEON_URL,
  ssl: { rejectUnauthorized: false }
});

const TABLES = [
  'ClientAccount',
  'User',
  'Vendor',
  'MonthlyFxRate',
  'LabelMapping',
  'ArtistMapping',
  'MonthlyAggregate',
  'Payout',
  'RevenueRow',
  'Release',
  'Party',
  'SubLabel',
  'CsvUploadJob',
  'CatalogSearchJob',
  'ActivityLog',
  'SupportTicket',
  'TicketMessage'
];

export async function initSchema() {
  console.log('Connecting to Neon PostgreSQL to initialize schema...');
  const client = await pool.connect();
  try {
    for (const tableName of TABLES) {
      const sqlTableName = `entity_${tableName.toLowerCase()}`;
      await client.query(`
        CREATE TABLE IF NOT EXISTS "${sqlTableName}" (
          id TEXT PRIMARY KEY,
          data JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_date TIMESTAMPTZ DEFAULT NOW(),
          updated_date TIMESTAMPTZ DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS "idx_${sqlTableName}_data" ON "${sqlTableName}" USING GIN (data);
        CREATE INDEX IF NOT EXISTS "idx_${sqlTableName}_created" ON "${sqlTableName}" (created_date DESC);
      `);
      console.log(`✓ Table ready: ${sqlTableName}`);
    }
    console.log('🎉 All Neon PostgreSQL tables and GIN indices initialized successfully!');
  } finally {
    client.release();
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`.replace(/\\/g, '/')) {
  initSchema().then(() => pool.end());
}
