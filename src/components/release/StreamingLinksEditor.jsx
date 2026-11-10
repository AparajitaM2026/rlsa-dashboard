import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Link2, Plus, Trash2 } from 'lucide-react';

export const STREAMING_PLATFORMS = [
  { key: 'spotify', label: 'Spotify', placeholder: 'https://open.spotify.com/...' },
  { key: 'itunes', label: 'iTunes / Apple Music', placeholder: 'https://music.apple.com/...' },
  { key: 'amazon', label: 'Amazon Music', placeholder: 'https://music.amazon.com/...' },
  { key: 'gaana', label: 'Gaana', placeholder: 'https://gaana.com/...' },
  { key: 'jiosaavn', label: 'JioSaavn', placeholder: 'https://www.jiosaavn.com/...' }
];

export function parseLinks(raw) {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

export function hasAnyLinks(linksObj) {
  const fixed = STREAMING_PLATFORMS.some((p) => (linksObj[p.key] || '').trim());
  const custom = (linksObj.custom || []).some((c) => (c.url || '').trim());
  return fixed || custom;
}

export function emptyLinks() {
  const obj = {};
  STREAMING_PLATFORMS.forEach((p) => { obj[p.key] = ''; });
  obj.custom = [];
  return obj;
}

export default function StreamingLinksEditor({ links, onChange }) {
  const custom = links.custom || [];

  const addCustom = () => {
    onChange({ ...links, custom: [...custom, { name: '', url: '' }] });
  };

  const updateCustom = (i, field, value) => {
    onChange({ ...links, custom: custom.map((c, ci) => ci === i ? { ...c, [field]: value } : c) });
  };

  const removeCustom = (i) => {
    onChange({ ...links, custom: custom.filter((_, ci) => ci !== i) });
  };

  return (
    <div className="space-y-2.5">
      {STREAMING_PLATFORMS.map((p) => (
        <div key={p.key} className="flex items-center gap-2">
          <Label className="w-36 text-sm text-slate-600 whitespace-nowrap">{p.label}</Label>
          <Input
            value={links[p.key] || ''}
            onChange={(e) => onChange({ ...links, [p.key]: e.target.value })}
            placeholder={p.placeholder}
            className="h-8 text-sm flex-1"
          />
        </div>
      ))}

      {custom.map((c, i) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            value={c.name}
            onChange={(e) => updateCustom(i, 'name', e.target.value)}
            placeholder="Platform name"
            className="h-8 text-sm w-36"
          />
          <Input
            value={c.url}
            onChange={(e) => updateCustom(i, 'url', e.target.value)}
            placeholder="https://..."
            className="h-8 text-sm flex-1"
          />
          <Button size="icon" variant="ghost" onClick={() => removeCustom(i)} className="h-8 w-8 text-red-500 hover:text-red-600">
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      ))}

      <Button variant="outline" size="sm" onClick={addCustom} className="text-xs">
        <Plus className="w-3.5 h-3.5" /> Add Platform
      </Button>

      <p className="text-xs text-slate-400 flex items-center gap-1">
        <Link2 className="w-3 h-3" /> Paste the full streaming URL for each platform. Leave blank if not yet live.
      </p>
    </div>
  );
}