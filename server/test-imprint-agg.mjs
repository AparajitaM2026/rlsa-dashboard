import { pool } from './pg-db.js';

const accountIds = ['6a6c6cff3f35cc52d824ad23'];

// Step 1: get imprints mapped to these accounts
const lmRes = await pool.query(
  `SELECT data->>'raw_imprint' as imprint FROM entity_labelmapping WHERE (data->>'client_account_id') = ANY($1)`,
  [accountIds]
);
const imprints = lmRes.rows.map(r => r.imprint).filter(Boolean);
console.log('Imprints for account:', imprints);

// Step 2: Query MonthlyAggregate directly with per_imprint!
const aggregates = await pool.query(`SELECT data FROM entity_monthlyaggregate ORDER BY (data->>'report_month') DESC`);
console.log('Aggregates count:', aggregates.rows.length);

let totalGross = 0;
let totalUnits = 0;
const monthly = [];

for (const row of aggregates.rows) {
  const agg = row.data;
  let pi = typeof agg.per_imprint === 'string' ? JSON.parse(agg.per_imprint || '[]') : (agg.per_imprint || []);
  
  // Find matches
  let monthGross = 0;
  let monthUnits = 0;
  for (const item of pi) {
    if (imprints.some(imp => imp.toLowerCase() === item.key.toLowerCase())) {
      monthGross += Number(item.gross) || 0;
      monthUnits += Number(item.units) || 0;
    }
  }

  if (monthGross > 0 || monthUnits > 0) {
    totalGross += monthGross;
    totalUnits += monthUnits;
    monthly.push({
      month: agg.report_month,
      gross: monthGross,
      units: monthUnits
    });
  }
}

console.log('Total gross:', totalGross);
console.log('Total units:', totalUnits);
console.log('Monthly breakdown:', monthly);

await pool.end();
