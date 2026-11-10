import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { searchRevenueRows } from '../../shared/catalogSearch.ts';

// Background catalog search worker — invoked by the "Run Catalog Search"
// workflow when an admin creates a CatalogSearchJob. Each call scans a batch
// of RevenueRow records (up to ~120s), merges results with any prior pass,
// and stores them back on the job entity as JSON. The workflow re-invokes
// until the scan is complete; the frontend polls the job for status changes.
//
// Body: { job_id: string }
// Returns: { done: boolean, track_count?: number }

const MAX_STORED_TRACKS = 5000;
const MAX_STORED_IMPRINTS = 500;
const SEARCH_TIMEOUT_MS = 45000;
const MAX_ROWS_PER_PASS = 60000;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { job_id } = await req.json().catch(() => ({}));
    if (!job_id) return Response.json({ error: 'job_id is required' }, { status: 400 });

    const job = await base44.asServiceRole.entities.CatalogSearchJob.get(job_id);
    if (!job) return Response.json({ error: 'job not found' }, { status: 404 });

    // Already finished — tell the workflow loop to stop (idempotent).
    if (job.status === 'completed') return Response.json({ done: true, track_count: job.track_count });
    if (job.status === 'failed') return Response.json({ done: true, error: job.error });

    await base44.asServiceRole.entities.CatalogSearchJob.update(job_id, { status: 'processing' });

    try {
      // Build the RevenueRow filter from the job's source/period selection.
      const filter: Record<string, any> = {};
      if (job.source === 'house' || !job.source) {
        filter.is_house_label = true;
      } else if (job.source !== 'all') {
        filter.client_account_id = job.source;
      }
      if (job.period && job.period !== 'all') filter.report_month = job.period;

      const skipOffset = (job.skip_offset as number) || 0;
      const { results, imprints, complete, scanned } = await searchRevenueRows(
        base44, job.query || '', filter, {
          matchImprint: true,
          includeRevenue: true,
          includeImprints: true,
          skipOffset,
          timeoutMs: SEARCH_TIMEOUT_MS,
          maxRowsScanned: MAX_ROWS_PER_PASS,
        }
      );

      // Merge with results accumulated in prior passes (resumable scans).
      let mergedResults = results;
      let mergedImprints = imprints;
      if (skipOffset > 0) {
        const prevResults: any[] = job.results ? JSON.parse(job.results) : [];
        const prevImprints: any[] = job.imprints ? JSON.parse(job.imprints) : [];
        mergedResults = mergeResults(prevResults, results);
        mergedImprints = mergeImprints(prevImprints, imprints);
      }

      // Cap stored arrays to stay within entity field size limits.
      const cappedResults = mergedResults.slice(0, MAX_STORED_TRACKS);
      const cappedImprints = mergedImprints.slice(0, MAX_STORED_IMPRINTS);

      await base44.asServiceRole.entities.CatalogSearchJob.update(job_id, {
        status: complete ? 'completed' : 'processing',
        results: JSON.stringify(cappedResults),
        imprints: JSON.stringify(cappedImprints),
        track_count: mergedResults.length,
        imprint_count: mergedImprints.length,
        skip_offset: scanned,
        scanned: (job.scanned || 0) + (scanned - skipOffset),
      });

      return Response.json({ done: complete, track_count: mergedResults.length });
    } catch (err) {
      await base44.asServiceRole.entities.CatalogSearchJob.update(job_id, {
        status: 'failed', error: err.message,
      });
      return Response.json({ done: true, error: err.message });
    }
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});

/** Merge two arrays of track results, deduplicating by ISRC|track_title and
 *  accumulating gross/units/rows. Returns a new array sorted by gross desc. */
function mergeResults(prev: any[], curr: any[]): any[] {
  const map = new Map<string, any>();
  for (const r of prev) map.set(`${r.isrc || ''}|${r.track_title || ''}`, { ...r });
  for (const r of curr) {
    const key = `${r.isrc || ''}|${r.track_title || ''}`;
    const ex = map.get(key);
    if (ex) { ex.gross += r.gross || 0; ex.units += r.units || 0; ex.rows += r.rows || 0; }
    else map.set(key, { ...r });
  }
  return Array.from(map.values()).sort((a, b) => b.gross - a.gross);
}

/** Merge two arrays of imprint aggregations, deduplicating by key. */
function mergeImprints(prev: any[], curr: any[]): any[] {
  const map = new Map<string, any>();
  for (const i of prev) map.set(i.key, { ...i });
  for (const i of curr) {
    const ex = map.get(i.key);
    if (ex) { ex.gross += i.gross || 0; ex.units += i.units || 0; ex.rows += i.rows || 0; }
    else map.set(i.key, { ...i });
  }
  return Array.from(map.values()).sort((a, b) => b.gross - a.gross);
}