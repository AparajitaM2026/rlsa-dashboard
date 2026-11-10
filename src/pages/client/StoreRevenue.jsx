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
import { Search, ArrowUpDown, Store as StoreIcon } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Cell
} from 'recharts';
import { useLanguage } from '@/lib/i18n';
import { PeriodFilterBar, usePeriodFilter, formatMonthLabel } from '@/lib/PeriodFilterContext';
import { formatCurrency, formatNumber, scaleRevenue, sumField } from '@/lib/royalty';

const SORTS = {
  payout: { tKey: 'store.sort_top_earning', fn: (a, b) => b.payout - a.payout },
  units: { tKey: 'store.sort_most_units', fn: (a, b) => b.units - a.units },
  name: { tKey: 'store.sort_store_name', fn: (a, b) => a.name.localeCompare(b.name) }
};

const CHART_COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#14b8a6'];

export default function StoreRevenue() {
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
        <p className="text-slate-500">{t('common.no_account')}</p>
      </Card>
    );
  }

  const sharePct = data?.sharePct != null ? data.sharePct : (clientAccount?.revenue_share_pct || 0);

  let stores = (data?.perStore || []).map((s) => ({
    name: s.key,
    units: s.units,
    gross: s.gross,
    payout: scaleRevenue(s.gross, sharePct)
  }));

  if (query) {
    const q = query.toLowerCase();
    stores = stores.filter((x) => x.name.toLowerCase().includes(q));
  }

  stores.sort(SORTS[sort].fn);

  const totalUnits = sumField(stores, 'units');
  const totalGross = sumField(stores, 'gross');
  const totalPayout = sumField(stores, 'payout');
  const topStores = [...stores].sort((a, b) => b.payout - a.payout).slice(0, 8);

  return (
    <div>
      <PageHeader
        title={t('store.title')}
        subtitle={t('store.subtitle', { share: sharePct, period: formatMonthLabel(selected) })}
      >
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input
            placeholder={t('store.search_placeholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </PageHeader>

      <PeriodFilterBar />

      <div className="grid sm:grid-cols-3 gap-4 mb-6">
        <Card className="p-4">
          <p className="text-xs text-slate-500">{t('store.stores')}</p>
          <p className="text-xl font-semibold mt-1">{formatNumber(stores.length)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500">{t('store.total_units')}</p>
          <p className="text-xl font-semibold mt-1">{formatNumber(totalUnits)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500">{t('store.client_payout')}</p>
          <p className="text-xl font-semibold mt-1 text-emerald-600">{formatCurrency(totalPayout)}</p>
        </Card>
      </div>

      {topStores.length > 0 && (
        <Card className="overflow-hidden mb-6">
          <div className="px-5 py-4 border-b flex items-center gap-2">
            <StoreIcon className="w-4 h-4 text-indigo-600" />
            <h2 className="font-semibold">{t('store.top_stores')}</h2>
          </div>
          <div className="p-5 h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={topStores}
                layout="vertical"
                margin={{ left: 10, right: 30, top: 5, bottom: 5 }}
              >
                <CartesianGrid horizontal={false} stroke="rgba(255, 255, 255, 0.08)" />
                <XAxis type="number" tickFormatter={(v) => `$${Number(v).toFixed(0)}`} tick={{ fontSize: 11 }} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={120}
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => (String(v).length > 16 ? String(v).slice(0, 15) + '…' : v)}
                />
                <Tooltip
                  formatter={(v) => formatCurrency(v)}
                  contentStyle={{ fontSize: 12, borderRadius: 8 }}
                />
                <Bar dataKey="payout" radius={[0, 4, 4, 0]}>
                  {topStores.map((_, i) => (
                    <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="px-5 py-4 border-b flex flex-wrap items-center gap-2 justify-between">
          <h2 className="font-semibold flex items-center gap-2">
            <StoreIcon className="w-4 h-4 text-indigo-600" /> {t('store.store_wise_revenue')}
          </h2>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-slate-500">{t('store.sort')}</span>
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
              <TableHead>{t('store.store_dsp')}</TableHead>
              <TableHead className="text-right">
                <button onClick={() => setSort('units')} className="inline-flex items-center gap-1 hover:text-slate-700">
                  {t('store.units')} <ArrowUpDown className="w-3 h-3" />
                </button>
              </TableHead>
              <TableHead className="text-right">
                <button onClick={() => setSort('payout')} className="inline-flex items-center gap-1 hover:text-slate-700">
                  {t('store.client_payout')} <ArrowUpDown className="w-3 h-3" />
                </button>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {stores.map((row, i) => (
              <TableRow key={i}>
                <TableCell className="font-medium">{row.name}</TableCell>
                <TableCell className="text-right">{formatNumber(row.units)}</TableCell>
                <TableCell className="text-right font-semibold text-emerald-600">
                  {formatCurrency(row.payout)}
                </TableCell>
              </TableRow>
            ))}
            {stores.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-slate-400 py-8">
                  {t('store.no_data')}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}