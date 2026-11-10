import { useState, useEffect, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { AlertTriangle, UploadCloud, FileSpreadsheet, CheckCircle2, Loader2, Globe, Plus, X } from 'lucide-react';
import { formatNumber } from '@/lib/royalty';
import { logActivity } from '@/lib/activityLog';
import { useLanguage } from '@/lib/i18n';
import { useAuth } from '@/lib/AuthContext';
import { isSuperAdmin } from '@/lib/roles';
import { Navigate } from 'react-router-dom';

export default function ResourceUpload() {
  const [mode, setMode] = useState('file');
  const [file, setFile] = useState(null);
  const [remoteUrl, setRemoteUrl] = useState('');
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [vendorName, setVendorName] = useState('Orchard');
  const [multiMonth, setMultiMonth] = useState(false);
  const [vendors, setVendors] = useState([]);
  const [showAddVendor, setShowAddVendor] = useState(false);
  const [newVendorName, setNewVendorName] = useState('');
  const [addingVendor, setAddingVendor] = useState(false);
  const [vendorError, setVendorError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [job, setJob] = useState(null);
  const [error, setError] = useState(null);
  const timer = useRef(null);
  const { t } = useLanguage();
  const { user } = useAuth();

  useEffect(() => {
    base44.entities.Vendor.list('-created_date', 200)
      .then((v) => {
        setVendors(v);
        if (v.length > 0) setVendorName(v[0].name);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (vendorName.toUpperCase() === 'PDL') setMultiMonth(true);
  }, [vendorName]);

  // Show the newest import on load, so its live progress — and the completion
  // summary afterwards — is visible without re-uploading or keeping the tab open.
  useEffect(() => {
    base44.entities.CsvUploadJob.filter({}, { sort: '-created_date', limit: 1 })
      .then((page) => {
        const latest = page.items?.[0];
        if (latest) setJob(latest);
      })
      .catch(() => {});
  }, []);

  const handleAddVendor = async () => {
    const name = newVendorName.trim();
    if (!name) return;
    if (vendors.some((v) => v.name.toLowerCase() === name.toLowerCase())) {
      setVendorError(t('ru.vendor_exists'));
      return;
    }
    setAddingVendor(true);
    setVendorError(null);
    try {
      const created = await base44.entities.Vendor.create({ name, status: 'active' });
      setVendors((vs) => [...vs, created]);
      setVendorName(created.name);
      setNewVendorName('');
      setShowAddVendor(false);
      await logActivity({
        action: 'vendor_created',
        description: `Added vendor "${created.name}"`,
        entity_type: 'Vendor',
        entity_id: created.id,
      });
    } catch (err) {
      setVendorError(err.response?.data?.error || err.message || 'Failed to add vendor');
    } finally {
      setAddingVendor(false);
    }
  };

  // Poll the job until it reaches a terminal state.
  useEffect(() => {
    if (!job) return;
    if (job.status === 'completed' || job.status === 'failed') return;
    timer.current = setInterval(async () => {
      try {
        const updated = await base44.entities.CsvUploadJob.get(job.id);
        setJob(updated);
        if (updated.status === 'completed' || updated.status === 'failed') {
          clearInterval(timer.current);
          if (updated.status === 'completed') {
            logActivity({
              action: 'csv_upload_completed',
              description: `Completed ${updated.report_month} upload (${updated.vendor_name || 'Orchard'}) — ${updated.total} rows`,
              entity_type: 'CsvUploadJob',
              entity_id: updated.id,
              metadata: {
                vendor: updated.vendor_name || 'Orchard',
                total: updated.total,
                house: updated.house,
                client: updated.client,
                unmapped: updated.unmapped
              }
            });
          }
        }
      } catch (e) {
        /* keep polling */
      }
    }, 3000);
    return () => clearInterval(timer.current);
  }, [job?.id]);

  if (!isSuperAdmin(user)) return <Navigate to="/dashboard" replace />;

  const validUrl = (u) => /^https?:\/\/.+\.(csv|zip|gz|gzip)(\?.*)?$/i.test(u.trim());

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!month) return;
    setSubmitting(true);
    setError(null);
    setJob(null);
    let file_url;
    let label;
    try {
      if (mode === 'url') {
        const trimmed = remoteUrl.trim();
        if (!validUrl(trimmed)) {
          setError(t('ru.url_invalid'));
          return;
        }
        file_url = trimmed;
        label = trimmed.split('/').pop();
      } else {
        if (!file) return;
        ({ file_url } = await base44.integrations.Core.UploadFile({ file }));
        label = file.name;
      }
      const created = await base44.entities.CsvUploadJob.create({
        file_url,
        report_month: month,
        vendor_name: vendorName,
        multi_month: effectiveMultiMonth,
        status: 'pending'
      });
      setJob(created);
      logActivity({
        action: 'csv_upload_queued',
        description: `Queued ${label} for ${effectiveMultiMonth ? 'multi-month' : month} (${vendorName})`,
        entity_type: 'CsvUploadJob',
        entity_id: created.id,
        metadata: { report_month: month, vendor: vendorName, source: mode === 'url' ? 'remote_url' : 'file', file: label }
      });
    } catch (err) {
      setError(err.response?.data?.error || err.message || t('ru.upload_failed'));
    } finally {
      setSubmitting(false);
    }
  };

  const effectiveMultiMonth = multiMonth || vendorName.toUpperCase() === 'PDL';
  const processing = job && (job.status === 'pending' || job.status === 'processing');
  const canSubmit = mode === 'url' ? !!remoteUrl.trim() : !!file;

  return (
    <div>
      <PageHeader title={t('ru.title')} subtitle={t('ru.subtitle')} />
      <div className="grid lg:grid-cols-2 gap-6">
        <Card className="p-6">
          {/* Mode toggle */}
          <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-lg mb-4">
            <button
              type="button"
              onClick={() => setMode('file')}
              className={`flex items-center justify-center gap-1.5 py-2 rounded-md text-sm font-medium transition ${mode === 'file' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'}`}
            >
              <UploadCloud className="w-4 h-4" /> {t('ru.tab_file')}
            </button>
            <button
              type="button"
              onClick={() => setMode('url')}
              className={`flex items-center justify-center gap-1.5 py-2 rounded-md text-sm font-medium transition ${mode === 'url' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'}`}
            >
              <Globe className="w-4 h-4" /> {t('ru.tab_url')}
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="month">{t('ru.report_month')}</Label>
              <Input
                id="month"
                type="month"
                value={month}
                onChange={(e) => setMonth(e.target.value)}
                disabled={effectiveMultiMonth}
              />
              {effectiveMultiMonth && (
                <p className="text-xs text-slate-500">{t('ru.multi_month_hint')}</p>
              )}
            </div>

            {/* Multi-month toggle */}
            <div className="flex items-start gap-3 py-2.5 px-3 rounded-lg bg-slate-50 border border-slate-200">
              <input
                type="checkbox"
                id="multiMonth"
                checked={effectiveMultiMonth}
                disabled={vendorName.toUpperCase() === 'PDL'}
                onChange={(e) => setMultiMonth(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
              />
              <div>
                <label htmlFor="multiMonth" className="text-sm font-medium cursor-pointer">
                  {t('ru.multi_month')}
                </label>
                <p className="text-xs text-slate-500 mt-0.5">
                  {vendorName.toUpperCase() === 'PDL'
                    ? t('ru.multi_month_pdl_auto')
                    : t('ru.multi_month_desc')}
                </p>
              </div>
            </div>

            {/* Vendor dropdown + add button */}
            <div className="space-y-1">
              <Label htmlFor="vendor">{t('ru.vendor')}</Label>
              <div className="flex gap-2">
                <select
                  id="vendor"
                  value={vendorName}
                  onChange={(e) => setVendorName(e.target.value)}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm"
                >
                  {vendors.map((v) => (
                    <option key={v.id} value={v.name}>{v.name}</option>
                  ))}
                </select>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => { setShowAddVendor(true); setVendorError(null); }}
                  className="shrink-0"
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {mode === 'file' ? (
              <div className="space-y-1">
                <Label htmlFor="file">{t('ru.csv_file')}</Label>
                <label
                  htmlFor="file"
                  className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-200 rounded-xl py-8 cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/30 transition"
                >
                  <FileSpreadsheet className="w-8 h-8 text-slate-400" />
                  <span className="text-sm text-slate-500">
                    {file ? file.name : t('ru.choose')}
                  </span>
                  <Input
                    id="file"
                    type="file"
                    accept=".csv,.xlsx,.xls,.zip,.gz"
                    className="hidden"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                  />
                </label>
              </div>
            ) : (
              <div className="space-y-1">
                <Label htmlFor="url">{t('ru.url_label')}</Label>
                <div className="relative">
                  <Globe className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <Input
                    id="url"
                    type="url"
                    value={remoteUrl}
                    onChange={(e) => setRemoteUrl(e.target.value)}
                    placeholder={t('ru.url_ph')}
                    className="pl-9"
                  />
                </div>
                <p className="text-xs text-slate-400">{t('ru.url_note')}</p>
              </div>
            )}

            <Button type="submit" disabled={!canSubmit || submitting || processing} className="w-full">
              {mode === 'url' ? <Globe className="w-4 h-4 mr-1" /> : <UploadCloud className="w-4 h-4 mr-1" />}
              {submitting ? t('ru.uploading') : processing ? t('ru.processing') : (mode === 'url' ? t('ru.import') : t('ru.upload'))}
            </Button>
            <p className="text-xs text-slate-400">{t('ru.note')}</p>
            {error && (
              <p className="text-sm text-rose-600 bg-rose-50 rounded-lg p-3">{error}</p>
            )}
          </form>
        </Card>

        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">{t('ru.result')}</h2>
            {job && (
              <Badge
                variant={
                  job.status === 'completed'
                    ? 'default'
                    : job.status === 'failed'
                    ? 'destructive'
                    : 'secondary'
                }
                className="capitalize"
              >
                {job.status}
              </Badge>
            )}
          </div>

          {!job && !submitting && (
            <p className="text-sm text-slate-400">{t('ru.placeholder')}</p>
          )}

          {processing && (() => {
            const pct = job.bytes_total
              ? Math.min(100, Math.round((job.bytes_processed / job.bytes_total) * 100))
              : null;
            return (
              <div className="space-y-3">
                <div className="flex items-center gap-3 text-slate-600">
                  <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />
                  <span className="capitalize font-medium">{job.status}</span>
                </div>
                <Progress value={pct ?? 0} className="h-2" />
                <p className="text-sm text-slate-500">
                  {pct != null
                    ? t('ru.rows_parsed', { pct, n: formatNumber(job.rows_processed) })
                    : t('ru.rows_parsed_nopct', { n: formatNumber(job.rows_processed) })}
                </p>
                {job.bytes_total > 0 && (
                  <p className="text-xs text-slate-400">
                    {t('ru.kb', { a: formatNumber(Math.round(job.bytes_processed / 1024)), b: formatNumber(Math.round(job.bytes_total / 1024)) })}
                  </p>
                )}
              </div>
            );
          })()}

          {job?.status === 'failed' && (
            <div className="flex items-start gap-2 text-rose-600 bg-rose-50 rounded-lg p-3 text-sm">
              <AlertTriangle className="w-4 h-4 mt-0.5" />
              <span>{job.error || t('ru.failed')}</span>
            </div>
          )}

          {job?.status === 'completed' && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-emerald-600">
                <CheckCircle2 className="w-5 h-5" />
                <span className="font-medium">{t('ru.completed')}</span>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Stat label={t('ru.total_rows')} value={formatNumber(job.total)} />
                <Stat label={t('ru.house_catalog')} value={formatNumber(job.house)} tone="amber" />
                <Stat label={t('ru.client_rows')} value={formatNumber(job.client)} tone="indigo" />
                <Stat label={t('ru.unmapped')} value={formatNumber(job.unmapped)} tone="rose" />
              </div>
              {job.unmapped_imprints?.length > 0 && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                  <div className="flex items-center gap-2 text-amber-700 font-medium text-sm mb-2">
                    <AlertTriangle className="w-4 h-4" />
                    {t('ru.unmapped_warning', { n: job.unmapped_imprints.length })}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {job.unmapped_imprints.map((im) => (
                      <span key={im} className="text-xs bg-white border border-amber-200 rounded px-2 py-1">{im}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </Card>
      </div>

      {/* Add New Vendor modal */}
      {showAddVendor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowAddVendor(false)}>
          <div className="bg-card rounded-xl shadow-lg border p-6 w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-lg">{t('ru.add_vendor')}</h3>
              <button onClick={() => setShowAddVendor(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="newVendor">{t('ru.vendor_name')}</Label>
                <Input
                  id="newVendor"
                  value={newVendorName}
                  onChange={(e) => setNewVendorName(e.target.value)}
                  placeholder={t('ru.vendor_name_ph')}
                  autoFocus
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddVendor(); } }}
                />
              </div>
              {vendorError && <p className="text-sm text-rose-600">{vendorError}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => { setShowAddVendor(false); setVendorError(null); setNewVendorName(''); }}>{t('sup.cancel')}</Button>
                <Button onClick={handleAddVendor} disabled={!newVendorName.trim() || addingVendor}>
                  {addingVendor ? t('ru.vendor_adding') : t('ru.add_vendor')}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone }) {
  const tones = {
    amber: 'bg-amber-50 text-amber-700',
    indigo: 'bg-indigo-50 text-indigo-700',
    rose: 'bg-rose-50 text-rose-700'
  };
  return (
    <div className={`rounded-lg p-3 ${tones[tone] || 'bg-slate-50 text-slate-700'}`}>
      <p className="text-xs opacity-70">{label}</p>
      <p className="text-xl font-semibold">{value}</p>
    </div>
  );
}