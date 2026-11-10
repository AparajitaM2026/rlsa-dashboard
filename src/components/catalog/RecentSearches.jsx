import { useState } from 'react';
import { Clock, ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/lib/i18n';

// Dropdown showing recently completed background catalog searches.
// Clicking a job loads its cached results instantly without re-querying.
export default function RecentSearches({ jobs, onLoadJob, t }) {
  const [open, setOpen] = useState(false);
  if (!jobs || jobs.length === 0) return null;

  return (
    <div className="relative">
      <Button variant="outline" size="sm" onClick={() => setOpen(!open)}>
        <Clock className="w-3.5 h-3.5 mr-1.5" />
        {t('ca.recent_searches')}
        <ChevronDown className="w-3 h-3 ml-1" />
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute top-full mt-1 right-0 w-80 bg-white border rounded-lg shadow-lg z-20 max-h-96 overflow-y-auto">
            {jobs.map((job) => (
              <button
                key={job.id}
                onClick={() => { onLoadJob(job); setOpen(false); }}
                className="w-full text-left px-3 py-2.5 hover:bg-slate-50 border-b last:border-0"
              >
                <div className="font-medium text-sm truncate">&ldquo;{job.query}&rdquo;</div>
                <div className="text-xs text-muted-foreground flex justify-between mt-0.5 gap-2">
                  <span className="truncate">{job.source_label || job.source}</span>
                  <span className="shrink-0">{t('ca.tracks_found', { n: job.track_count })}</span>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}