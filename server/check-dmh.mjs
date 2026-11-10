import { pool } from './pg-db.js';

// Let's check DEMO MUSIC HOLDINGS label mappings and payouts
const dmhLms = await pool.query(`SELECT data FROM entity_labelmapping WHERE (data->>'raw_imprint') ILIKE '%DEMO MUSIC HOLDINGS%'`);
console.log('DEMO MUSIC HOLDINGS mappings:', dmhLms.rows.map(r => r.data));

// Payouts for Demo Music Holdings:
const dmhPayouts = await pool.query(`SELECT data FROM entity_payout WHERE (data->>'client_account_id') = '6a6c6cff3f35cc52d824ad23'`);
console.log('\nDMH Payouts:', dmhPayouts.rows.map(r => ({ period: r.data.period, amount: r.data.payout_amount, gross: r.data.gross_revenue })));

// Let's check what imprints exist in MonthlyAggregate across all months
const aggs = await pool.query(`SELECT data->>'report_month' as month, data->'per_imprint' as imprints FROM entity_monthlyaggregate ORDER BY (data->>'report_month') DESC`);
console.log('\nCheck if DEMO MUSIC HOLDINGS is in per_imprint for any month:');
for (const row of aggs.rows) {
  let pi = typeof row.imprints === 'string' ? JSON.parse(row.imprints) : (row.imprints || []);
  const found = pi.find(x => x.key && x.key.toUpperCase().includes('DEMO MUSIC HOLDINGS'));
  if (found) {
    console.log(`  ${row.month}: gross=${found.gross}, units=${found.units}`);
  }
}

await pool.end();
