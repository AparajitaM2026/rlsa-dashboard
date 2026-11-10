import { Badge } from '@/components/ui/badge';
import { Clock, ExternalLink } from 'lucide-react';
import { STREAMING_PLATFORMS, parseLinks, hasAnyLinks } from './StreamingLinksEditor';

const PLATFORM_COLORS = {
  spotify: 'bg-green-100 text-green-700 hover:bg-green-200',
  itunes: 'bg-rose-100 text-rose-700 hover:bg-rose-200',
  amazon: 'bg-orange-100 text-orange-700 hover:bg-orange-200',
  gaana: 'bg-red-100 text-red-700 hover:bg-red-200',
  jiosaavn: 'bg-violet-100 text-violet-700 hover:bg-violet-200'
};

export default function StreamingLinksDisplay({ release }) {
  const links = parseLinks(release.streaming_links);

  if (!hasAnyLinks(links)) {
    return (
      <Badge variant="secondary" className="text-xs bg-amber-100 text-amber-700">
        <Clock className="w-3 h-3 mr-1" /> Link Pending
      </Badge>
    );
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {STREAMING_PLATFORMS.map((p) => {
        const url = (links[p.key] || '').trim();
        if (!url) return null;
        return (
          <a
            key={p.key}
            href={url}
            target="_blank"
            rel="noreferrer"
            className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors ${PLATFORM_COLORS[p.key] || 'bg-slate-100 text-slate-700'}`}
          >
            {p.label} <ExternalLink className="w-3 h-3" />
          </a>
        );
      })}
      {(links.custom || []).map((c, i) => {
        const url = (c.url || '').trim();
        if (!url) return null;
        return (
          <a
            key={i}
            href={url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors bg-slate-100 text-slate-700 hover:bg-slate-200"
          >
            {c.name || 'Link'} <ExternalLink className="w-3 h-3" />
          </a>
        );
      })}
    </div>
  );
}