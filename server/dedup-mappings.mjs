import { pool } from './pg-db.js';

console.log('=== CLEANING DUPLICATE LABEL MAPPINGS ===');

const res = await pool.query(`SELECT id, data->>'raw_imprint' as imp, created_date FROM entity_labelmapping ORDER BY created_date ASC`);
console.log('Total mappings before cleanup:', res.rows.length);

const seen = new Set();
const toDelete = [];

// Keep only 1 unique mapping per raw_imprint (case-insensitive)
for (const row of res.rows) {
  const norm = (row.imp || '').trim().toLowerCase();
  if (seen.has(norm)) {
    toDelete.push(row.id);
  } else {
    seen.add(norm);
  }
}

console.log(`Found ${toDelete.length} duplicate rows to delete. Keeping ${seen.size} unique label mappings.`);

if (toDelete.length > 0) {
  await pool.query(`DELETE FROM entity_labelmapping WHERE id = ANY($1)`, [toDelete]);
  console.log(`Successfully removed ${toDelete.length} duplicates from PostgreSQL.`);
}

const after = await pool.query(`SELECT COUNT(*) FROM entity_labelmapping`);
console.log('Total mappings after cleanup:', after.rows[0].count);

await pool.end();
