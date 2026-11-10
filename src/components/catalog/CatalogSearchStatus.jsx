import { useState, useEffect, useRef } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { base44 } from '@/api/base44Client';
import { Loader2 } from 'lucide-react';
import { useLanguage } from '@/lib/i18n';
import { useToast } from '@/components/ui/use-toast';

// Persistent sidebar badge that shows active background catalog searches.
// Polls CatalogSearchJob entities with status pending/processing every 3s.
// When a job transitions from active to completed, fires a toast notification
// so the admin is alerted even if they navigated away from the Catalog page.
export default function CatalogSearchStatus() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const { toast } = useToast();
  const [activeJobs, setActiveJobs] = useState([]);
  const prevJobIds = useRef(new Set());

  useEffect(() => {
    if (user?.role !== 'admin') return;
    let mounted = true;
    const poll = async () => {
      try {
        const jobs = await base44.entities.CatalogSearchJob.filter(
          { status: { $in: ['pending', 'processing'] } },
          '-created_date', 10
        );
        if (!mounted) return;
        // Detect jobs that were active last poll but are now gone → completed.
        const currentIds = new Set(jobs.map((j) => j.id));
        for (const prevId of prevJobIds.current) {
          if (!currentIds.has(prevId)) {
            try {
              const finished = await base44.entities.CatalogSearchJob.get(prevId);
              if (finished?.status === 'completed') {
                toast({
                  title: t('ca.bg_search_complete', { query: finished.query, n: finished.track_count }),
                  description: t('ca.recent_searches_hint'),
                });
              }
            } catch { /* ignore — job may have been deleted */ }
          }
        }
        prevJobIds.current = currentIds;
        setActiveJobs(jobs);
      } catch { /* ignore transient errors */ }
    };
    poll();
    const interval = setInterval(poll, 3000);
    return () => { mounted = false; clearInterval(interval); };
  }, [user?.role, t, toast]);

  if (user?.role !== 'admin' || activeJobs.length === 0) return null;

  return (
    <div className="px-3 py-2 border-b border-slate-800">
      <div className="text-[10px] text-slate-400 uppercase tracking-wide mb-1 flex items-center gap-1">
        <Loader2 className="w-3 h-3 animate-spin" />
        {t('ca.active_searches')}
      </div>
      {activeJobs.slice(0, 3).map((job) => (
        <NavLink
          key={job.id}
          to="/admin/catalog-manager"
          className="block text-sm text-slate-300 hover:text-white truncate py-0.5"
          title={`"${job.query}"`}
        >
          &ldquo;{job.query}&rdquo;
        </NavLink>
      ))}
    </div>
  );
}