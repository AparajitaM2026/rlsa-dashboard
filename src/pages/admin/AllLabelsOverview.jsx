import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import PageHeader from '@/components/PageHeader';
import MetricCard from '@/components/MetricCard';
import { Card } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Banknote, Building2, Users, Scale, ExternalLink, Layers, Home } from 'lucide-react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { isSuperAdmin } from '@/lib/roles';
import { formatCurrency, formatNumber } from '@/lib/royalty';
import { PeriodFilterBar, usePeriodFilter, formatMonthLabel } from '@/lib/PeriodFilterContext';
import { useLanguage } from '@/lib/i18n';

// Merge one or more MonthlyAggregate records (a single period, or every period
// when "all" is selected) into the summary + per-client + per-vendor maps the
// overview needs. Totals are read from the server-side cache (computed once per
// upload by the workflow's aggregateRevenue step) so they reflect EVERY routed
// row — re-scanning 400k+ RevenueRow records on each page load is not feasible.
const buildSummary = (aggs) => {
  const out = {
    houseGross: 0, houseRows: 0,
    clientGross: 0, clientRows: 0,
    unmappedGross: 0, unmappedRows: 0,
    totalRows: 0,
    perClient: new Map(),
    perVendor: new Map(),
    houseImprints: new Map(),
  };
  for (const a of aggs || []) {
    out.houseGross += Number(a.house_gross) || 0;
    out.houseRows += Number(a.house_rows) || 0;
    out.clientGross += Number(a.client_gross) || 0;
    out.clientRows += Number(a.client_rows) || 0;
    out.unmappedGross += Number(a.unmapped_gross) || 0;
    out.unmappedRows += Number(a.unmapped_rows) || 0;
    out.totalRows += Number(a.total_rows) || 0;
    const pc = a.per_client ? JSON.parse(a.per_client) : [];
    for (const c of pc) {
      const e = out.perClient.get(c.client_account_id) || { gross: 0, units: 0, trackCount: 0 };
      e.gross += Number(c.gross) || 0;
      e.units += Number(c.units) || 0;
      e.trackCount += Number(c.track_count) || 0;
      out.perClient.set(c.client_account_id, e);
    }
    const pv = a.per_vendor ? JSON.parse(a.per_vendor) : [];
    for (const v of pv) {
      const e = out.perVendor.get(v.key) || { gross: 0, units: 0, rows: 0 };
      e.gross += Number(v.gross) || 0;
      e.units += Number(v.units) || 0;
      e.rows += Number(v.rows) || 0;
      out.perVendor.set(v.key, e);
    }
    const pi = a.per_imprint ? JSON.parse(a.per_imprint) : [];
    for (const im of pi) {
      if (im.is_house) {
        const e = out.houseImprints.get(im.key) || { key: im.key, gross: 0, units: 0, rows: 0 };
        e.gross += Number(im.gross) || 0;
        e.units += Number(im.units) || 0;
        e.rows += Number(im.rows) || 0;
        out.houseImprints.set(im.key, e);
      }
    }
  }
  out.houseImprints = Array.from(out.houseImprints.values()).sort((a, b) => b.gross - a.gross);
  return out;
};

export default function AllLabelsOverview() {
  const [agg, setAgg] = useState(null);
  const [clients, setClients] = useState([]);
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [vendorFilter, setVendorFilter] = useState('all');
  const { selected } = usePeriodFilter();
  const { t } = useLanguage();
  const { user } = useAuth();

  useEffect(() => {
    setLoading(true);
    setError(null);
    const aggPromise =
      selected === 'all'
        ? base44.entities.MonthlyAggregate.list('-report_month', 500)
        : base44.entities.MonthlyAggregate.filter({ report_month: selected }, '-report_month', 1);
    Promise.all([
      aggPromise,
      base44.entities.ClientAccount.list('-created_date', 500),
      base44.entities.Vendor.list('-created_date', 500)
    ])
      .then(([a, c, v]) => {
        setAgg(buildSummary(a));
        setClients(c);
        setVendors(v.filter((x) => x.status === 'active'));
      })
      .catch((e) => setError(e?.message || 'Failed to load overview'))
      .finally(() => setLoading(false));
  }, [selected]);

  // Global vendor breakdown + house catalog totals are super-admin only.
  if (!isSuperAdmin(user)) return <Navigate to="/dashboard" replace />;

  const houseGross = agg?.houseGross || 0;
  const clientGross = agg?.clientGross || 0;
  const unmappedGross = agg?.unmappedGross || 0;
  const houseRows = agg?.houseRows || 0;
  const clientRows = agg?.clientRows || 0;
  const unmappedRows = agg?.unmappedRows || 0;

  const houseImprints = agg?.houseImprints || [];
  const vendorList = agg ? Array.from(agg.perVendor.entries()).map(([key, v]) => ({ key, ...v })) : [];
  // Always derive dropdown options from the Vendor entity so the filter shows
  // even when MonthlyAggregate.per_vendor hasn't been populated yet.
  const vendorOptions = vendors.map((v) => v.name);
  const vendorData = vendorFilter !== 'all' ? agg?.perVendor?.get(vendorFilter) : null;

  const perClient = clients
    .filter((c) => !c.is_house_account)
    .map((c) => {
      const e = agg?.perClient?.get(c.id) || { gross: 0, units: 0, trackCount: 0 };
      const gross = e.gross;
      const payout = gross * ((c.revenue_share_pct || 0) / 100);
      return { ...c, gross, payout, units: e.units, trackCount: e.trackCount };
    })
    .filter((c) => c.gross > 0)
    .sort((a, b) => b.payout - a.payout);

  const totalPayout = perClient.reduce((a, c) => a + c.payout, 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={t('overview.title')}
        subtitle={t('overview.subtitle', { period: formatMonthLabel(selected) })}
      />
      <PeriodFilterBar />

      {/* Vendor Filter */}
      {vendorOptions.length > 0 && (
        <div className="flex items-center gap-3 mb-6">
          <span className="text-sm font-medium text-foreground">{t('overview.vendor_filter')}:</span>
          <select
            value={vendorFilter}
            onChange={(e) => setVendorFilter(e.target.value)}
            className="h-9 rounded-md border border-input bg-card text-foreground border-border px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="all">{t('overview.all_vendors')}</option>
            {vendorOptions.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        </div>
      )}

      {error && (
        <Card className="p-4 mb-4 border-rose-200 bg-rose-50 text-rose-700 text-sm">
          {error}
        </Card>
      )}

      {vendorFilter === 'all' ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <MetricCard
            label={t('overview.house_revenue')}
            value={formatCurrency(houseGross)}
            sub={t('overview.rows_sub', { n: formatNumber(houseRows) })}
            icon={Building2}
            accent="bg-amber-50 text-amber-600"
          />
          <MetricCard
            label={t('overview.client_revenue')}
            value={formatCurrency(clientGross)}
            sub={t('overview.rows_sub', { n: formatNumber(clientRows) })}
            icon={Users}
            accent="bg-indigo-50 text-indigo-600"
          />
          <MetricCard
            label={t('overview.total_payouts')}
            value={formatCurrency(totalPayout)}
            sub={t('overview.after_share')}
            icon={Banknote}
            accent="bg-emerald-50 text-emerald-600"
          />
          <MetricCard
            label={t('overview.unmapped_revenue')}
            value={formatCurrency(unmappedGross)}
            sub={t('overview.rows_sub', { n: formatNumber(unmappedRows) })}
            icon={Scale}
            accent="bg-rose-50 text-rose-600"
          />
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          <MetricCard
            label={`${vendorFilter} — ${t('overview.vendor_gross')}`}
            value={formatCurrency(vendorData?.gross || 0)}
            sub={t('overview.rows_sub', { n: formatNumber(vendorData?.rows || 0) })}
            icon={Layers}
            accent="bg-indigo-50 text-indigo-600"
          />
          <MetricCard
            label={t('overview.vendor_units')}
            value={formatNumber(vendorData?.units || 0)}
            sub={t('overview.rows_sub', { n: formatNumber(vendorData?.rows || 0) })}
            icon={Layers}
            accent="bg-violet-50 text-violet-600"
          />
          <MetricCard
            label={t('overview.vendor_rows')}
            value={formatNumber(vendorData?.rows || 0)}
            sub={vendorFilter}
            icon={Layers}
            accent="bg-sky-50 text-sky-600"
          />
        </div>
      )}

      {/* Vendor Breakdown table */}
      {vendorList.length > 0 && (
        <Card className="overflow-hidden mb-6">
          <div className="px-5 py-4 border-b">
            <h2 className="font-semibold">{t('overview.vendor_breakdown')}</h2>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('overview.vendor')}</TableHead>
                <TableHead className="text-right">{t('overview.vendor_gross')}</TableHead>
                <TableHead className="text-right">{t('overview.vendor_units')}</TableHead>
                <TableHead className="text-right">{t('overview.vendor_rows')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {vendorList.map((v) => (
                <TableRow key={v.key} className={vendorFilter === v.key ? 'bg-indigo-50' : ''}>
                  <TableCell className="font-medium">{v.key}</TableCell>
                  <TableCell className="text-right">{formatCurrency(v.gross)}</TableCell>
                  <TableCell className="text-right">{formatNumber(v.units)}</TableCell>
                  <TableCell className="text-right">{formatNumber(v.rows)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      {/* House Catalog Breakdown */}
      {houseImprints.length > 0 && (
        <Card className="overflow-hidden mb-6">
          <div className="px-5 py-4 border-b flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Home className="w-4 h-4 text-amber-600" />
              <h2 className="font-semibold">{t('overview.house_breakdown')}</h2>
            </div>
            <Link to="/admin/catalog-manager" className="text-sm text-indigo-600 hover:underline">
              {t('overview.manage_catalog')} →
            </Link>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('overview.imprint')}</TableHead>
                <TableHead className="text-right">{t('overview.rows')}</TableHead>
                <TableHead className="text-right">{t('overview.units')}</TableHead>
                <TableHead className="text-right">{t('overview.gross_revenue')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {houseImprints.slice(0, 15).map((im) => (
                <TableRow key={im.key} className="cursor-pointer hover:bg-amber-50/50">
                  <TableCell className="font-medium truncate max-w-[260px]">
                    <Link
                      to={`/admin/house-imprint?name=${encodeURIComponent(im.key)}`}
                      className="inline-flex items-center gap-1 text-indigo-600 hover:underline"
                    >
                      {im.key}
                      <ExternalLink className="w-3.5 h-3.5" />
                    </Link>
                  </TableCell>
                  <TableCell className="text-right">{formatNumber(im.rows)}</TableCell>
                  <TableCell className="text-right">{formatNumber(im.units)}</TableCell>
                  <TableCell className="text-right font-medium">{formatCurrency(im.gross)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="px-5 py-4 border-b">
          <h2 className="font-semibold">{t('overview.client_payout_breakdown')}</h2>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('overview.client')}</TableHead>
              <TableHead className="text-right">{t('overview.share_pct')}</TableHead>
              <TableHead className="text-right">{t('overview.units')}</TableHead>
              <TableHead className="text-right">{t('overview.tracks')}</TableHead>
              <TableHead className="text-right">{t('overview.base_revenue')}</TableHead>
              <TableHead className="text-right">{t('overview.payout')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {perClient.map((c) => (
              <TableRow key={c.id}>
                <TableCell className="font-medium">
                  <Link
                    to={`/admin/client-profile?id=${c.id}`}
                    className="inline-flex items-center gap-1 text-indigo-600 hover:underline"
                  >
                    {c.client_name}
                    <ExternalLink className="w-3.5 h-3.5" />
                  </Link>
                </TableCell>
                <TableCell className="text-right">{c.revenue_share_pct}%</TableCell>
                <TableCell className="text-right">{formatNumber(c.units)}</TableCell>
                <TableCell className="text-right">{formatNumber(c.trackCount)}</TableCell>
                <TableCell className="text-right">{formatCurrency(c.gross)}</TableCell>
                <TableCell className="text-right font-semibold text-emerald-600">
                  {formatCurrency(c.payout)}
                </TableCell>
              </TableRow>
            ))}
            {perClient.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-slate-400 py-8">
                  {t('overview.no_data')}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}