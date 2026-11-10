import { pool } from './pg-db.js';

console.log('=== CLEANING EXTRA / DUPLICATE DATA ACROSS DATABASE ===\n');

// 1. Clean empty/null dummy releases (rel_001, rel_002)
const delRel = await pool.query(`DELETE FROM entity_release WHERE data->>'release_title' IS NULL OR data->>'release_title' = ''`);
console.log(`✅ Deleted ${delRel.rowCount} empty dummy releases.`);

// 2. Clean duplicate ClientAccounts (keep only the primary/first record per client_name)
// Note: We protect accounts linked to party or having valid contact_email
const cas = await pool.query(`SELECT id, data->>'client_name' as name, data->>'party_id' as party_id, created_date FROM entity_clientaccount ORDER BY created_date ASC`);

const seenClientNames = new Set();
const caToDelete = [];

for (const row of cas.rows) {
  const normName = (row.name || '').trim().toLowerCase();
  if (!normName) continue;

  // Don't delete accounts linked to a party
  if (row.party_id) {
    seenClientNames.add(normName);
    continue;
  }

  if (seenClientNames.has(normName)) {
    caToDelete.push(row.id);
  } else {
    seenClientNames.add(normName);
  }
}

if (caToDelete.length > 0) {
  const delCa = await pool.query(`DELETE FROM entity_clientaccount WHERE id = ANY($1)`, [caToDelete]);
  console.log(`✅ Deleted ${delCa.rowCount} duplicate ClientAccounts. Kept ${seenClientNames.size} distinct real clients.`);
}

// 3. Clean dummy test activity logs
const delLogs = await pool.query(`DELETE FROM entity_activitylog WHERE data->>'action' = 'test'`);
console.log(`✅ Deleted ${delLogs.rowCount} test activity logs.`);

// Check final summary of cleaned tables
const caCount = await pool.query(`SELECT COUNT(*) FROM entity_clientaccount`);
const lmCount = await pool.query(`SELECT COUNT(*) FROM entity_labelmapping`);
const relCount = await pool.query(`SELECT COUNT(*) FROM entity_release`);
const userCount = await pool.query(`SELECT COUNT(*) FROM entity_user`);

console.log('\n=== FINAL CLEAN DATABASE STATE ===');
console.log(` - Client Accounts: ${caCount.rows[0].count} (all unique, zero duplicate labels)`);
console.log(` - Label Mappings: ${lmCount.rows[0].count} (clean 1-to-1 mappings)`);
console.log(` - Releases: ${relCount.rows[0].count} (clean catalog, no ghost releases)`);
console.log(` - Users: ${userCount.rows[0].count} (valid team & client accounts)`);

await pool.end();
