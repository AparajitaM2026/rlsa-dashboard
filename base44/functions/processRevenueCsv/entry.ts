import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { routeRevenueCsv } from '../../shared/revenueRouting.ts';

// Direct, synchronous admin endpoint (kept for backward compatibility).
// The background workflow path (processCsvJob) is preferred for large files.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden — admin only' }, { status: 403 });

    const { file_url, report_month } = await req.json().catch(() => ({}));
    if (!file_url || !report_month) {
      return Response.json({ error: 'file_url and report_month are required' }, { status: 400 });
    }

    return Response.json(await routeRevenueCsv(base44, file_url, report_month));
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});