import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
import { Plus, Pencil, Trash2, Network } from 'lucide-react';
import { logActivity } from '@/lib/activityLog';
import { useLanguage } from '@/lib/i18n';
import { useAuth } from '@/lib/AuthContext';
import { getPartyId, isPartyAdmin } from '@/lib/roles';

export default function LabelMapping() {
  const [mappings, setMappings] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ raw_imprint: '', client_account_id: '', is_house: false });
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const { t } = useLanguage();
  const { user } = useAuth();
  const partyId = getPartyId(user);

  const load = () => {
    setLoading(true);
    const partyAdminUser = isPartyAdmin(user);

    Promise.all([
      base44.entities.LabelMapping.list('-created_date', 500),
      base44.entities.ClientAccount.list('-created_date', 500)
    ])
      .then(([m, c]) => {
        const visibleClients = (partyAdminUser && partyId)
          ? (c || []).filter((row) => row.party_id === partyId)
          : (c || []);

        const visibleClientIds = new Set(visibleClients.map((row) => row.id));

        const seen = new Set();
        const deduped = (m || []).filter((row) => {
          const key = (row.raw_imprint || '').trim().toLowerCase();
          if (!key || seen.has(key)) return false;

          if (partyAdminUser && partyId) {
            const matchesParty = row.party_id === partyId;
            const matchesClient = row.client_account_id && visibleClientIds.has(row.client_account_id);
            if (!matchesParty && !matchesClient) return false;
          }

          seen.add(key);
          return true;
        });

        setMappings(deduped);
        setClients(visibleClients);
      })
      .catch((err) => {
        console.error('Failed to load mappings:', err);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [user]);

  const clientName = (id) => clients.find((c) => c.id === id)?.client_name || '—';

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        raw_imprint: form.raw_imprint,
        client_account_id: form.is_house ? null : form.client_account_id || null,
        is_house: !!form.is_house,
        party_id: partyId || ''
      };
      if (editingId) {
        await base44.entities.LabelMapping.update(editingId, payload);
        try {
          await logActivity({
            action: 'label_mapping_updated',
            description: `Updated mapping for "${payload.raw_imprint}"`,
            entity_type: 'LabelMapping',
            entity_id: editingId
          });
        } catch (_) {}
      } else {
        const created = await base44.entities.LabelMapping.create(payload);
        try {
          await logActivity({
            action: 'label_mapping_created',
            description: `Created mapping for "${payload.raw_imprint}"`,
            entity_type: 'LabelMapping',
            entity_id: created?.id || ''
          });
        } catch (_) {}
      }
      setForm({ raw_imprint: '', client_account_id: '', is_house: false });
      setEditingId(null);
      load();
    } catch (err) {
      alert('Save failed: ' + (err.message || 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  const edit = (m) => {
    setEditingId(m.id);
    setForm({
      raw_imprint: m.raw_imprint || '',
      client_account_id: m.client_account_id || '',
      is_house: !!m.is_house
    });
  };

  const remove = async (m) => {
    if (!confirm(t('lm.delete_confirm', { name: m.raw_imprint }))) return;
    try {
      await base44.entities.LabelMapping.delete(m.id);
      try {
        await logActivity({
          action: 'label_mapping_deleted',
          description: `Deleted mapping for "${m.raw_imprint}"`,
          entity_type: 'LabelMapping',
          entity_id: m.id
        });
      } catch (_) {}
      load();
    } catch (err) {
      alert('Delete failed: ' + (err.message || 'Unknown error'));
    }
  };

  return (
    <div>
      <PageHeader
        title={t('lm.title')}
        subtitle={t('lm.subtitle')}
      />
      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="p-5 h-fit">
          <div className="flex items-center gap-2 mb-4">
            <Network className="w-4 h-4 text-indigo-600" />
            <h2 className="font-semibold">{editingId ? t('lm.edit') : t('lm.new')}</h2>
          </div>
          <form onSubmit={submit} className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="ri">{t('lm.raw_imprint')}</Label>
              <Input
                id="ri"
                required
                value={form.raw_imprint}
                onChange={(e) => setForm({ ...form, raw_imprint: e.target.value })}
                placeholder={t('lm.raw_imprint_ph')}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">{t('lm.route_house')}</p>
                <p className="text-xs text-slate-500">{t('lm.route_house_desc')}</p>
              </div>
              <Switch
                checked={form.is_house}
                onCheckedChange={(v) => setForm({ ...form, is_house: v })}
              />
            </div>
            {!form.is_house && (
              <div className="space-y-1">
                <Label>{t('lm.client_account')}</Label>
                <Select
                  value={form.client_account_id || 'none'}
                  onValueChange={(v) => setForm({ ...form, client_account_id: v === 'none' ? '' : v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select client" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t('lm.none')}</SelectItem>
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
            )}
            <div className="flex gap-2 pt-1">
              <Button type="submit" disabled={saving} className="flex-1">
                <Plus className="w-4 h-4 mr-1" />
                {editingId ? t('lm.update') : t('lm.create')}
              </Button>
              {editingId && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setForm({ raw_imprint: '', client_account_id: '', is_house: false });
                    setEditingId(null);
                  }}
                >
                  {t('lm.cancel')}
                </Button>
              )}
            </div>
          </form>
        </Card>

        <div className="lg:col-span-2">
          <Card className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('lm.raw_imprint_h')}</TableHead>
                  <TableHead>{t('lm.routes_to')}</TableHead>
                  <TableHead>{t('lm.type')}</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {mappings.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="font-medium">{m.raw_imprint}</TableCell>
                    <TableCell>{m.is_house ? t('lm.house_catalog') : clientName(m.client_account_id)}</TableCell>
                    <TableCell>
                      {m.is_house ? (
                        <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">{t('lm.house')}</Badge>
                      ) : (
                        <Badge variant="secondary">{t('lm.client')}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <button onClick={() => edit(m)} className="p-1.5 rounded hover:bg-slate-100">
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button onClick={() => remove(m)} className="p-1.5 rounded hover:bg-slate-100 text-rose-600">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
                {!loading && mappings.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-slate-400 py-8">
                      {t('lm.no_mappings')}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </div>
      </div>
    </div>
  );
}
