import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { searchRevenueRows } from '../../shared/catalogSearch.ts';

// Server-side catalog search for the Artist Mapping admin page.
// Pages through ALL RevenueRow entities and filters by the search query
// across track_title, album_title, artist, and isrc fields.
// Returns unique tracks (deduplicated by ISRC + track_title).
//
// Body: { query: string }

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { query } = await req.json().catch(() => ({}));
    const { results } = await searchRevenueRows(base44, query || '', {}, {});
    return Response.json({
      results: results.map((r) => ({
        track_title: r.track_title,
        isrc: r.isrc,
        album_title: r.album_title,
        artist: r.artist,
      })),
    });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
});