import { useState } from 'react';
import { useClientAggregates } from '@/lib/useClientAggregates';
import PageHeader from '@/components/PageHeader';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Search, ArrowUpDown, Music } from 'lucide-react';
import { useLanguage } from '@/lib/i18n';
import { PeriodFilterBar, usePeriodFilter, formatMonthLabel } from '@/lib/PeriodFilterContext';
import { formatCurrency, formatNumber, scaleRevenue, sumField } from '@/lib/royalty';

const SORTS = {
  payout: { tKey: 'track.sort_top_earning', fn: (a, b) => b.payout - a.payout },
  units: { tKey: 'track.sort_most_units', fn: (a, b) => b.units - a.units },
  title: { tKey: 'track.sort_track_name', fn: (a, b) => a.track_title.localeCompare(b.track_title) }
};

export default function TrackRevenue() {
  const { clientAccount, loading, data, dataLoading } = useClientAggregates();
  const { selected } = usePeriodFilter();
  const { t } = useLanguage();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState('payout');

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
          Your account is not linked to a label client yet. Please contact OTT staff.
        </p>
      </Card>
    );
  }

  const sharePct = data?.sharePct != null ? data.sharePct : (clientAccount?.revenue_share_pct || 0);

  let catalog = (data?.perTrack || []).map((tr) => ({
    isrc: tr.isrc,
    track_title: tr.track_title,
    artist: tr.artist,
    units: tr.units,
    gross: tr.gross,
    payout: scaleRevenue(tr.gross, sharePct)
  }));

  if (query) {
    const q = query.toLowerCase();
    catalog = catalog.filter(
      (x) =>
        x.track_title.toLowerCase().includes(q) ||
        x.isrc.toLowerCase().includes(q) ||
        x.artist.toLowerCase().includes(q)
    );
  }

  catalog.sort(SORTS[sort].fn);

  const totalUnits = sumField(catalog, 'units');
  const totalGross = sumField(catalog, 'gross');
  const totalPayout = sumField(catalog, 'payout');

  return (
    <div>
      <PageHeader
        title={t('track.title')}
        subtitle={t('track.subtitle', { share: sharePct, period: formatMonthLabel(selected) })}
      >
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder={t('track.search_placeholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </PageHeader>

      <PeriodFilterBar />

      <div className="grid sm:grid-cols-3 gap-4 mb-6">
        <SummaryStat label={t('track.tracks')} value={formatNumber(catalog.length)} />
        <SummaryStat label={t('track.total_units')} value={formatNumber(totalUnits)} />
        <SummaryStat label={t('track.client_payout')} value={formatCurrency(totalPayout)} accent="text-emerald-600" />
      </div>

      <Card className="overflow-hidden">
        <div className="px-5 py-4 border-b flex flex-wrap items-center gap-2 justify-between">
          <h2 className="font-semibold flex items-center gap-2">
            <Music className="w-4 h-4 text-indigo-600" /> {t('track.track_wise_revenue')}
          </h2>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-slate-500">{t('track.sort')}</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="h-8 rounded-md border border-input bg-transparent px-2 text-sm"
            >
              {Object.entries(SORTS).map(([k, v]) => (
                <option key={k} value={k}>{t(v.tKey)}</option>
              ))}
            </select>
          </div>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('track.track_title')}</TableHead>
              <TableHead>{t('track.artist')}</TableHead>
              <TableHead>{t('track.isrc')}</TableHead>
              <TableHead className="text-right">
                <button onClick={() => setSort('units')} className="inline-flex items-center gap-1 hover:text-slate-700">
                  {t('track.units')} <ArrowUpDown className="w-3 h-3" />
                </button>
              </TableHead>
              <TableHead className="text-right">
                <button onClick={() => setSort('payout')} className="inline-flex items-center gap-1 hover:text-slate-700">
                  {t('track.client_payout')} <ArrowUpDown className="w-3 h-3" />
                </button>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {catalog.map((row, i) => (
              <TableRow key={i}>
                <TableCell className="font-medium">{row.track_title}</TableCell>
                <TableCell className="text-slate-500">{row.artist}</TableCell>
                <TableCell className="text-slate-400 text-xs font-mono">{row.isrc}</TableCell>
                <TableCell className="text-right">{formatNumber(row.units)}</TableCell>
                <TableCell className="text-right font-semibold text-emerald-600">
                  {formatCurrency(row.payout)}
                </TableCell>
              </TableRow>
            ))}
            {catalog.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-slate-400 py-8">
                  {t('track.no_data')}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

function SummaryStat({ label, value, accent }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-xl font-semibold mt-1 ${accent || ''}`}>{value}</p>
    </Card>
  );
}