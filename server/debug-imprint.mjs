// Check per_imprint structure in MonthlyAggregate
import { pool } from './pg-db.js';

const agg = await pool.query(`SELECT data FROM entity_monthlyaggregate WHERE (data->>'report_month') = '2026-07'`);
const d = agg.rows[0].data;

// Check per_imprint
let pi = typeof d.per_imprint === 'string' ? JSON.parse(d.per_imprint) : (d.per_imprint || []);
console.log('per_imprint count:', pi.length);
console.log('First 5 imprints:');
pi.slice(0, 5).forEach(i => console.log(`  ${i.key}: gross=${i.gross?.toFixed(2)}, units=${i.units}`));

// Check per_store
let ps = typeof d.per_store === 'string' ? JSON.parse(d.per_store) : (d.per_store || []);
console.log('\nper_store count:', ps.length);
console.log('Top 5 stores:');
ps.slice(0, 5).forEach(s => console.log(`  ${s.key}: gross=${s.gross?.toFixed(2)}, units=${s.units}`));

// Check per_country
let pc2 = typeof d.per_country === 'string' ? JSON.parse(d.per_country) : (d.per_country || []);
console.log('\nper_country count:', pc2.length);
console.log('Top 5 countries:');
pc2.slice(0, 5).forEach(c => console.log(`  ${c.key}: gross=${c.gross?.toFixed(2)}, units=${c.units}`));

// Total gross
let pc = typeof d.per_client === 'string' ? JSON.parse(d.per_client) : (d.per_client || []);
const totalGross = pc.reduce((sum, c) => sum + (c.gross || 0), 0);
console.log('\nTotal gross for 2026-07:', totalGross.toFixed(2));

// Check OTT Arabia imprint
const ottImprint = pi.find(i => i.key && i.key.toLowerCase().includes('ott arabia'));
console.log('\nOTT Arabia in per_imprint:', ottImprint);

// Check if 'OTT Arabia FZ LLC' matches any imprint key
const allImprintKeys = pi.map(i => i.key);
console.log('\nAll imprint keys (first 20):', allImprintKeys.slice(0, 20));

await pool.end();
