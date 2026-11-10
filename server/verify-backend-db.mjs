import { pool } from './pg-db.js';

console.log('=== FULL BACKEND & DB VERIFICATION TEST ===\n');

const baseUrl = 'http://localhost:5000/api';
let allPassed = true;

const test = (name, ok, msg = '') => {
  if (ok) {
    console.log(`  ✅ [PASS] ${name} ${msg ? '— ' + msg : ''}`);
  } else {
    console.log(`  ❌ [FAIL] ${name} ${msg ? '— ' + msg : ''}`);
    allPassed = false;
  }
};

try {
  // 1. Health check
  const healthRes = await fetch(`${baseUrl}/health`);
  const health = await healthRes.json();
  test('Health Endpoint', health.status === 'ok', `DB: ${health.database}`);

  // 2. Authentication test (Admin login)
  const loginRes = await fetch(`${baseUrl}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@ottm.com', password: 'admin123' })
  });
  const loginData = await loginRes.json();
  test('Admin Login', loginData.access_token && loginData.user?.role === 'admin', `Token: ${loginData.access_token}`);
  const adminToken = loginData.access_token;

  // 3. User Me & Profile Update (PATCH /auth/me)
  const meRes = await fetch(`${baseUrl}/auth/me`, {
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  const meData = await meRes.json();
  test('Auth /me Check', meData.email === 'admin@ottm.com', `Logged in as: ${meData.name}`);

  // 4. Entity Read from Neon DB (ClientAccount, Release, Party)
  const clientsRes = await fetch(`${baseUrl}/entities/ClientAccount?limit=5`);
  const clients = await clientsRes.json();
  test('Fetch ClientAccounts from DB', Array.isArray(clients) && clients.length > 0, `Fetched ${clients.length} accounts (Sample: ${clients[0]?.client_name})`);

  const partiesRes = await fetch(`${baseUrl}/entities/Party`);
  const parties = await partiesRes.json();
  test('Fetch Parties from DB', Array.isArray(parties) && parties.length > 0, `Found ${parties.length} parties`);

  // 5. CRUD: CREATE in DB
  const testReleaseId = `test_rel_${Date.now()}`;
  const createRes = await fetch(`${baseUrl}/entities/Release`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
    body: JSON.stringify({
      id: testReleaseId,
      release_title: 'Verification Test Song 2026',
      artist_name: 'Test Artist',
      status: 'pending_review',
      release_type: 'single',
      tracks: JSON.stringify([{ title: 'Track 1', duration: 180 }])
    })
  });
  const createdRelease = await createRes.json();
  test('Entity CREATE in Neon DB', createdRelease.id === testReleaseId, `Created release: ${createdRelease.release_title}`);

  // Verify directly from PostgreSQL pool
  const pgDirectCheck = await pool.query('SELECT data FROM entity_release WHERE id = $1', [testReleaseId]);
  test('Direct PostgreSQL DB Persistence Verify', pgDirectCheck.rows.length === 1 && pgDirectCheck.rows[0].data.release_title === 'Verification Test Song 2026', 'Data strictly persisted in Neon table');

  // 6. CRUD: UPDATE in DB (Verify data change reflects)
  const updateRes = await fetch(`${baseUrl}/entities/Release/${testReleaseId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
    body: JSON.stringify({
      status: 'approved',
      upc_ean: '8901234567890',
      admin_remarks: 'Approved by automated check'
    })
  });
  const updatedRelease = await updateRes.json();
  test('Entity UPDATE in Neon DB', updatedRelease.status === 'approved' && updatedRelease.upc_ean === '8901234567890', 'Updated status to approved & assigned UPC');

  // Verify update reflected in DB
  const pgUpdatedCheck = await pool.query('SELECT data FROM entity_release WHERE id = $1', [testReleaseId]);
  test('DB Data Change Verification', pgUpdatedCheck.rows[0].data.status === 'approved' && pgUpdatedCheck.rows[0].data.upc_ean === '8901234567890', 'PostgreSQL row successfully modified with new values');

  // 7. CRUD: DELETE in DB
  const deleteRes = await fetch(`${baseUrl}/entities/Release/${testReleaseId}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${adminToken}` }
  });
  const deleteJson = await deleteRes.json();
  test('Entity DELETE in Neon DB', deleteJson.success === true, 'Deleted test record');

  const pgDeletedCheck = await pool.query('SELECT data FROM entity_release WHERE id = $1', [testReleaseId]);
  test('DB Delete Verification', pgDeletedCheck.rows.length === 0, 'Confirmed removed from PostgreSQL');

  // 8. Custom Functions: aggregateClientRevenue
  const aggRes = await fetch(`${baseUrl}/functions/aggregateClientRevenue`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
    body: JSON.stringify({ client_account_id: '6a6c6cff3f35cc52d824ad23', period: 'all' })
  });
  const aggData = await aggRes.json();
  test('Revenue Aggregation Function', aggData.gross > 0 && aggData.net > 0 && aggData.units > 0, `Gross: $${aggData.gross}, Net: $${aggData.net}, Units: ${aggData.units}`);

  // 9. Custom Functions: listPartyUsers
  const partyUsersRes = await fetch(`${baseUrl}/functions/listPartyUsers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${adminToken}` },
    body: JSON.stringify({})
  });
  const partyUsersData = await partyUsersRes.json();
  test('listPartyUsers Function', Array.isArray(partyUsersData.users) && partyUsersData.users.length > 0, `Returned ${partyUsersData.users.length} users & ${partyUsersData.clients.length} clients`);

  // 10. Dedicated V1 REST API with API Key (for external partners like JRN)
  const v1PingRes = await fetch('http://localhost:5000/api/v1/ping', {
    headers: { 'X-API-Key': process.env.JRN_API_KEY || 'jrn_demo_key' }
  });
  const v1Ping = await v1PingRes.json();
  test('V1 Partner API (M5 Access)', v1Ping.status === 'ok' && v1Ping.authenticated_account?.account_name === 'Demo Music Holdings', `Auth Account: ${v1Ping.authenticated_account?.account_name}`);

  const v1RevRes = await fetch('http://localhost:5000/api/v1/revenue/summary', {
    headers: { 'X-API-Key': process.env.JRN_API_KEY || 'jrn_demo_key' }
  });
  const v1Rev = await v1RevRes.json();
  test('V1 Partner Revenue Summary', v1Rev.success === true && v1Rev.summary?.gross_revenue > 0, `Real gross: $${v1Rev.summary?.gross_revenue} across ${v1Rev.summary?.total_streams_units} streams`);

  console.log('\n============================================');
  if (allPassed) {
    console.log('  🎉 ALL BACKEND & DATABASE TESTS PASSED! 🎉');
    console.log('  - Data fetching: 100% working directly from Neon DB');
    console.log('  - Data modification (CREATE/UPDATE/DELETE): verified strictly in PostgreSQL');
    console.log('  - Live calculation & logic: 100% active');
  } else {
    console.log('  ⚠️ Some tests failed. Please review output above.');
  }
  console.log('============================================\n');

} catch (err) {
  console.error('Test execution failed:', err);
} finally {
  await pool.end();
}
