import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { runAggregatePass } from '../../shared/aggregateEngine.ts';

// Rebuilds MonthlyAggregate caches from existing RevenueRow records — no CSV
// processing. Processes multiple periods in a single call, force-resetting
// each period and scanning in 200k-row passes until complete or the time
// budget is exhausted. Call again with the returned `pending` periods to
// continue.
//
// Body: { periods?: ["2026-01", ...] }
// If periods omitted, auto-detects all periods where scan_complete is false.

const TIME_BUDGET_MS = 250000; // 250s — leaves room for response overhead under the 300s limit

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { periods } = await req.json().catch(() => ({}));

    // Determine which periods to rebuild.
    let targetPeriods: string[] = [];
    if (periods && Array.isArray(periods) && periods.length > 0) {
      targetPeriods = periods;
    } else {
      // Auto-detect: all periods where scan_complete is false.
      const aggregates = await base44.asServiceRole.entities.MonthlyAggregate.list('-report_month', 100);
      for (const a of aggregates) {
        if (!a.scan_complete) targetPeriods.push(a.report_month);
      }
    }

    const startTime = Date.now();
    const results: any[] = [];

    for (const period of targetPeriods) {
      if (Date.now() - startTime > TIME_BUDGET_MS) {
        results.push({ period, status: 'pending' });
        continue;
      }

      // Only force-reset if the period was falsely marked complete
      // (scan_complete=true with stale data). Periods that are still
      // in-progress (scan_complete=false) resume from their skip offset.
      const existing = await base44.asServiceRole.entities.MonthlyAggregate.filter({ report_month: period }, '-created_date', 1);
      let forceReset = existing[0]?.scan_complete === true;
      let complete = false;
      let passes = 0;
      let lastResult: any = null;

      while (!complete && Date.now() - startTime < TIME_BUDGET_MS) {
        lastResult = await runAggregatePass(base44, period, { force_reset: forceReset });
        complete = lastResult.complete;
        forceReset = false;
        passes++;
      }

      results.push({
        period,
        status: complete ? 'completed' : 'partial',
        passes,
        totalRows: lastResult?.totalRows,
        vendors: lastResult?.perVendor?.map((v: any) => `${v.key}(${v.rows})`) || [],
        houseGross: lastResult?.houseGross,
        clientGross: lastResult?.clientGross,
      });
    }

    const elapsed = Date.now() - startTime;
    const completed = results.filter(r => r.status === 'completed').map(r => r.period);
    const pending = results.filter(r => r.status !== 'completed').map(r => r.period);

    return Response.json({
      total_periods: targetPeriods.length,
      completed,
      pending,
      results,
      time_elapsed_ms: elapsed,
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
});