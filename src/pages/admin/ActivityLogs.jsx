import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { isAdminLevel } from '@/lib/roles';
import { base44 } from '@/api/base44Client';
import PageHeader from '@/components/PageHeader';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { UploadCloud, Settings2, Trash2 } from 'lucide-react';
import { formatNumber } from '@/lib/royalty';
import { logActivity } from '@/lib/activityLog';
import { useLanguage } from '@/lib/i18n';

const statusTone = {
  completed: 'default',
  processing: 'secondary',
  pending: 'outline',
  failed: 'destructive'
};

export default function ActivityLogs() {
  const { user } = useAuth();
  const [jobs, setJobs] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [tab, setTab] = useState('all');
  const [vendorFilter, setVendorFilter] = useState('all');
  const { t } = useLanguage();
  const [deletingId, setDeletingId] = useState(null);

  const load = async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [j, l] = await Promise.all([
        base44.entities.CsvUploadJob.list('-created_date', 200),
        base44.entities.ActivityLog.list('-created_date', 200)
      ]);
      setJobs(j);
      setLogs(l);
    } catch (err) {
      setLoadError(err?.message || String(err) || 'Failed to load activity');
    } finally {
      setLoading(false);
    }
  };

  const deleteJob = async (e) => {
    if (!confirm(t('al.delete_confirm', { period: e.report_month }))) return;
    setDeletingId(e.id);
    try {
      await base44.entities.CsvUploadJob.delete(e.id);
      await logActivity({
        action: 'csv_upload_deleted',
        description: `Deleted CSV upload record (${e.report_month})`,
        entity_type: 'CsvUploadJob',
        entity_id: e.id
      });
      setJobs((js) => js.filter((j) => j.id !== e.id));
    } finally {
      setDeletingId(null);
    }
  };

  useEffect(() => { load(); }, []);

  const uploads = jobs.map((j) => ({
    type: 'upload',
    id: j.id,
    date: j.created_date,
    report_month: j.report_month,
    vendor: j.vendor_name || 'Orchard',
    title: t('al.upload_title', { period: j.report_month }),
    desc: t('al.upload_desc', { total: formatNumber(j.total), house: formatNumber(j.house), client: formatNumber(j.client), unmapped: formatNumber(j.unmapped) }),
    status: j.status,
    meta: (j.file_url || '').split('/').pop()
  }));
  const adminActions = logs.map((l) => ({
    type: 'admin',
    date: l.created_date,
    title: l.description || l.action,
    desc: l.action,
    status: null,
    meta: l.entity_type
  }));
  let events = [...uploads, ...adminActions].sort(
    (a, b) => new Date(b.date || 0) - new Date(a.date || 0)
  );
  if (tab === 'uploads') events = events.filter((e) => e.type === 'upload');
  if (tab === 'admin') events = events.filter((e) => e.type === 'admin');
  if (vendorFilter !== 'all') events = events.filter((e) => e.type === 'upload' && e.vendor === vendorFilter);

  const vendorOptions = [...new Set(jobs.map((j) => j.vendor_name || 'Orchard'))];

  if (user && !isAdminLevel(user)) return <Navigate to="/dashboard" replace />;

  const fmtDate = (d) => (d ? new Date(d).toLocaleString() : '—');

  return (
    <div>
      <PageHeader
        title={t('al.title')}
        subtitle={t('al.subtitle')}
      />
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex gap-2">
          {[
            { k: 'all', tKey: 'al.all' },
            { k: 'uploads', tKey: 'al.uploads' },
            { k: 'admin', tKey: 'al.admin_actions' }
          ].map((tb) => (
            <button
              key={tb.k}
              onClick={() => setTab(tb.k)}
              className={`px-3 py-1.5 rounded-lg text-sm border transition ${
                tab === tb.k ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white hover:bg-slate-50'
              }`}
            >
              {t(tb.tKey)}
            </button>
          ))}
        </div>
        {vendorOptions.length > 0 && (
          <div className="flex items-center gap-2 ms-auto">
            <span className="text-sm text-slate-500">{t('al.vendor_filter')}:</span>
            <select
              value={vendorFilter}
              onChange={(e) => setVendorFilter(e.target.value)}
              className="h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            >
              <option value="all">{t('al.all_vendors')}</option>
              {vendorOptions.map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-4 border-slate-200 border-t-indigo-600 rounded-full animate-spin" />
        </div>
      ) : loadError ? (
        <Card className="p-8 text-center">
          <p className="text-sm font-medium text-rose-600 mb-1">{t('al.load_error')}</p>
          <p className="text-xs text-slate-400 mb-4 break-all">{loadError}</p>
          <button
            onClick={load}
            className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm hover:bg-indigo-700"
          >
            {t('al.retry')}
          </button>
        </Card>
      ) : events.length === 0 ? (
        <Card className="p-8 text-center text-slate-500">{t('al.no_activity')}</Card>
      ) : (
        <div className="space-y-3">
          {events.map((e, i) => (
            <Card key={i} className="p-4 flex items-start gap-3">
              <div
                className={`p-2 rounded-lg ${
                  e.type === 'upload' ? 'bg-indigo-50 text-indigo-600' : 'bg-violet-50 text-violet-600'
                }`}
              >
                {e.type === 'upload' ? <UploadCloud className="w-5 h-5" /> : <Settings2 className="w-5 h-5" />}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-medium">{e.title}</p>
                  {e.status && (
                    <Badge variant={statusTone[e.status] || 'outline'} className="capitalize">
                      {e.status}
                    </Badge>
                  )}
                  {e.vendor && (
                    <Badge variant="secondary" className="text-xs">{e.vendor}</Badge>
                  )}
                </div>
                <p className="text-sm text-slate-500 mt-0.5">{e.desc}</p>
                {e.meta && <p className="text-xs text-slate-400 mt-1 truncate">{e.meta}</p>}
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className="text-xs text-slate-400 whitespace-nowrap">{fmtDate(e.date)}</span>
                {e.type === 'upload' && (
                  <button
                    onClick={() => deleteJob(e)}
                    disabled={deletingId === e.id}
                    className="p-1.5 rounded text-rose-500 hover:bg-rose-50 disabled:opacity-50"
                    title={t('al.delete_tooltip')}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}