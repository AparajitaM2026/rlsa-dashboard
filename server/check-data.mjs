// Check actual payout and revenue data structure in DB
import { pool } from './pg-db.js';

console.log('\n=== PAYOUT SAMPLE DATA ===');
const payouts = await pool.query(`SELECT data FROM entity_payout LIMIT 5`);
for (const p of payouts.rows) {
  console.log(JSON.stringify(p.data, null, 2));
}

console.log('\n=== MONTHLYAGGREGATE SAMPLE ===');
const aggs = await pool.query(`SELECT data FROM entity_monthlyaggregate ORDER BY (data->>'report_month') DESC LIMIT 3`);
for (const a of aggs.rows) {
  const d = a.data;
  console.log(`Month: ${d.report_month}, total_gross: ${d.total_gross}, per_client count: ${(d.per_client||[]).length}`);
  if (d.per_client && d.per_client.length > 0) {
    console.log('  Sample per_client:', JSON.stringify(d.per_client[0]));
  }
}

console.log('\n=== LABELMAPPING SAMPLE (first 3) ===');
const lms = await pool.query(`SELECT data FROM entity_labelmapping LIMIT 3`);
for (const l of lms.rows) {
  console.log(JSON.stringify(l.data, null, 2));
}

console.log('\n=== CLIENTACCOUNT SAMPLE (party-linked) ===');
const cas = await pool.query(`SELECT data FROM entity_clientaccount WHERE (data->>'party_id') IS NOT NULL LIMIT 5`);
for (const c of cas.rows) {
  console.log(`${c.data.client_name} | party: ${c.data.party_id} | share: ${c.data.revenue_share_pct}`);
}

await pool.end();
