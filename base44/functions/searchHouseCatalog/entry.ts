import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { searchRevenueRows } from '../../shared/catalogSearch.ts';

// Unified server-side catalog search for the Catalog Assignment admin page.
// Searches RevenueRow records with a flexible source filter:
//   source: "house" (default) → is_house_label=true
//   source: "all"             → no source filter
//   source: "<client_id>"     → client_account_id = <client_id>
// Filters by the query across track_title, album_title, artist, isrc, and
// label_imprint. Returns unique tracks (deduplicated by ISRC + track_title)
// with aggregated gross, units, and row count. Also returns matching imprints.
//
// Body: { query: string, period?: string, source?: string }

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { query, period, source, skipOffset } = await req.json().catch(() => ({}));
    const filter: Record<string, any> = {};
    if (source === 'house' || !source) {
      filter.is_house_label = true;
    } else if (source !== 'all') {
      filter.client_account_id = source;
    }
    if (period && period !== 'all') filter.report_month = period;
    const { results, imprints, complete, scanned } = await searchRevenueRows(base44, query || '', filter, {
      matchImprint: true,
      includeRevenue: true,
      includeImprints: true,
      skipOffset,
    });
    return Response.json({ results, imprints, complete, scanned });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
});