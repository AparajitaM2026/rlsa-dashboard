import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// Admin-only: server-side aggregation for a single house catalog imprint.
// Filters RevenueRow by label_imprint + is_house_label=true, paginates in
// bounded batches, and returns per-track / per-country / per-store breakdowns.
//
// Resumable: processes up to MAX_ROWS per invocation, returns partial results
// + nextSkip. The caller merges results across calls until nextSkip is null.
//
// Body: { imprint, period, skip }  (period = "all" | "YYYY-MM", skip = number)

const PAGE = 2000;
const MAX_ROWS = 6000;        // max rows processed per invocation
const TRACK_CAP = 200;        // cap perTrack array to avoid oversized responses

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const { imprint, period, skip: skipParam } = await req.json().catch(() => ({}));
    if (!imprint) return Response.json({ error: 'imprint required' }, { status: 400 });

    const all = !period || period === 'all';
    const query: any = all
      ? { label_imprint: imprint, is_house_label: true }
      : { label_imprint: imprint, is_house_label: true, report_month: period };

    let skip = Number(skipParam) || 0;
    let processed = 0;
    let gross = 0, units = 0;
    const isrcs = new Set<string>();
    const perStore = new Map<string, any>();
    const perCountry = new Map<string, any>();
    const perTrack = new Map<string, any>();

    const bump = (m: Map<string, any>, k: string, g: number, u: number) => {
      const e = m.get(k) || { gross: 0, units: 0, rows: 0 };
      e.gross += g; e.units += u; e.rows++; m.set(k, e);
    };

    while (processed < MAX_ROWS) {
      const rows = await base44.asServiceRole.entities.RevenueRow.filter(query, '-created_date', PAGE, skip);
      if (!rows.length) break;
      for (const r of rows) {
        const g = Number(r.gross_revenue) || 0;
        const u = Number(r.units) || 0;
        gross += g; units += u;
        if (r.isrc || r.track_title) isrcs.add(r.isrc || r.track_title);
        bump(perStore, r.store_dsp || 'Unknown', g, u);
        bump(perCountry, r.country || 'Unknown', g, u);
        const tk = r.isrc || r.track_title || 'Unknown';
        let pt = perTrack.get(tk);
        if (!pt) {
          pt = { isrc: r.isrc || '—', track_title: r.track_title || '—', artist: r.artist || '—', album_title: r.album_title || '—', gross: 0, units: 0, rows: 0 };
          perTrack.set(tk, pt);
        }
        pt.gross += g; pt.units += u; pt.rows++;
      }
      skip += rows.length;
      processed += rows.length;
      if (rows.length < PAGE) break;
    }

    const hasMore = processed >= MAX_ROWS && processed > 0;
    const dim = (m: Map<string, any>) => Array.from(m, ([key, v]) => ({ key, ...v })).sort((a: any, b: any) => b.gross - a.gross);
    const trackArr = Array.from(perTrack, ([k, v]) => ({ key: k, ...v })).sort((a: any, b: any) => b.gross - a.gross);

    return Response.json({
      gross,
      units,
      trackCount: isrcs.size,
      rowsScanned: (Number(skipParam) || 0) + processed,
      nextSkip: hasMore ? skip : null,
      perStore: dim(perStore),
      perCountry: dim(perCountry),
      perTrack: trackArr.slice(0, TRACK_CAP),
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}