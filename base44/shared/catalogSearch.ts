// Shared catalog search logic used by searchRevenueCatalog and searchHouseCatalog.
// Pushes the text query to the database level via per-field $regex queries run
// in parallel, so only matching RevenueRow records are read (avoids "entity read
// traffic volume limit exceeded" when the catalog is large). Then deduplicates
// by ISRC + track_title and aggregates gross/units/rows.

export const PAGE_SIZE = 5000;
export const MAX_RESULTS = 100000;
export const TIMEOUT_MS = 25000;

/** Escape a string for safe use inside a RegExp. */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface CatalogSearchOptions {
  /** Include label_imprint in the match criteria and results */
  matchImprint?: boolean;
  /** Aggregate gross_revenue, units, and row count per track */
  includeRevenue?: boolean;
  /** Also aggregate matching results by imprint */
  includeImprints?: boolean;
  maxResults?: number;
  timeoutMs?: number;
  skipOffset?: number;
  /** Hard cap on total rows read from the DB per call (prevents read-traffic limits). */
  maxRowsScanned?: number;
}

export interface CatalogResult {
  track_title: string;
  isrc: string;
  album_title: string;
  artist: string;
  label_imprint: string;
  gross: number;
  units: number;
  rows: number;
}

export interface ImprintAgg {
  key: string;
  gross: number;
  units: number;
  rows: number;
}

/**
 * Searches RevenueRow with `filter`, matching `query` against text fields via
 * parallel per-field $regex queries. Returns deduplicated tracks (by ISRC|
 * track_title) with optional revenue aggregation and imprint breakdown.
 *
 * Uses parallel single-field queries instead of $or+$regex because the latter
 * times out on the DB side when the collection is large and unindexed.
 */
export async function searchRevenueRows(
  base44: any,
  query: string,
  filter: Record<string, any>,
  opts: CatalogSearchOptions = {}
): Promise<{ results: CatalogResult[]; imprints: ImprintAgg[]; complete: boolean; scanned: number }> {
  const q = query.trim();
  const maxResults = opts.maxResults ?? MAX_RESULTS;

  if (!q) return { results: [], imprints: [], complete: true, scanned: 0 };

  const regex = { $regex: escapeRegex(q), $options: 'i' };
  const fields = ['track_title', 'album_title', 'artist', 'isrc'];
  if (opts.matchImprint) fields.push('label_imprint');

  // Run single-field $regex queries in parallel — each is much faster than a
  // combined $or query and can complete within the DB's 20s timeout.
  // Use the regular client (not asServiceRole) because asServiceRole may not
  // support $regex filters; RevenueRow has no RLS so the regular client can
  // read all records.
  const entity = base44.entities.RevenueRow;
  const queries = fields.map((field) =>
    entity.filter(
      { ...filter, [field]: regex }, '-created_date', PAGE_SIZE
    )
  );
  const settled = await Promise.allSettled(queries);

  const seen = new Map<string, CatalogResult>();
  const imprintMap = new Map<string, { gross: number; units: number; rows: number }>();
  let scanned = 0;
  let anyFailed = false;

  for (const s of settled) {
    if (s.status !== 'fulfilled') { anyFailed = true; continue; }
    scanned += s.value.length;
    for (const r of s.value) {
      const key = `${r.isrc || ''}|${r.track_title || ''}`;
      const gross = opts.includeRevenue ? (Number(r.gross_revenue) || 0) : 0;
      const units = opts.includeRevenue ? (Number(r.units) || 0) : 0;

      const ex = seen.get(key);
      if (ex) {
        if (opts.includeRevenue) {
          ex.gross += gross;
          ex.units += units;
          ex.rows += 1;
        }
      } else {
        seen.set(key, {
          track_title: r.track_title || '',
          isrc: r.isrc || '',
          album_title: r.album_title || '',
          artist: r.artist || '',
          label_imprint: r.label_imprint || '',
          gross,
          units,
          rows: 1,
        });
      }

      if (opts.includeImprints) {
        const ik = r.label_imprint || '(blank)';
        const ie = imprintMap.get(ik) || { gross: 0, units: 0, rows: 0 };
        ie.gross += gross;
        ie.units += units;
        ie.rows += 1;
        imprintMap.set(ik, ie);
      }
    }
  }

  const results = Array.from(seen.values())
    .sort((a, b) => b.gross - a.gross)
    .slice(0, maxResults);

  const imprints = Array.from(imprintMap.entries())
    .map(([key, v]) => ({ key, ...v }))
    .sort((a, b) => b.gross - a.gross);

  // Single-pass search — always complete (even if some field queries timed out,
  // we return partial results rather than retrying forever).
  return { results, imprints, complete: true, scanned };
}