import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false, servername: 'ep-autumn-star-b5tqcybh-pooler.c-7.us-east-2.aws.neon.tech' }
});

async function run() {
  const tables = await pool.query(`
    SELECT table_name FROM information_schema.tables 
    WHERE table_schema = 'public' ORDER BY table_name;
  `);
  console.log('Tables:', tables.rows.map(r => r.table_name));

  const releaseRows = await pool.query(`SELECT count(*) FROM entity_release;`);
  console.log('entity_release count:', releaseRows.rows[0].count);

  const lastReleases = await pool.query(`
    SELECT id, data->>'release_title' as title, data->>'status' as status, data->>'tracks' as tracks_preview, created_date 
    FROM entity_release 
    ORDER BY created_date DESC LIMIT 5;
  `);
  console.log('Last 5 releases:', JSON.stringify(lastReleases.rows, null, 2));

  // Check sublabels
  const sublabelRows = await pool.query(`SELECT count(*) FROM entity_sublabel;`);
  console.log('entity_sublabel count:', sublabelRows.rows[0].count);

  // Check if there is an entity_track table
  const hasTrack = tables.rows.some(r => r.table_name === 'entity_track');
  console.log('Has entity_track table:', hasTrack);
  if (hasTrack) {
    const trackRows = await pool.query(`SELECT count(*) FROM entity_track;`);
    console.log('entity_track count:', trackRows.rows[0].count);
    const lastTracks = await pool.query(`SELECT id, data, created_date FROM entity_track ORDER BY created_date DESC LIMIT 5;`);
    console.log('Last tracks:', JSON.stringify(lastTracks.rows, null, 2));
  }

  await pool.end();
}
run().catch(console.error);
