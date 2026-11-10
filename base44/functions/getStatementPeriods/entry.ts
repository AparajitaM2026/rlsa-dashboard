import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// Returns all distinct YYYY-MM statement periods that exist in the RevenueRow
// table. Instead of scanning hundreds of thousands of rows (which would time
// out), it probes each candidate month with a limit-1 filter — if any row
// exists for that month, it's included. The candidate range covers 2023-01
// through 2028-12 (72 months), queried in parallel batches for speed.
//
// This ensures historical periods (e.g. 2025) appear in the Statement Period
// dropdown even when CsvUploadJob or MonthlyAggregate records are missing.
//
// No body required.

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Build candidate month list: 2023-01 .. 2028-12
    const candidates: string[] = [];
    for (let y = 2023; y <= 2028; y++) {
      for (let m = 1; m <= 12; m++) {
        candidates.push(`${y}-${String(m).padStart(2, '0')}`);
      }
    }

    const found: string[] = [];
    const BATCH = 12;

    for (let i = 0; i < candidates.length; i += BATCH) {
      const slice = candidates.slice(i, i + BATCH);
      const results = await Promise.all(
        slice.map(async (month) => {
          try {
            const rows = await base44.asServiceRole.entities.RevenueRow.filter(
              { report_month: month },
              '-created_date',
              1,
            );
            return rows.length > 0 ? month : null;
          } catch {
            return null;
          }
        }),
      );
      for (const r of results) {
        if (r) found.push(r);
      }
    }

    return Response.json({ periods: found.sort().reverse() });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
});