import { db } from './pg-db.js';

console.log('Testing Release queries:');
const rels = await db.list('Release');
console.log('1. db.list Release count:', rels.length);

const testId = 'clientaccount_1793436306188_klwik';
const f1 = await db.filter('Release', { client_account_id: testId });
console.log('2. db.filter direct match:', f1.length);

const f2 = await db.filter('Release', { client_account_id: { $in: [testId] } });
console.log('3. db.filter $in match:', f2.length);

await db.pool.end();
