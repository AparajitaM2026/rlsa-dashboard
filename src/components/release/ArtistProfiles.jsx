import { Music2, Facebook, Instagram, AlertTriangle } from 'lucide-react';

const clean = (url) => {
  const v = (url || '').trim();
  if (!v) return '';
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
};

export function collectArtists(tracks = []) {
  const map = new Map();
  tracks.forEach((tr) => {
    (tr.artists || []).forEach((a) => {
      const name = (a.name || '').trim() || '—';
      const key = name.toLowerCase();
      if (!map.has(key)) {
        map.set(key, { name, spotify: '', facebook: '', instagram: '', tracks: [] });
      }
      const entry = map.get(key);
      if (!entry.spotify && a.spotify_artist_url) entry.spotify = a.spotify_artist_url;
      if (!entry.facebook && a.artist_facebook) entry.facebook = a.artist_facebook;
      if (!entry.instagram && a.artist_instagram) entry.instagram = a.artist_instagram;
      if (tr.title) entry.tracks.push(tr.title);
    });
  });
  return Array.from(map.values());
}

function LinkRow({ icon: Icon, label, value }) {
  const url = clean(value);
  return (
    <div className="flex items-center gap-2 text-xs">
      <Icon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
      <span className="text-slate-500 w-20 shrink-0">{label}</span>
      {url ? (
        <a href={url} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline truncate">{value}</a>
      ) : (
        <span className="text-amber-600 font-medium">Not provided</span>
      )}
    </div>
  );
}

export default function ArtistProfiles({ tracks = [] }) {
  const artists = collectArtists(tracks);

  if (artists.length === 0) {
    return <p className="text-sm text-slate-400">No artist details on this release.</p>;
  }

  return (
    <div className="space-y-2">
      {artists.map((a, i) => {
        const noSpotify = !clean(a.spotify);
        const missingSocial = !clean(a.facebook) || !clean(a.instagram);
        return (
          <div key={i} className="rounded-lg border p-3 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="font-medium text-sm flex items-center gap-1.5">
                <Music2 className="w-3.5 h-3.5 text-indigo-600" /> {a.name}
              </span>
              <span className="text-xs text-slate-400">{a.tracks.length} track{a.tracks.length === 1 ? '' : 's'}</span>
            </div>
            <LinkRow icon={Music2} label="Spotify" value={a.spotify} />
            <LinkRow icon={Facebook} label="Facebook" value={a.facebook} />
            <LinkRow icon={Instagram} label="Instagram" value={a.instagram} />
            {noSpotify && missingSocial && (
              <p className="flex items-center gap-1.5 text-xs text-amber-600 pt-1">
                <AlertTriangle className="w-3.5 h-3.5" />
                No Spotify profile and missing social profile links — ask the client to complete this.
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}