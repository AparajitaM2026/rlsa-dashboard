import { pool } from './pg-db.js';

console.log('=== FIXING EXISTING SUBMITTED RELEASES ===');

// Fix status 'submitted' to 'pending_review' and ensure tracks is JSON string
const res = await pool.query(`SELECT id, data FROM entity_release`);
for (const r of res.rows) {
  const d = r.data;
  const updatedData = {
    ...d,
    status: d.status === 'submitted' ? 'pending_review' : d.status,
    tracks: typeof d.tracks === 'string' ? d.tracks : JSON.stringify(d.tracks || []),
    release_type: d.release_type || 'single',
    upc_ean: d.upc_ean || d.upc_barcode || ''
  };
  await pool.query(
    `UPDATE entity_release SET data = $1::jsonb, updated_date = NOW() WHERE id = $2`,
    [JSON.stringify(updatedData), r.id]
  );
  console.log(`Updated release ${r.id}: status=${updatedData.status}, title=${updatedData.release_title}, tracks type=${typeof updatedData.tracks}`);
}

await pool.end();
