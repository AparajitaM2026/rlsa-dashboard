import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import PageHeader from '@/components/PageHeader';
import MetricCard from '@/components/MetricCard';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
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
import { Save, ArrowLeft, Building2, Banknote, Music2, Activity } from 'lucide-react';
import { logActivity } from '@/lib/activityLog';
import { useLanguage } from '@/lib/i18n';
import { formatCurrency, formatNumber, sumField } from '@/lib/royalty';
import { PeriodFilterBar, usePeriodFilter, formatMonthLabel } from '@/lib/PeriodFilterContext';

export default function ClientProfile() {
  const [params, setParams] = useSearchParams();
  const [clients, setClients] = useState([]);
  const [selectedId, setSelectedId] = useState(params.get('id') || '');
  const [client, setClient] = useState(null);
  const [rows, setRows] = useState([]);
  const [payouts, setPayouts] = useState([]);
  const [agg, setAgg] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { selected, filterRows } = usePeriodFilter();
  const { t } = useLanguage();
  const [form, setForm] = useState({
    contact_email: '',
    contact_phone: '',
    revenue_share_pct: 85,
    status: 'active'
  });

  useEffect(() => {
    base44.entities.ClientAccount.list('-created_date', 500).then((c) => {
      const nonHouse = c.filter((x) => !x.is_house_account);
      setClients(nonHouse);
      const id = params.get('id') || nonHouse[0]?.id || '';
      if (id) setSelectedId(id);
    });
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setAgg(null);
    Promise.all([
      base44.entities.ClientAccount.get(selectedId),
      base44.entities.RevenueRow.filter({ client_account_id: selectedId }, '-created_date', 500),
      base44.entities.Payout.filter({ client_account_id: selectedId }, '-payment_date', 200),
      base44.functions.invoke('aggregateClientRevenue', { client_account_id: selectedId, period: selected })
    ])
      .then(([c, r, p, a]) => {
        setClient(c);
        setRows(r);
        setPayouts(p);
        setAgg(a.data);
        setForm({
          contact_email: c.contact_email || '',
          contact_phone: c.contact_phone || '',
          revenue_share_pct: c.revenue_share_pct ?? 85,
          status: c.status || 'active'
        });
      })
      .finally(() => setLoading(false));
  }, [selectedId, selected]);

  const selectClient = (id) => {
    setSelectedId(id);
    setParams(id ? { id } : {});
  };

  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await base44.entities.ClientAccount.update(selectedId, {
        contact_email: form.contact_email,
        contact_phone: form.contact_phone,
        revenue_share_pct: Number(form.revenue_share_pct) || 0,
        status: form.status
      });
      await logActivity({
        action: 'client_profile_updated',
        description: `Updated client "${client?.client_name || selectedId}" (share ${form.revenue_share_pct}%, ${form.status})`,
        entity_type: 'ClientAccount',
        entity_id: selectedId
      });
      const updated = await base44.entities.ClientAccount.get(selectedId);
      setClient(updated);
      setForm({
        contact_email: updated.contact_email || '',
        contact_phone: updated.contact_phone || '',
        revenue_share_pct: updated.revenue_share_pct ?? 85,
        status: updated.status || 'active'
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (clients.length === 0) {
    return (
      <Card className="p-8 text-center">
        <p className="text-slate-500">{t('cp.no_clients')}</p>
      </Card>
    );
  }

  const scoped = filterRows(rows);
  const scopedPayouts = filterRows(payouts, 'period');
  const gross = agg?.gross ?? 0;
  const sharePct = (client?.revenue_share_pct ?? 100) / 100;
  const clientGross = gross * sharePct;
  const paidOut = scopedPayouts
    .filter((p) => p.status === 'paid')
    .reduce((sum, p) => sum + (p.gross_revenue || 0) * sharePct, 0);
  const trackCount = agg?.trackCount ?? 0;

  return (
    <div>
      <PageHeader title={t('cp.title')} subtitle={t('cp.subtitle', { period: formatMonthLabel(selected) })}>
        <div className="w-64">
          <Select value={selectedId} onValueChange={selectClient}>
            <SelectTrigger>
              <SelectValue placeholder="Select client" />
            </SelectTrigger>
            <SelectContent>
              {clients.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.client_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </PageHeader>

      <PeriodFilterBar />

      {client && (
        <>
          <div className="grid sm:grid-cols-3 gap-4 mb-6">
            <MetricCard
              label={t('cp.gross_revenue')}
              value={formatCurrency(clientGross)}
              sub={formatMonthLabel(selected)}
              icon={Building2}
              accent="bg-indigo-50 text-indigo-600"
            />
            <MetricCard
              label={t('cp.total_paid_out')}
              value={formatCurrency(paidOut)}
              sub={t('cp.payouts_count', { n: scopedPayouts.length })}
              icon={Banknote}
              accent="bg-emerald-50 text-emerald-600"
            />
            <MetricCard
              label={t('cp.recent_tracks')}
              value={formatNumber(trackCount)}
              icon={Music2}
              accent="bg-violet-50 text-violet-600"
            />
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            <Card className="p-5">
              <h2 className="font-semibold mb-4">{t('cp.contact_share')}</h2>
              <form onSubmit={save} className="space-y-3">
                <div className="space-y-1">
                  <Label>{t('cp.client_name')}</Label>
                  <Input value={client.client_name} disabled />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="ce">{t('cp.contact_email')}</Label>
                  <Input
                    id="ce"
                    type="email"
                    value={form.contact_email}
                    onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="cp">{t('cp.contact_phone')}</Label>
                  <Input
                    id="cp"
                    value={form.contact_phone}
                    onChange={(e) => setForm({ ...form, contact_phone: e.target.value })}
                    placeholder={t('cp.contact_phone_ph')}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="rs">{t('cp.revenue_share')}</Label>
                  <Input
                    id="rs"
                    type="number"
                    min="0"
                    max="100"
                    value={form.revenue_share_pct}
                    onChange={(e) => setForm({ ...form, revenue_share_pct: e.target.value })}
                  />
                </div>
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <p className="text-sm font-medium">{t('cp.account_status')}</p>
                  <Switch
                    checked={form.status === 'active'}
                    onCheckedChange={(v) => setForm({ ...form, status: v ? 'active' : 'inactive' })}
                  />
                </div>
                <Button type="submit" disabled={saving} className="w-full">
                  <Save className="w-4 h-4 mr-1" />
                  {saving ? t('cp.saving') : t('cp.save_changes')}
                </Button>
              </form>
            </Card>

            <Card className="p-5">
              <div className="flex items-center gap-2 mb-4">
                <Activity className="w-4 h-4 text-indigo-600" />
                <h2 className="font-semibold">{t('cp.recent_activity')}</h2>
              </div>
              <div className="rounded-lg border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('cp.track')}</TableHead>
                      <TableHead>{t('cp.store')}</TableHead>
                      <TableHead className="text-right">{t('cp.units')}</TableHead>
                      <TableHead className="text-right">{t('cp.gross')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {scoped.slice(0, 10).map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium truncate max-w-[140px]">
                          {r.track_title || '—'}
                        </TableCell>
                        <TableCell className="text-slate-500">{r.store_dsp || '—'}</TableCell>
                        <TableCell className="text-right">{formatNumber(r.units)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(r.gross_revenue)}</TableCell>
                      </TableRow>
                    ))}
                    {rows.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-slate-400 py-6">
                          {t('cp.no_recent_activity')}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>

              <h3 className="font-medium mt-5 mb-2 text-sm">{t('cp.recent_payouts')}</h3>
              <div className="space-y-2">
                {scopedPayouts.slice(0, 5).map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center justify-between rounded-lg border px-4 py-2"
                  >
                    <div>
                      <p className="text-sm font-medium">{p.period}</p>
                      <p className="text-xs text-slate-500">{p.payment_date || '—'}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold text-emerald-600">{formatCurrency((p.gross_revenue || 0) * sharePct)}</p>
                      <Badge variant="outline" className="capitalize mt-0.5">
                        {p.status}
                      </Badge>
                    </div>
                  </div>
                ))}
                {payouts.length === 0 && (
                  <p className="text-sm text-slate-400">{t('cp.no_payouts')}</p>
                )}
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}