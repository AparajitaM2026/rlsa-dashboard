import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const {
      release_title, release_type, artist_name, primary_genre, sub_genre,
      language, release_date, p_line, c_line, upc_ean,
      client_account_id, client_name, sub_label_id, sub_label_name,
      artwork_url, tracks
    } = body;

    if (!release_title || !release_type || !artist_name || !client_account_id) {
      return Response.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Store UPC/EAN as-is; admin assigns one during review if not provided
    const finalUpc = upc_ean || '';

    // Create the release entity
    const release = await base44.entities.Release.create({
      release_title,
      release_type,
      artist_name,
      primary_genre: primary_genre || '',
      sub_genre: sub_genre || '',
      language: language || '',
      release_date: release_date || '',
      p_line: p_line || '',
      c_line: c_line || '',
      upc_ean: finalUpc,
      client_account_id,
      client_name: client_name || '',
      sub_label_id: sub_label_id || '',
      sub_label_name: sub_label_name || '',
      artwork_url: artwork_url || '',
      tracks: JSON.stringify(tracks || []),
      status: 'pending_review',
      admin_remarks: '',
      submitted_by_email: user.email || '',
      submitted_by_name: user.full_name || user.email || ''
    });

    // Build email HTML
    const trackList = tracks || [];
    const tracksHtml = trackList.map((t: any, i: number) => {
      const artists = t.artists || (t.primary_artist ? [{ name: t.primary_artist, spotify_artist_url: t.spotify_artist_url, artist_facebook: t.artist_facebook, artist_instagram: t.artist_instagram }] : []);
      const artistNames = artists.map((a: any) => a.name || '—').join('<br>');
      const spotifyLinks = artists.map((a: any) => a.spotify_artist_url ? `<a href="${a.spotify_artist_url}">Spotify</a>` : '—').join('<br>');
      const fbLinks = artists.map((a: any) => a.artist_facebook ? `<a href="${a.artist_facebook}">Facebook</a>` : '—').join('<br>');
      const igLinks = artists.map((a: any) => a.artist_instagram ? `<a href="${a.artist_instagram}">Instagram</a>` : '—').join('<br>');
      return `
      <tr>
        <td style="padding:6px;border:1px solid #ddd;">${i + 1}</td>
        <td style="padding:6px;border:1px solid #ddd;">${t.title || '—'}</td>
        <td style="padding:6px;border:1px solid #ddd;">${artistNames || '—'}</td>
        <td style="padding:6px;border:1px solid #ddd;">${spotifyLinks}</td>
        <td style="padding:6px;border:1px solid #ddd;">${fbLinks}</td>
        <td style="padding:6px;border:1px solid #ddd;">${igLinks}</td>
        <td style="padding:6px;border:1px solid #ddd;">${t.version || '—'}</td>
        <td style="padding:6px;border:1px solid #ddd;">${t.isrc || '—'}</td>
        <td style="padding:6px;border:1px solid #ddd;">${t.explicit ? 'Yes' : 'No'}</td>
        <td style="padding:6px;border:1px solid #ddd;">${t.composers || '—'}</td>
        <td style="padding:6px;border:1px solid #ddd;">${t.lyricists || '—'}</td>
        <td style="padding:6px;border:1px solid #ddd;">${t.audio_url ? `<a href="${t.audio_url}">Download</a>` : '—'}</td>
      </tr>
    `;
    }).join('');

    const html = `
      <div style="font-family:Arial,sans-serif;max-width:700px;margin:0 auto;">
        <h2 style="color:#4f46e5;">New Release Submission</h2>
        <p><strong>Submitted by:</strong> ${user.full_name || user.email} (${user.email})</p>
        <p><strong>Main Label / Client:</strong> ${client_name || '—'}</p>
        <p><strong>Sub-Label:</strong> ${sub_label_name || 'Main Label (default)'}</p>
        <hr style="border:1px solid #eee;">
        <h3>Release Metadata</h3>
        <table style="border-collapse:collapse;width:100%;">
          <tr><td style="padding:6px;"><strong>Title:</strong></td><td style="padding:6px;">${release_title}</td></tr>
          <tr><td style="padding:6px;"><strong>Type:</strong></td><td style="padding:6px;">${release_type.toUpperCase()}</td></tr>
          <tr><td style="padding:6px;"><strong>Artist:</strong></td><td style="padding:6px;">${artist_name}</td></tr>
          <tr><td style="padding:6px;"><strong>Primary Genre:</strong></td><td style="padding:6px;">${primary_genre || '—'}</td></tr>
          <tr><td style="padding:6px;"><strong>Sub-Genre:</strong></td><td style="padding:6px;">${sub_genre || '—'}</td></tr>
          <tr><td style="padding:6px;"><strong>Language:</strong></td><td style="padding:6px;">${language || '—'}</td></tr>
          <tr><td style="padding:6px;"><strong>Release Date:</strong></td><td style="padding:6px;">${release_date || '—'}</td></tr>
          <tr><td style="padding:6px;"><strong>P-Line:</strong></td><td style="padding:6px;">${p_line || '—'}</td></tr>
          <tr><td style="padding:6px;"><strong>C-Line:</strong></td><td style="padding:6px;">${c_line || '—'}</td></tr>
          <tr><td style="padding:6px;"><strong>UPC/EAN:</strong></td><td style="padding:6px;">${finalUpc || 'To be assigned by admin'}</td></tr>
        </table>
        <h3>Artwork</h3>
        <p>${artwork_url ? `<a href="${artwork_url}" style="color:#4f46e5;">Download Artwork File</a>` : 'No artwork uploaded'}</p>
        <h3>Tracks (${trackList.length})</h3>
        <table style="border-collapse:collapse;width:100%;font-size:13px;">
          <thead>
            <tr style="background:#f5f5f5;">
              <th style="padding:6px;border:1px solid #ddd;">#</th>
              <th style="padding:6px;border:1px solid #ddd;">Title</th>
              <th style="padding:6px;border:1px solid #ddd;">Primary Artist</th>
              <th style="padding:6px;border:1px solid #ddd;">Spotify</th>
              <th style="padding:6px;border:1px solid #ddd;">Facebook</th>
              <th style="padding:6px;border:1px solid #ddd;">Instagram</th>
              <th style="padding:6px;border:1px solid #ddd;">Version</th>
              <th style="padding:6px;border:1px solid #ddd;">ISRC</th>
              <th style="padding:6px;border:1px solid #ddd;">Explicit</th>
              <th style="padding:6px;border:1px solid #ddd;">Composers</th>
              <th style="padding:6px;border:1px solid #ddd;">Lyricists</th>
              <th style="padding:6px;border:1px solid #ddd;">Audio</th>
            </tr>
          </thead>
          <tbody>${tracksHtml}</tbody>
        </table>
        <hr style="border:1px solid #eee;margin-top:20px;">
        <p style="color:#888;font-size:12px;">This is an automated notification from OTTMConnect. Review this submission in the Admin Portal → Releases.</p>
      </div>
    `;

    // Send email notification
    await base44.integrations.Core.SendEmail({
      to: 'amit@ottsol.com',
      subject: `New Release Submission: ${release_title} — ${artist_name}`,
      html
    });

    return Response.json({ ok: true, release });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}