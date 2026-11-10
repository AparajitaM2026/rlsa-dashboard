import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useClientAggregates } from '@/lib/useClientAggregates';
import { useActiveClient } from '@/lib/ClientContext';
import { base44 } from '@/api/base44Client';
import PageHeader from '@/components/PageHeader';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { useLanguage } from '@/lib/i18n';
import { formatCurrency, formatNumber, scaleRevenue } from '@/lib/royalty';
import { PeriodFilterBar, usePeriodFilter, formatMonthLabel } from '@/lib/PeriodFilterContext';
import { Search, Plus, CheckCircle2, XCircle, Clock, Music, Edit2, Trash2, Loader2 } from 'lucide-react';
import { logActivity } from '@/lib/activityLog';
import StreamingLinksDisplay from '@/components/release/StreamingLinksDisplay';
import RectificationDialog from '@/components/release/RectificationDialog';

const RELEASE_STATUS = {
  draft: { label: 'Draft', icon: Clock, color: 'text-slate-600', bg: 'bg-slate-100' },
  pending_review: { label: 'Pending Review', icon: Clock, color: 'text-amber-600', bg: 'bg-amber-100' },
  approved: { label: 'Approved', icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-100' },
  rejected: { label: 'Action Needed', icon: XCircle, color: 'text-red-600', bg: 'bg-red-100' }
};

export default function Repertoire() {
  const { clientAccount, loading, data, dataLoading } = useClientAggregates();
  const { accountIds } = useActiveClient();
  const { selected } = usePeriodFilter();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [releases, setReleases] = useState([]);
  const [deletingId, setDeletingId] = useState(null);
  const [noticeRelease, setNoticeRelease] = useState(null);

  const fetchReleases = () => {
    if (accountIds.length === 0) { setReleases([]); return; }
    base44.entities.Release.filter({ client_account_id: { $in: accountIds } }, '-created_date', 200)
      .then(setReleases)
      .catch(() => {});
  };

  useEffect(() => {
    fetchReleases();
  }, [accountIds.join(',')]);

  const handleDeleteRelease = async (release) => {
    if (!window.confirm(`Are you sure you want to delete "${release.release_title || 'this release'}"?`)) return;
    setDeletingId(release.id);
    try {
      await base44.entities.Release.delete(release.id);
      await logActivity({
        action: 'release_deleted',
        description: `Release "${release.release_title}" deleted`,
        entity_type: 'Release',
        entity_id: release.id
      });
      fetchReleases();
    } catch (err) {
      alert('Failed to delete release: ' + (err.message || 'Unknown error'));
    } finally {
      setDeletingId(null);
    }
  };

  if (loading || dataLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!clientAccount) {
    return (
      <Card className="p-8 text-center">
        <p className="text-slate-500">
          {t('common.no_account')}
        </p>
      </Card>
    );
  }

  const sharePct = data?.sharePct != null ? data.sharePct : (clientAccount?.revenue_share_pct || 0);

  let catalog = (data?.perTrack || []).map((tr) => ({
    isrc: tr.isrc,
    track_title: tr.track_title,
    album_title: tr.album_title,
    artist: tr.artist,
    units: tr.units,
    gross: tr.gross
  })).sort((a, b) => b.gross - a.gross);

  if (query) {
    const q = query.toLowerCase();
    catalog = catalog.filter(
      (c) =>
        c.track_title.toLowerCase().includes(q) ||
        c.album_title.toLowerCase().includes(q) ||
        c.artist.toLowerCase().includes(q) ||
        c.isrc.toLowerCase().includes(q)
    );
  }

  return (
    <div>
      <PageHeader
        title={t('repertoire.title')}
        subtitle={t('repertoire.subtitle', { count: catalog.length, share: sharePct, period: formatMonthLabel(selected) })}
      >
        <div className="flex items-center gap-3">
          <div className="relative w-full sm:w-56">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <Input
              placeholder={t('repertoire.search_placeholder')}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button asChild>
            <Link to="/client/repertoire/upload">
              <Plus className="w-4 h-4" /> {t('repertoire.upload_new')}
            </Link>
          </Button>
        </div>
      </PageHeader>

      <PeriodFilterBar />

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('repertoire.track')}</TableHead>
              <TableHead>{t('repertoire.album')}</TableHead>
              <TableHead>{t('repertoire.artist')}</TableHead>
              <TableHead>{t('repertoire.isrc')}</TableHead>
              <TableHead className="text-right">{t('repertoire.units')}</TableHead>
              <TableHead className="text-right">{t('repertoire.net_share', { share: sharePct })}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {catalog.map((c, i) => (
              <TableRow key={i}>
                <TableCell className="font-medium">{c.track_title}</TableCell>
                <TableCell className="text-slate-500">{c.album_title}</TableCell>
                <TableCell className="text-slate-500">{c.artist}</TableCell>
                <TableCell className="text-slate-400 text-xs font-mono">{c.isrc}</TableCell>
                <TableCell className="text-right">{formatNumber(c.units)}</TableCell>
                <TableCell className="text-right font-semibold text-emerald-600">
                  {formatCurrency(scaleRevenue(c.gross, sharePct))}
                </TableCell>
              </TableRow>
            ))}
            {catalog.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-slate-400 py-8">
                  {t('repertoire.no_data')}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      {/* My Releases — submission status */}
      <div className="mt-8">
        <h2 className="text-lg font-semibold mb-3">{t('repertoire.my_releases')}</h2>
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('repertoire.release_title')}</TableHead>
                <TableHead>{t('repertoire.release_type')}</TableHead>
                <TableHead>UPC/EAN</TableHead>
                <TableHead>ISRC</TableHead>
                <TableHead>{t('repertoire.release_status')}</TableHead>
                <TableHead>Streaming Links</TableHead>
                <TableHead>{t('repertoire.release_date')}</TableHead>
                <TableHead>{t('repertoire.submitted_date')}</TableHead>
                <TableHead>{t('repertoire.admin_remarks')}</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {releases.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="text-center text-slate-400 py-8">
                    {t('repertoire.no_releases')}
                  </TableCell>
                </TableRow>
              )}
              {releases.map((r) => {
                const cfg = RELEASE_STATUS[r.status] || RELEASE_STATUS.pending_review;
                const StatusIcon = cfg.icon;
                return (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        {r.artwork_url && <img src={r.artwork_url} alt="" className="w-8 h-8 rounded object-cover" />}
                        <span>{r.release_title}</span>
                      </div>
                    </TableCell>
                    <TableCell><Badge variant="outline" className="uppercase text-xs">{r.release_type}</Badge></TableCell>
                    <TableCell className="text-sm font-mono">{r.upc_ean || <span className="text-slate-400">Pending</span>}</TableCell>
                    <TableCell className="text-sm">
                      {(() => {
                        const trs = Array.isArray(r.tracks) ? r.tracks : (() => { try { return JSON.parse(r.tracks || '[]'); } catch { return []; } })();
                        if (trs.length === 0) return <span className="text-slate-400">—</span>;
                        const isrcs = trs.map((tr) => tr.isrc).filter(Boolean);
                        if (isrcs.length === 0) return <span className="text-amber-600">Pending</span>;
                        if (trs.length === 1) return <span className="font-mono text-xs">{trs[0].isrc}</span>;
                        return (
                          <div className="space-y-0.5">
                            {trs.map((tr, i) => (
                              <div key={i} className="font-mono text-xs">
                                <span className="text-slate-400">{i + 1}.</span> {tr.isrc || <span className="text-amber-600">Pending</span>}
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${cfg.bg} ${cfg.color}`}>
                        <StatusIcon className="w-3.5 h-3.5" /> {cfg.label}
                      </span>
                    </TableCell>
                    <TableCell>
                      {r.status === 'approved'
                        ? <StreamingLinksDisplay release={r} />
                        : <span className="text-slate-400 text-xs">—</span>}
                    </TableCell>
                    <TableCell className="text-slate-500 text-sm">{r.release_date || '—'}</TableCell>
                    <TableCell className="text-slate-400 text-sm">{new Date(r.created_date).toLocaleDateString()}</TableCell>
                    <TableCell className="text-sm max-w-xs">
                      {r.admin_remarks ? (
                        <button onClick={() => setNoticeRelease(r)} className="text-red-600 font-medium hover:underline text-left">
                          Read notice
                        </button>
                      ) : <span className="text-slate-400">—</span>}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => navigate(`/client/repertoire/upload?edit=${r.id}`)}
                          className="h-8 px-2.5 text-xs text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 border-indigo-200"
                          title="Edit release details"
                        >
                          <Edit2 className="w-3.5 h-3.5 mr-1" /> Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDeleteRelease(r)}
                          disabled={deletingId === r.id}
                          className="h-8 px-2 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                          title="Delete release"
                        >
                          {deletingId === r.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      </div>

      <RectificationDialog release={noticeRelease} onClose={() => setNoticeRelease(null)} />
    </div>
  );
}