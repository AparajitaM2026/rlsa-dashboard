import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { isAdminLevel, isPartyAdmin, getPartyId } from '@/lib/roles';
import { base44 } from '@/api/base44Client';
import { logActivity } from '@/lib/activityLog';
import { useLanguage } from '@/lib/i18n';
import PageHeader from '@/components/PageHeader';
import MetricCard from '@/components/MetricCard';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { formatCurrency, formatNumber, sumField } from '@/lib/royalty';
import { Download, FileDown, Banknote, ListChecks, Plus, Zap, CheckCircle2 } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import GeneratePayoutModal from '@/components/admin/GeneratePayoutModal';
import AutoGeneratePayoutsModal from '@/components/admin/AutoGeneratePayoutsModal';

const statusTone = {
  paid: 'default',
  processing: 'secondary',
  pending: 'outline',
  failed: 'destructive'
};

function csvCell(v) {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function PayoutExports() {
  const { user } = useAuth();
  const [payouts, setPayouts] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [clientFilter, setClientFilter] = useState('all');
  const [periodFilter, setPeriodFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [exporting, setExporting] = useState(false);
  const [showGenModal, setShowGenModal] = useState(false);
  const [showAutoModal, setShowAutoModal] = useState(false);
  const [selected, setSelected] = useState(new Set());
  const [bulkUpdating, setBulkUpdating] = useState(false);
  const [allPeriods, setAllPeriods] = useState([]);
  const { t } = useLanguage();

  useEffect(() => {
    Promise.all([
      base44.entities.Payout.list('-created_date', 5000),
      base44.entities.ClientAccount.list('-created_date', 500),
      base44.functions.invoke('getStatementPeriods', {}).catch(() => ({ data: { periods: [] } }))
    ])
      .then(([p, c, periodsRes]) => {
        const partyId = getPartyId(user);
        let scopedClients = c.filter((x) => !x.is_house_account);
        let scopedPayouts = p;
        if (isPartyAdmin(user)) {
          scopedClients = c.filter((x) => !x.is_house_account && x.party_id === partyId);
          const ids = new Set(scopedClients.map((x) => x.id));
          scopedPayouts = p.filter((pay) => ids.has(pay.client_account_id));
        }
        setPayouts(scopedPayouts);
        setClients(scopedClients);
        setAllPeriods(periodsRes.data?.periods || []);
      })
      .finally(() => setLoading(false));
  }, []);

  const reload = () => {
    base44.entities.Payout.list('-created_date', 5000).then((p) => {
      if (!isPartyAdmin(user)) { setPayouts(p); return; }
      const ids = new Set(clients.map((x) => x.id));
      setPayouts(p.filter((pay) => ids.has(pay.client_account_id)));
    });
  };
  const clientName = (id) => clients.find((c) => c.id === id)?.client_name || '—';
  const periods = Array.from(new Set([
    ...payouts.map((p) => p.period).filter(Boolean),
    ...allPeriods
  ])).sort().reverse();

  let filtered = payouts;
  if (clientFilter !== 'all') filtered = filtered.filter((p) => p.client_account_id === clientFilter);
  if (periodFilter !== 'all') filtered = filtered.filter((p) => p.period === periodFilter);
  if (statusFilter !== 'all') filtered = filtered.filter((p) => p.status === statusFilter);

  const clientShare = (id) => (clients.find((c) => c.id === id)?.revenue_share_pct ?? 100) / 100;
  const scaledPayout = (p) => (p.gross_revenue || 0) * clientShare(p.client_account_id);
  const totalGross = sumField(filtered, 'gross_revenue');
  const totalPayout = filtered.reduce((s, p) => s + scaledPayout(p), 0);

  const toggleRow = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleAll = () => {
    setSelected((prev) =>
      prev.size === filtered.length ? new Set() : new Set(filtered.map((p) => p.id))
    );
  };
  const allSelected = filtered.length > 0 && selected.size === filtered.length;
  const someSelected = selected.size > 0 && selected.size < filtered.length;

  const markSelectedAsPaid = async () => {
    const ids = Array.from(selected);
    if (!ids.length) return;
    setBulkUpdating(true);
    try {
      await base44.entities.Payout.bulkUpdate(
        ids.map((id) => ({ id, status: 'paid', payment_date: new Date().toISOString().slice(0, 10) }))
      );
      await logActivity({
        action: 'payouts_bulk_marked_paid',
        description: `Marked ${formatNumber(ids.length)} payouts as Paid`,
        entity_type: 'Payout',
        metadata: { count: ids.length }
      });
      setSelected(new Set());
      reload();
    } finally {
      setBulkUpdating(false);
    }
  };

  if (user && !isAdminLevel(user)) return <Navigate to="/dashboard" replace />;

  const buildCsv = () => {
    const header = ['Client', 'Period', 'Payment Date', 'Gross Revenue', 'Payout Amount', 'Status', 'Reference'];
    const lines = [header.map(csvCell).join(',')];
    for (const p of filtered) {
      lines.push(
        [
          clientName(p.client_account_id),
          p.period || '',
          p.payment_date || '',
          p.gross_revenue ?? 0,
          scaledPayout(p),
          p.status || '',
          p.reference || ''
        ]
          .map(csvCell)
          .join(',')
      );
    }
    return lines.join('\n');
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      const csv = buildCsv();
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `payout-ledger-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      await logActivity({
        action: 'payout_ledger_exported',
        description: `Exported payout ledger (${formatNumber(filtered.length)} payouts, ${formatCurrency(totalPayout)})`,
        entity_type: 'Payout',
        metadata: { count: filtered.length, client: clientFilter, period: periodFilter, status: statusFilter }
      });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div>
      <PageHeader
        title={t('pe.title')}
        subtitle={t('pe.subtitle')}
      >
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowAutoModal(true)}>
            <Zap className="w-4 h-4 mr-1" />
            {t('pe.auto_generate')}
          </Button>
          <Button onClick={() => setShowGenModal(true)}>
            <Plus className="w-4 h-4 mr-1" />
            {t('pe.generate_payout')}
          </Button>
          <Button onClick={exportCsv} disabled={exporting || loading || filtered.length === 0}>
            <FileDown className="w-4 h-4 mr-1" />
            {exporting ? t('pe.exporting') : t('pe.export_csv')}
          </Button>
        </div>
      </PageHeader>

      <div className="grid sm:grid-cols-3 gap-4 mb-6">
        <MetricCard label={t('pe.payouts_in_view')} value={formatNumber(filtered.length)} icon={ListChecks} accent="bg-indigo-50 text-indigo-600" />
        <MetricCard label={t('pe.total_gross')} value={formatCurrency(totalGross)} icon={Banknote} accent="bg-slate-100 text-slate-700" />
        <MetricCard label={t('pe.total_payout')} value={formatCurrency(totalPayout)} icon={Download} accent="bg-emerald-50 text-emerald-600" />
      </div>

      <Card className="p-4 mb-4">
        <div className="grid sm:grid-cols-3 gap-3">
          <div className="space-y-1">
            <label className="text-xs text-slate-500">{t('pe.client')}</label>
            <Select value={clientFilter} onValueChange={setClientFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('pe.all_clients')}</SelectItem>
                {clients
                  .filter((c) => !c.is_house_account)
                  .map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.client_name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-slate-500">{t('pe.period')}</label>
            <Select value={periodFilter} onValueChange={setPeriodFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('pe.all_periods')}</SelectItem>
                {periods.map((p) => (
                  <SelectItem key={p} value={p}>
                    {p}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-slate-500">{t('pe.status')}</label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('pe.all_statuses')}</SelectItem>
                <SelectItem value="paid">{t('pe.paid')}</SelectItem>
                <SelectItem value="processing">{t('pe.processing')}</SelectItem>
                <SelectItem value="pending">{t('pe.pending')}</SelectItem>
                <SelectItem value="failed">{t('pe.failed')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {selected.size > 0 && (
        <div className="flex items-center justify-between gap-3 mb-4 rounded-lg border bg-slate-50 px-4 py-3">
          <span className="text-sm font-medium text-slate-700">
            {t('pe.selected', { n: formatNumber(selected.size) })}
          </span>
          <Button onClick={markSelectedAsPaid} disabled={bulkUpdating}>
            <CheckCircle2 className="w-4 h-4 mr-1" />
            {bulkUpdating ? t('pe.bulk_updating') : t('pe.mark_paid')}
          </Button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-4 border-slate-200 border-t-indigo-600 rounded-full animate-spin" />
        </div>
      ) : (
        <Card className="overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={allSelected || (someSelected && 'indeterminate')}
                    onCheckedChange={toggleAll}
                    aria-label={t('pe.select_all')}
                  />
                </TableHead>
                <TableHead>{t('pe.client')}</TableHead>
                <TableHead>{t('pe.period')}</TableHead>
                <TableHead>{t('pe.payment_date')}</TableHead>
                <TableHead className="text-right">{t('pe.gross')}</TableHead>
                <TableHead className="text-right">{t('pe.payout')}</TableHead>
                <TableHead>{t('pe.status')}</TableHead>
                <TableHead>{t('pe.reference')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="w-10">
                    <Checkbox
                      checked={selected.has(p.id)}
                      onCheckedChange={() => toggleRow(p.id)}
                      aria-label={t('pe.select_row')}
                    />
                  </TableCell>
                  <TableCell className="font-medium">{clientName(p.client_account_id)}</TableCell>
                  <TableCell>{p.period}</TableCell>
                  <TableCell className="text-slate-500">{p.payment_date || '—'}</TableCell>
                  <TableCell className="text-right">{formatCurrency(p.gross_revenue)}</TableCell>
                  <TableCell className="text-right font-semibold text-emerald-600">
                    {formatCurrency(scaledPayout(p))}
                  </TableCell>
                  <TableCell>
                    <Badge variant={statusTone[p.status] || 'outline'} className="capitalize">
                      {p.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-slate-400 text-xs font-mono">{p.reference || '—'}</TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-slate-400 py-8">
                    {t('pe.no_data')}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      )}

      {showGenModal && (
        <GeneratePayoutModal
          clients={clients}
          onClose={() => setShowGenModal(false)}
          onCreated={() => { setShowGenModal(false); reload(); }}
        />
      )}
      {showAutoModal && (
        <AutoGeneratePayoutsModal
          clients={clients}
          existingPayouts={payouts}
          onClose={() => setShowAutoModal(false)}
          onDone={reload}
        />
      )}
    </div>
  );
}