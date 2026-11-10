import { useClientAggregates } from '@/lib/useClientAggregates';
import PageHeader from '@/components/PageHeader';
import MetricCard from '@/components/MetricCard';
import { Card } from '@/components/ui/card';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid
} from 'recharts';
import {
  Banknote,
  Music2,
  Headphones,
  Globe2,
  Store,
  TrendingUp
} from 'lucide-react';
import { useLanguage } from '@/lib/i18n';
import { formatCurrency, formatNumber, scaleRevenue } from '@/lib/royalty';
import { PeriodFilterBar, usePeriodFilter, formatMonthLabel } from '@/lib/PeriodFilterContext';

export default function Dashboard() {
  const { clientAccount, loading, data, dataLoading, error } = useClientAggregates();
  const { selected } = usePeriodFilter();
  const { t } = useLanguage();

  if (loading || dataLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <Card className="p-8 text-center border-red-200 bg-red-50/50">
        <p className="text-red-600 font-medium">{error}</p>
      </Card>
    );
  }

  if (!clientAccount) {
    return (
      <Card className="p-8 text-center">
        <p className="text-slate-500">
          {t('common.no_account_staff')}
        </p>
      </Card>
    );
  }

  const sharePct = data?.sharePct != null ? data.sharePct : (clientAccount?.revenue_share_pct || 0);
  const scale = (v) => scaleRevenue(v, sharePct);

  const gross = data?.gross || 0;
  const net = scale(gross);
  const units = data?.units || 0;
  const trackCount = data?.trackCount || 0;
  const monthly = data?.monthly || [];
  const latest = monthly[monthly.length - 1];
  const latestMonth = latest?.month || '—';
  const latestNet = latest ? scale(latest.gross) : 0;

  const topStore = (data?.perStore || [])[0];
  const topCountry = (data?.perCountry || [])[0];

  const monthlyChart = monthly.map((m) => ({
    month: m.month,
    revenue: scale(m.gross)
  }));

  return (
    <div>
      <PageHeader
        title={t('dashboard.title', { name: clientAccount.client_name })}
        subtitle={t('dashboard.subtitle', { share: sharePct, period: formatMonthLabel(selected) })}
      />
      <PeriodFilterBar />
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <MetricCard
          label={t('dashboard.net_revenue')}
          value={formatCurrency(net)}
          icon={Banknote}
          accent="bg-emerald-50 text-emerald-600"
        />
        <MetricCard
          label={t('dashboard.net_revenue_latest', { month: latestMonth })}
          value={formatCurrency(latestNet)}
          sub={t('dashboard.most_recent_month')}
          icon={TrendingUp}
        />
        <MetricCard
          label={t('dashboard.total_streams')}
          value={formatNumber(units)}
          icon={Headphones}
          accent="bg-indigo-50 text-indigo-600"
        />
        <MetricCard
          label={t('dashboard.catalog_tracks')}
          value={formatNumber(trackCount)}
          icon={Music2}
          accent="bg-violet-50 text-violet-600"
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-6 mb-6">
        <Card className="p-5">
          <h2 className="font-semibold mb-4">{t('dashboard.monthly_net_revenue')}</h2>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyChart} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="rgba(255, 255, 255, 0.08)" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} width={70} />
                <Tooltip formatter={(v) => formatCurrency(v)} />
                <Bar dataKey="revenue" radius={[6, 6, 0, 0]} fill="#10b981" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="p-5">
          <h2 className="font-semibold mb-4">{t('dashboard.top_sources')}</h2>
          <div className="space-y-4">
            <SourceRow
              icon={Store}
              label={t('dashboard.top_store')}
              name={topStore?.key || '—'}
              value={formatCurrency(scale(topStore?.gross || 0))}
            />
            <SourceRow
              icon={Globe2}
              label={t('dashboard.top_country')}
              name={topCountry?.key || '—'}
              value={formatCurrency(scale(topCountry?.gross || 0))}
            />
          </div>
        </Card>
      </div>
    </div>
  );
}

function SourceRow({ icon: Icon, label, name, value }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border p-4">
      <div className="rounded-lg bg-indigo-50 text-indigo-600 p-2">
        <Icon className="w-5 h-5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-slate-500">{label}</p>
        <p className="font-medium truncate">{name}</p>
      </div>
      <p className="font-semibold text-emerald-600">{value}</p>
    </div>
  );
}