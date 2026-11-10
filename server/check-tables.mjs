import { pool } from './pg-db.js';

const res = await pool.query(`SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename`);
console.log('=== ALL TABLES IN NEON DB ===');
res.rows.forEach(r => console.log(' -', r.tablename));

// Check row counts for key tables
const tables = [
  'entity_user', 'entity_clientaccount', 'entity_party', 'entity_sublabel',
  'entity_release', 'entity_revenuerow', 'entity_monthlyaggregate',
  'entity_payout', 'entity_labelmapping', 'entity_activitylog',
  'entity_supportticket', 'entity_ticketmessage', 'entity_artistmapping',
  'entity_csvuploadjob', 'entity_catalogsearchjob', 'entity_monthlyfxrate',
  'entity_apikey'
];

console.log('\n=== ROW COUNTS ===');
for (const t of tables) {
  try {
    const cnt = await pool.query(`SELECT COUNT(*) FROM "${t}"`);
    console.log(` ${t}: ${cnt.rows[0].count} rows`);
  } catch (e) {
    console.log(` ${t}: MISSING (${e.message.split('\n')[0]})`);
  }
}

await pool.end();
