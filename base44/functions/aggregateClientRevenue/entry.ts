import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { getCountryFallback, isCountryMissing } from '../../shared/countryFallback.ts';

// Per-client (or multi-client) server-side aggregation.
// Body: { client_account_id, period }  OR  { client_account_ids: [...], period }
// When client_account_ids is given, revenue is aggregated across all of them
// (used for the Party Admin "All / Consolidated" view). A blended sharePct
// (net/gross*100) is returned so client pages can scale breakdowns uniformly.
// period = "all" | "YYYY-MM"

const PAGE = 2000;

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));
    const { client_account_id, client_account_ids, period } = body;

    let ids: string[] = [];
    if (Array.isArray(client_account_ids) && client_account_ids.length) {
      ids = client_account_ids.filter(Boolean);
    } else if (client_account_id) {
      ids = [client_account_id];
    }
    if (!ids.length) return Response.json({ error: 'client_account_id required' }, { status: 400 });

    // Resolve share_pct per account (for the net calculation) + country fallback
    const shareMap: Record<string, number> = {};
    let countryFallback: any[] | null = null;
    try {
      const accounts = await base44.asServiceRole.entities.ClientAccount.filter(
        { id: { $in: ids } }, '-created_date', 500
      );
      for (const a of accounts) shareMap[a.id] = Number(a.revenue_share_pct) || 0;
      if (ids.length === 1 && accounts[0]) countryFallback = getCountryFallback(accounts[0].client_name);
    } catch { /* ignore — share stays 0 */ }

    const all = !period || period === 'all';
    const idQuery = ids.length === 1 ? ids[0] : { $in: ids };
    const query: any = all
      ? { client_account_id: idQuery }
      : { client_account_id: idQuery, report_month: period };

    let skip = 0;
    let gross = 0, net = 0, units = 0;
    const isrcs = new Set<string>();
    const monthly = new Map<string, any>();
    const perStore = new Map<string, any>();
    const perCountry = new Map<string, any>();
    const perTrack = new Map<string, any>();
    const perAlbum = new Map<string, any>();
    const perCaller = new Map<string, any>();

    const bump = (m: Map<string, any>, k: string, g: number, u: number) => {
      const e = m.get(k) || { gross: 0, units: 0, rows: 0 };
      e.gross += g; e.units += u; e.rows++; m.set(k, e);
    };

    while (true) {
      const rows = await base44.asServiceRole.entities.RevenueRow.filter(query, '-created_date', PAGE, skip);
      if (!rows.length) break;
      for (const r of rows) {
        const g = Number(r.gross_revenue) || 0;
        const u = Number(r.units) || 0;
        const share = shareMap[r.client_account_id] ?? 0;
        gross += g; net += g * share / 100; units += u;
        if (r.isrc || r.track_title) isrcs.add(r.isrc || r.track_title);
        if (r.report_month) {
          const me = monthly.get(r.report_month) || { gross: 0, units: 0 };
          me.gross += g; me.units += u; monthly.set(r.report_month, me);
        }
        bump(perStore, r.store_dsp || 'Unknown', g, u);
        if (countryFallback && isCountryMissing(r.country)) {
          for (const cs of countryFallback) bump(perCountry, cs.name, g * cs.weight, u * cs.weight);
        } else {
          bump(perCountry, r.country || 'Unknown', g, u);
        }
        const tk = r.isrc || r.track_title || 'Unknown';
        let pt = perTrack.get(tk);
        if (!pt) {
          pt = { isrc: r.isrc || '—', track_title: r.track_title || '—', artist: r.artist || '—', album_title: r.album_title || '—', gross: 0, units: 0, rows: 0 };
          perTrack.set(tk, pt);
        }
        pt.gross += g; pt.units += u; pt.rows++;
        bump(perAlbum, r.album_title || r.track_title || 'Unknown', g, u);
        bump(perCaller, r.caller_tune || 'N/A', g, u);
      }
      skip += rows.length;
      if (rows.length < PAGE) break;
    }

    const sharePct = gross > 0 ? (net / gross) * 100 : (ids.length === 1 ? (shareMap[ids[0]] || 0) : 0);
    const dim = (m: Map<string, any>) => Array.from(m, ([key, v]) => ({ key, ...v })).sort((a: any, b: any) => b.gross - a.gross);
    const monthlyArr = Array.from(monthly, ([month, v]) => ({ month, gross: v.gross, units: v.units })).sort((a: any, b: any) => a.month.localeCompare(b.month));

    return Response.json({
      gross, net, sharePct, units, trackCount: isrcs.size,
      monthly: monthlyArr,
      perStore: dim(perStore),
      perCountry: dim(perCountry),
      perTrack: Array.from(perTrack, ([k, v]) => ({ key: k, ...v })).sort((a: any, b: any) => b.gross - a.gross),
      perAlbum: dim(perAlbum),
      perCaller: dim(perCaller),
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
});