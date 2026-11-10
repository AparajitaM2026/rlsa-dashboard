import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { runAggregatePass } from '../../shared/aggregateEngine.ts';

// Resumable server-side aggregation over ALL RevenueRow records for a
// statement period. A full month can hold ~1M rows, which exceeds the
// platform's per-call entity read-traffic limit — so this function processes
// a bounded batch (ROW_BUDGET) per invocation, accumulates into the
// MonthlyAggregate record (the running totals + per-dimension maps), and
// resumes from `scan_skip` on the next call. Call repeatedly until
// `complete` is true. The workflow's final step invokes this in a loop.
//
// Body: { report_month: "YYYY-MM", dimensions?: [...], force_reset?: boolean }
// Omit `dimensions` to compute everything. On a resume call, all dimensions
// are always accumulated (the stored JSON is parsed, merged, and saved back).
// Set `force_reset` to clear the existing cache and re-scan from scratch.

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { report_month, dimensions, force_reset } = await req.json().catch(() => ({}));
    if (!report_month) return Response.json({ error: 'report_month required' }, { status: 400 });
    const result = await runAggregatePass(base44, report_month, { force_reset, dimensions });
    return Response.json(result);
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
});