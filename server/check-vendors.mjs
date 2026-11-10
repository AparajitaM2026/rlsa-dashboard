import { pool } from './pg-db.js';

const aggs = await pool.query(`SELECT data FROM entity_monthlyaggregate`);
console.log('Total MonthlyAggregates:', aggs.rows.length);

const vendorTotals = {};
for (const row of aggs.rows) {
  const d = row.data;
  let pv = typeof d.per_vendor === 'string' ? JSON.parse(d.per_vendor || '[]') : (d.per_vendor || []);
  pv.forEach(v => {
    if (!vendorTotals[v.key]) vendorTotals[v.key] = { gross: 0, units: 0, rows: 0 };
    vendorTotals[v.key].gross += Number(v.gross) || 0;
    vendorTotals[v.key].units += Number(v.units) || 0;
    vendorTotals[v.key].rows += Number(v.rows) || 0;
  });
}
console.log('Vendor Breakdown in our DB:', vendorTotals);

await pool.end();
