// Full DB Setup + Verification Script
// Creates missing tables, seeds missing data, verifies all connections

import { pool } from './pg-db.js';

const log = (msg) => console.log(msg);
const ok = (msg) => console.log('  ✅ ' + msg);
const warn = (msg) => console.log('  ⚠️  ' + msg);
const err = (msg) => console.log('  ❌ ' + msg);

log('\n============================================');
log('  OTTM Connect — Full DB Setup & Verification');
log('============================================\n');

// ─── 1. Create Missing Tables ─────────────────────────────────
log('📦 Step 1: Creating missing tables...');

const missingTables = [
  'entity_apikey',
  'entity_apiwebhook',
];

for (const table of missingTables) {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "${table}" (
        id TEXT PRIMARY KEY,
        data JSONB NOT NULL DEFAULT '{}',
        created_date TIMESTAMPTZ DEFAULT NOW(),
        updated_date TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    ok(`Created: ${table}`);
  } catch (e) {
    err(`Failed to create ${table}: ${e.message}`);
  }
}

// ─── 2. Seed API Key for JRN ──────────────────────────────────
log('\n🔑 Step 2: Seeding JRN API Key...');
try {
  const existingKey = await pool.query(
    `SELECT id FROM entity_apikey WHERE id = $1`,
    ['apikey_jrn_live_001']
  );
  if (existingKey.rows.length === 0) {
    await pool.query(`
      INSERT INTO entity_apikey (id, data, created_date, updated_date)
      VALUES ($1, $2::jsonb, NOW(), NOW())
      ON CONFLICT (id) DO NOTHING
    `, [
      'apikey_jrn_live_001',
      JSON.stringify({
        id: 'apikey_jrn_live_001',
        key: process.env.JRN_API_KEY || 'jrn_demo_key',
        name: 'JRN Platform Production Key',
        client_account_id: '6a6c6cff3f35cc52d824ad23',
        party_id: '6ac5faafb0b3371e62e9bf63',
        status: 'active',
        permissions: ['distribution:write', 'distribution:read', 'catalog:read', 'revenue:read', 'payouts:read'],
        created_date: new Date().toISOString()
      })
    ]);
    ok('JRN API key seeded in DB');
  } else {
    ok('JRN API key already exists');
  }
} catch (e) {
  err('API key seed failed: ' + e.message);
}

// ─── 3. Verify All Entities ───────────────────────────────────
log('\n📊 Step 3: Verifying all entity tables...');

const allEntities = [
  { table: 'entity_user', name: 'User' },
  { table: 'entity_clientaccount', name: 'ClientAccount' },
  { table: 'entity_party', name: 'Party' },
  { table: 'entity_sublabel', name: 'SubLabel' },
  { table: 'entity_release', name: 'Release' },
  { table: 'entity_revenuerow', name: 'RevenueRow' },
  { table: 'entity_monthlyaggregate', name: 'MonthlyAggregate' },
  { table: 'entity_payout', name: 'Payout' },
  { table: 'entity_labelmapping', name: 'LabelMapping' },
  { table: 'entity_activitylog', name: 'ActivityLog' },
  { table: 'entity_supportticket', name: 'SupportTicket' },
  { table: 'entity_ticketmessage', name: 'TicketMessage' },
  { table: 'entity_artistmapping', name: 'ArtistMapping' },
  { table: 'entity_csvuploadjob', name: 'CsvUploadJob' },
  { table: 'entity_catalogsearchjob', name: 'CatalogSearchJob' },
  { table: 'entity_monthlyfxrate', name: 'MonthlyFxRate' },
  { table: 'entity_apikey', name: 'ApiKey' },
  { table: 'entity_apiwebhook', name: 'ApiWebhook' },
  { table: 'entity_vendor', name: 'Vendor' },
];

for (const { table, name } of allEntities) {
  try {
    const res = await pool.query(`SELECT COUNT(*) FROM "${table}"`);
    ok(`${name} (${table}): ${res.rows[0].count} rows`);
  } catch (e) {
    err(`${name}: MISSING — ${e.message.split('\n')[0]}`);
  }
}

// ─── 4. Verify User Roles ─────────────────────────────────────
log('\n👤 Step 4: Verifying user roles & access...');
try {
  const users = await pool.query(`SELECT data->>'email' as email, data->>'access_role' as role, data->>'party_id' as party_id FROM entity_user ORDER BY data->>'created_date' DESC`);
  for (const u of users.rows) {
    ok(`${u.email} → ${u.role || 'NO_ROLE'} | party: ${u.party_id || 'none'}`);
  }
} catch (e) {
  err('User check failed: ' + e.message);
}

// ─── 5. Verify Party Data ─────────────────────────────────────
log('\n🏢 Step 5: Verifying parties...');
try {
  const parties = await pool.query(`SELECT data->>'id' as id, data->>'name' as name, data->>'status' as status FROM entity_party`);
  for (const p of parties.rows) {
    ok(`Party: ${p.name} (${p.id}) — status: ${p.status || 'active'}`);
  }
} catch (e) {
  err('Party check: ' + e.message);
}

// ─── 6. Verify Revenue Data ───────────────────────────────────
log('\n💰 Step 6: Verifying revenue data...');
try {
  const aggs = await pool.query(`SELECT COUNT(*) FROM entity_monthlyaggregate`);
  ok(`MonthlyAggregate: ${aggs.rows[0].count} periods`);
  
  const latest = await pool.query(`SELECT data->>'report_month' as month, data->>'total_gross' as gross FROM entity_monthlyaggregate ORDER BY (data->>'report_month') DESC LIMIT 3`);
  for (const r of latest.rows) {
    ok(`  ${r.month}: $${parseFloat(r.gross || 0).toFixed(2)} gross`);
  }
  
  const revRows = await pool.query(`SELECT COUNT(*) FROM entity_revenuerow`);
  if (parseInt(revRows.rows[0].count) === 0) {
    warn('RevenueRow table is empty — track-level data not synced yet (MonthlyAggregate has summary data)');
  } else {
    ok(`RevenueRow: ${revRows.rows[0].count} rows`);
  }
} catch (e) {
  err('Revenue check: ' + e.message);
}

// ─── 7. Verify Payout Data ────────────────────────────────────
log('\n💸 Step 7: Verifying payouts...');
try {
  const payouts = await pool.query(`SELECT data->>'period' as period, data->>'amount' as amount, data->>'status' as status FROM entity_payout ORDER BY (data->>'payment_date') DESC LIMIT 5`);
  if (payouts.rows.length === 0) {
    warn('No payouts found');
  } else {
    for (const p of payouts.rows) {
      ok(`Payout: ${p.period} — $${parseFloat(p.amount || 0).toFixed(2)} (${p.status || 'paid'})`);
    }
  }
} catch (e) {
  err('Payout check: ' + e.message);
}

// ─── 8. Verify SubLabel table ─────────────────────────────────
log('\n🏷️  Step 8: Checking SubLabel table...');
try {
  const sls = await pool.query(`SELECT COUNT(*) FROM entity_sublabel`);
  const count = parseInt(sls.rows[0].count);
  if (count === 0) {
    warn('SubLabel table empty — clients can create sub-labels from the portal');
  } else {
    ok(`SubLabel: ${count} entries`);
  }
} catch (e) {
  err('SubLabel check: ' + e.message);
}

// ─── 9. Test API Key Auth ─────────────────────────────────────
log('\n🔐 Step 9: Testing API Key lookup...');
try {
  const keyRes = await pool.query(`SELECT data FROM entity_apikey WHERE (data->>'key') = $1`, [process.env.JRN_API_KEY || 'jrn_demo_key']);
  if (keyRes.rows.length > 0) {
    ok(`JRN API key found in DB: ${keyRes.rows[0].data.name}`);
  } else {
    warn('JRN API key not found in entity_apikey table');
  }
} catch (e) {
  err('API key lookup: ' + e.message);
}

// ─── 10. Fix: Add missing indexes ─────────────────────────────
log('\n🗂️  Step 10: Adding performance indexes...');
const indexes = [
  { table: 'entity_user', field: 'email' },
  { table: 'entity_user', field: 'access_role' },
  { table: 'entity_user', field: 'party_id' },
  { table: 'entity_clientaccount', field: 'party_id' },
  { table: 'entity_clientaccount', field: 'contact_email' },
  { table: 'entity_release', field: 'client_account_id' },
  { table: 'entity_release', field: 'status' },
  { table: 'entity_sublabel', field: 'client_account_id' },
  { table: 'entity_supportticket', field: 'client_account_id' },
  { table: 'entity_apikey', field: 'key' },
  { table: 'entity_apikey', field: 'status' },
];

for (const { table, field } of indexes) {
  const idxName = `idx_${table.replace('entity_', '')}_${field}`;
  try {
    await pool.query(`CREATE INDEX IF NOT EXISTS "${idxName}" ON "${table}" ((data->>'${field}'))`);
    ok(`Index: ${idxName}`);
  } catch (e) {
    warn(`Index ${idxName}: ${e.message.split('\n')[0]}`);
  }
}

log('\n============================================');
log('  ✅ DB Setup Complete!');
log('============================================\n');

await pool.end();
