import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import PageHeader from '@/components/PageHeader';
import MetricCard from '@/components/MetricCard';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Wallet, TrendingUp, Clock, CheckCircle2 } from 'lucide-react';
import { useActiveClient } from '@/lib/ClientContext';
import { useLanguage } from '@/lib/i18n';
import { formatCurrency, formatNumber, sumField } from '@/lib/royalty';
import { PeriodFilterBar, usePeriodFilter, formatMonthLabel } from '@/lib/PeriodFilterContext';

const statusVariant = {
  paid: 'default',
  processing: 'secondary',
  pending: 'outline',
  failed: 'destructive'
};

export default function Payouts() {
  const { clientAccount, loading, accountIds, accountShareMap } = useActiveClient();
  const { selected, filterRows } = usePeriodFilter();
  const { t } = useLanguage();
  const [payouts, setPayouts] = useState([]);
  const [dataLoading, setDataLoading] = useState(true);

  useEffect(() => {
    if (accountIds.length === 0) { setPayouts([]); setDataLoading(false); return; }
    base44.entities.Payout
      .filter({ client_account_id: { $in: accountIds } }, '-payment_date', 200)
      .then(setPayouts)
      .finally(() => setDataLoading(false));
  }, [accountIds.join(',')]);

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

  const scoped = filterRows(payouts, 'period');
  const scaledAmount = (p) => (p.gross_revenue || 0) * ((accountShareMap[p.client_account_id] ?? 100) / 100);
  const totalPaid = scoped.filter((p) => p.status === 'paid').reduce((s, p) => s + scaledAmount(p), 0);
  const pending = scoped.filter((p) => p.status !== 'paid').reduce((s, p) => s + scaledAmount(p), 0);
  const lastPaid = scoped.find((p) => p.status === 'paid');

  return (
    <div>
      <PageHeader
        title={t('payouts.title')}
        subtitle={t('payouts.subtitle', { name: clientAccount.client_name, share: clientAccount.revenue_share_pct, period: formatMonthLabel(selected) })}
      />
      <PeriodFilterBar />
      <div className="grid sm:grid-cols-3 gap-4 mb-6">
        <MetricCard
          label={t('payouts.total_paid')}
          value={formatCurrency(totalPaid)}
          icon={CheckCircle2}
          accent="bg-emerald-50 text-emerald-600"
        />
        <MetricCard
          label={t('payouts.pending_processing')}
          value={formatCurrency(pending)}
          icon={Clock}
          accent="bg-amber-50 text-amber-600"
        />
        <MetricCard
          label={t('payouts.last_payment')}
          value={lastPaid ? formatCurrency(scaledAmount(lastPaid)) : '—'}
          sub={lastPaid ? lastPaid.payment_date || lastPaid.period : t('payouts.no_payments_yet')}
          icon={Wallet}
          accent="bg-indigo-50 text-indigo-600"
        />
      </div>

      <Card className="overflow-hidden">
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <h2 className="font-semibold">{t('payouts.records')}</h2>
          <span className="text-sm text-slate-500">{t('payouts.payouts_count', { n: formatNumber(scoped.length) })}</span>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('payouts.period')}</TableHead>
              <TableHead>{t('payouts.payment_date')}</TableHead>
              <TableHead className="text-right">{t('payouts.payout_amount')}</TableHead>
              <TableHead>{t('payouts.status')}</TableHead>
              <TableHead>{t('payouts.reference')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {scoped.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">{p.period}</TableCell>
                <TableCell className="text-slate-500">{p.payment_date || '—'}</TableCell>
                <TableCell className="text-right font-semibold text-emerald-600">
                  {formatCurrency(scaledAmount(p))}
                </TableCell>
                <TableCell>
                  <Badge variant={statusVariant[p.status] || 'outline'} className="capitalize">
                    {p.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-slate-400 text-xs font-mono">
                  {p.reference || '—'}
                </TableCell>
              </TableRow>
            ))}
            {scoped.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-slate-400 py-8">
                  {t('payouts.no_records')}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>

      <p className="text-sm text-slate-400 mt-4">
        {t('payouts.footer')}
      </p>
    </div>
  );
}