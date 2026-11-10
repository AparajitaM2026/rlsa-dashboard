import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { isAdminLevel } from '@/lib/roles';
import { base44 } from '@/api/base44Client';
import { logActivity } from '@/lib/activityLog';
import { useLanguage } from '@/lib/i18n';
import PageHeader from '@/components/PageHeader';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { formatCurrency, formatNumber } from '@/lib/royalty';
import { MapPin } from 'lucide-react';

export default function UnmappedData() {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const { t } = useLanguage();

  const load = () => {
    setLoading(true);
    Promise.all([
      base44.entities.RevenueRow.filter({ is_unmapped: true }, '-created_date', 5000),
      base44.entities.ClientAccount.list('-created_date', 500)
    ])
      .then(([r, c]) => {
        setRows(r);
        setClients(c.filter((x) => !x.is_house_account));
      })
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const groups = {};
  for (const r of rows) {
    const k = r.label_imprint || '(blank)';
    if (!groups[k]) groups[k] = { imprint: k, rows: [], gross: 0, units: 0 };
    groups[k].rows.push(r);
    groups[k].gross += Number(r.gross_revenue) || 0;
    groups[k].units += Number(r.units) || 0;
  }
  const groupList = Object.values(groups).sort((a, b) => b.gross - a.gross);

  if (user && !isAdminLevel(user)) return <Navigate to="/dashboard" replace />;

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
        title={t('ud.title')}
        subtitle={t('ud.subtitle')}
      />
      {groupList.length === 0 ? (
        <Card className="p-8 text-center">
          <div className="flex flex-col items-center gap-2 text-emerald-600">
            <MapPin className="w-8 h-8" />
            <p className="font-medium">{t('ud.all_mapped')}</p>
            <p className="text-sm text-slate-500">{t('ud.all_mapped_desc')}</p>
          </div>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="px-5 py-4 border-b flex items-center justify-between">
            <h2 className="font-semibold">{t('ud.unmapped_imprints')}</h2>
            <span className="text-sm text-slate-500">
              {t('ud.rows_imprints', { rows: formatNumber(rows.length), n: groupList.length })}
            </span>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('ud.label_imprint')}</TableHead>
                <TableHead className="text-right">{t('ud.rows')}</TableHead>
                <TableHead className="text-right">{t('ud.units')}</TableHead>
                <TableHead className="text-right">{t('ud.gross_revenue')}</TableHead>
                <TableHead>{t('ud.route_to')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groupList.map((g) => (
                <ImprintRow key={g.imprint} group={g} clients={clients} onApplied={load} />
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </div>
  );
}

function ImprintRow({ group, clients, onApplied }) {
  const { t } = useLanguage();
  const [isHouse, setIsHouse] = useState(false);
  const [clientId, setClientId] = useState('');
  const [applying, setApplying] = useState(false);

  const apply = async () => {
    if (!isHouse && !clientId) return;
    setApplying(true);
    try {
      const created = await base44.entities.LabelMapping.create({
        raw_imprint: group.imprint,
        client_account_id: isHouse ? null : clientId,
        is_house: !!isHouse
      });
      await base44.entities.RevenueRow.updateMany(
        { is_unmapped: true, label_imprint: group.imprint },
        {
          $set: {
            is_unmapped: false,
            is_house_label: !!isHouse,
            client_account_id: isHouse ? null : clientId
          }
        }
      );
      const target = isHouse
        ? 'House Catalog'
        : clients.find((c) => c.id === clientId)?.client_name || 'client';
      await logActivity({
        action: 'unmapped_imprint_mapped',
        description: `Mapped imprint "${group.imprint}" → ${target}`,
        entity_type: 'LabelMapping',
        entity_id: created.id,
        metadata: { imprint: group.imprint, is_house: !!isHouse, rows_rerouted: group.rows.length }
      });
      onApplied();
    } finally {
      setApplying(false);
    }
  };

  return (
    <TableRow>
      <TableCell className="font-medium">{group.imprint}</TableCell>
      <TableCell className="text-right">{formatNumber(group.rows.length)}</TableCell>
      <TableCell className="text-right">{formatNumber(group.units)}</TableCell>
      <TableCell className="text-right">{formatCurrency(group.gross)}</TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Switch checked={isHouse} onCheckedChange={setIsHouse} />
          {isHouse ? (
            <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">House</Badge>
          ) : (
            <div className="w-44">
              <Select value={clientId || 'none'} onValueChange={(v) => setClientId(v === 'none' ? '' : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select client" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">— None —</SelectItem>
                  {clients.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.client_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <Button size="sm" disabled={applying || (!isHouse && !clientId)} onClick={apply}>
            {applying ? t('ud.mapping') : t('ud.apply')}
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}