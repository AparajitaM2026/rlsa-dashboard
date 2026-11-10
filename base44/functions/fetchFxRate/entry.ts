import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { getMonthlyFxRate } from '../../shared/fxRates.ts';

// Fetches and caches the USD→INR exchange rate for a given year/month.
// Used by the admin FX Rates page to pre-populate or refresh rates.
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { year, month } = await req.json().catch(() => ({}));
    if (!year || !month) {
      return Response.json({ error: 'year and month are required' }, { status: 400 });
    }

    const rate = await getMonthlyFxRate(base44, Number(year), Number(month));
    if (!rate) {
      return Response.json(
        { error: 'Failed to fetch exchange rate for the given month' },
        { status: 502 }
      );
    }

    return Response.json({ year: Number(year), month: Number(month), rate });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});