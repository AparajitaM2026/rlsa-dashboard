// Deep check MonthlyAggregate per_client structure
import { pool } from './pg-db.js';

const res = await pool.query(`SELECT data FROM entity_monthlyaggregate WHERE (data->>'report_month') = '2026-07'`);
const agg = res.rows[0].data;
console.log('Keys:', Object.keys(agg));
console.log('per_client type:', typeof agg.per_client);
console.log('per_client (raw first 300 chars):', JSON.stringify(agg.per_client).substring(0, 300));

// Try parsing
let pc = agg.per_client;
if (typeof pc === 'string') {
  pc = JSON.parse(pc);
}
console.log('\nper_client is array:', Array.isArray(pc));
console.log('per_client length:', pc.length);
console.log('First 2 entries:', JSON.stringify(pc.slice(0,2), null, 2));

await pool.end();
