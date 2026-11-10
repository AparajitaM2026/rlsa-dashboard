import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { secrets } from 'base44:runtime';

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { query } = body;
    if (!query || query.trim().length < 2) {
      return Response.json({ artists: [] });
    }

    const clientId = secrets.get('SPOTIFY_CLIENT_ID');
    const clientSecret = secrets.get('SPOTIFY_CLIENT_SECRET');

    if (!clientId || !clientSecret) {
      return Response.json({ error: 'Spotify credentials not configured' }, { status: 500 });
    }

    // Get access token via client credentials flow
    const tokenRes = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + btoa(clientId + ':' + clientSecret)
      },
      body: 'grant_type=client_credentials'
    });

    if (!tokenRes.ok) {
      return Response.json({ error: 'Failed to authenticate with Spotify' }, { status: 500 });
    }

    const tokenData = await tokenRes.json();
    const accessToken = tokenData.access_token;

    // Search for artists
    const searchRes = await fetch(
      `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=artist&limit=5`,
      {
        headers: { 'Authorization': 'Bearer ' + accessToken }
      }
    );

    if (!searchRes.ok) {
      return Response.json({ error: 'Spotify search failed' }, { status: 500 });
    }

    const searchData = await searchRes.json();
    const artists = (searchData.artists?.items || []).map((a: any) => ({
      id: a.id,
      name: a.name,
      spotify_url: a.external_urls?.spotify || '',
      followers: a.followers?.total || 0,
      genres: (a.genres || []).slice(0, 3),
      image: a.images?.[2]?.url || a.images?.[0]?.url || ''
    }));

    return Response.json({ artists });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}