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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Plus, Pencil, Trash2, Building2, KeyRound, Loader2 } from 'lucide-react';
import { useLanguage } from '@/lib/i18n';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/lib/AuthContext';
import { isSuperAdmin } from '@/lib/roles';
import { Navigate } from 'react-router-dom';

const empty = {
  client_name: '',
  contact_email: '',
  revenue_share_pct: 85,
  is_house_account: false,
  status: 'active'
};

export default function UserManagement() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(empty);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [pwClient, setPwClient] = useState(null);
  const [pwForm, setPwForm] = useState({ password: '', confirm: '' });
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState('');
  const { t } = useLanguage();

  const load = () => {
    setLoading(true);
    base44.entities.ClientAccount
      .list('-created_date', 500)
      .then(setClients)
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  if (!isSuperAdmin(user)) return <Navigate to="/dashboard" replace />;

  const submit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = {
        ...form,
        revenue_share_pct: Number(form.revenue_share_pct) || 0
      };
      if (editingId) {
        await base44.entities.ClientAccount.update(editingId, payload);
      } else {
        await base44.entities.ClientAccount.create(payload);
      }
      setForm(empty);
      setEditingId(null);
      load();
    } finally {
      setSaving(false);
    }
  };

  const edit = (c) => {
    setEditingId(c.id);
    setForm({
      client_name: c.client_name || '',
      contact_email: c.contact_email || '',
      revenue_share_pct: c.revenue_share_pct ?? 85,
      is_house_account: !!c.is_house_account,
      status: c.status || 'active'
    });
  };

  const remove = async (c) => {
    if (!confirm(t('um.delete_confirm', { name: c.client_name }))) return;
    await base44.entities.ClientAccount.delete(c.id);
    load();
  };

  const openPwDialog = (c) => {
    setPwClient(c);
    setPwForm({ password: '', confirm: '' });
    setPwError('');
  };

  const submitPassword = async (e) => {
    e.preventDefault();
    setPwError('');
    if (pwForm.password.length < 8) {
      setPwError(t('um.pw_too_short'));
      return;
    }
    if (pwForm.password !== pwForm.confirm) {
      setPwError(t('um.pw_mismatch'));
      return;
    }
    if (!pwClient?.contact_email) {
      setPwError(t('um.pw_no_email'));
      return;
    }
    setPwSaving(true);
    try {
      const res = await base44.functions.invoke('setUserPassword', {
        email: pwClient.contact_email,
        new_password: pwForm.password
      });
      const apiError = res?.data?.error || res?.error;
      if (apiError) {
        setPwError(apiError);
      } else {
        const data = res?.data || res;
        const created = data?.created;
        const needsVerification = data?.needs_verification;
        if (needsVerification) {
          toast({
            title: created ? t('um.pw_created_ok') : t('um.pw_updated_ok'),
            description: t('um.pw_needs_verification', { email: pwClient.contact_email }),
            duration: 8000
          });
        } else {
          toast({ title: created ? t('um.pw_created_ok') : t('um.pw_updated_ok') });
        }
        setPwClient(null);
      }
    } catch (err) {
      const apiError = err.response?.data?.error || err.data?.error;
      setPwError(apiError || err.message || t('um.pw_failed'));
    } finally {
      setPwSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        title={t('um.title')}
        subtitle={t('um.subtitle')}
      />
      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="p-5 h-fit">
          <div className="flex items-center gap-2 mb-4">
            <Building2 className="w-4 h-4 text-indigo-600" />
            <h2 className="font-semibold">{editingId ? t('um.edit_client') : t('um.new_client')}</h2>
          </div>
          <form onSubmit={submit} className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="cn">{t('um.client_name')}</Label>
              <Input
                id="cn"
                required
                value={form.client_name}
                onChange={(e) => setForm({ ...form, client_name: e.target.value })}
                placeholder={t('um.client_name_ph')}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="ce">{t('um.contact_email')}</Label>
              <Input
                id="ce"
                type="email"
                value={form.contact_email}
                onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
                placeholder="client@example.com"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="rs">{t('um.revenue_share')}</Label>
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
              <div>
                <p className="text-sm font-medium">{t('um.house_account')}</p>
                <p className="text-xs text-slate-500">{t('um.house_desc')}</p>
              </div>
              <Switch
                checked={form.is_house_account}
                onCheckedChange={(v) => setForm({ ...form, is_house_account: v })}
              />
            </div>
            <div className="flex items-center justify-between rounded-lg border p-3">
              <p className="text-sm font-medium">{t('um.status')}</p>
              <Switch
                checked={form.status === 'active'}
                onCheckedChange={(v) => setForm({ ...form, status: v ? 'active' : 'inactive' })}
              />
            </div>
            <div className="flex gap-2 pt-1">
              <Button type="submit" disabled={saving} className="flex-1">
                <Plus className="w-4 h-4 mr-1" />
                {editingId ? t('common.update') : t('common.create')}
              </Button>
              {editingId && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setForm(empty);
                    setEditingId(null);
                  }}
                >
                  {t('common.cancel')}
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
                  <TableHead>{t('um.client_name')}</TableHead>
                  <TableHead>{t('um.email')}</TableHead>
                  <TableHead className="text-right">{t('um.share')}</TableHead>
                  <TableHead>{t('um.type')}</TableHead>
                  <TableHead>{t('um.status')}</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clients.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.client_name}</TableCell>
                    <TableCell className="text-slate-500 text-sm">{c.contact_email || '—'}</TableCell>
                    <TableCell className="text-right">{c.revenue_share_pct}%</TableCell>
                    <TableCell>
                      {c.is_house_account ? (
                        <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">{t('um.house_badge')}</Badge>
                      ) : (
                        <Badge variant="secondary">{t('um.client_badge')}</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant={c.status === 'active' ? 'default' : 'outline'}>{c.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <button onClick={() => edit(c)} className="p-1.5 rounded hover:bg-slate-100" title={t('um.edit')}>
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => openPwDialog(c)}
                        disabled={!c.contact_email}
                        className="p-1.5 rounded hover:bg-slate-100 text-indigo-600 disabled:opacity-30 disabled:cursor-not-allowed"
                        title={c.contact_email ? t('um.set_password') : t('um.pw_no_email')}
                      >
                        <KeyRound className="w-4 h-4" />
                      </button>
                      <button onClick={() => remove(c)} className="p-1.5 rounded hover:bg-slate-100 text-rose-600" title={t('um.delete')}>
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </TableCell>
                  </TableRow>
                ))}
                {!loading && clients.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-slate-400 py-8">
                      {t('um.no_clients')}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </div>
      </div>

      <Dialog open={!!pwClient} onOpenChange={(v) => !v && setPwClient(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('um.set_password')} — {pwClient?.client_name}</DialogTitle>
          </DialogHeader>
          <form onSubmit={submitPassword} className="space-y-4">
            <p className="text-sm text-slate-500">
              {t('um.pw_desc_create', { email: pwClient?.contact_email })}
            </p>
            <p className="text-xs text-slate-400">
              {t('um.pw_otp_on_login_hint')}
            </p>
            <div className="space-y-1">
              <Label htmlFor="pw">{t('um.new_password')}</Label>
              <Input
                id="pw"
                type="password"
                required
                minLength={8}
                value={pwForm.password}
                onChange={(e) => setPwForm({ ...pwForm, password: e.target.value })}
                placeholder={t('um.new_password_ph')}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pwc">{t('um.confirm_password')}</Label>
              <Input
                id="pwc"
                type="password"
                required
                minLength={8}
                value={pwForm.confirm}
                onChange={(e) => setPwForm({ ...pwForm, confirm: e.target.value })}
                placeholder={t('um.confirm_password_ph')}
              />
            </div>
            {pwError && <p className="text-sm text-rose-600">{pwError}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPwClient(null)} disabled={pwSaving}>
                {t('common.cancel')}
              </Button>
              <Button type="submit" disabled={pwSaving}>
                {pwSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                {t('um.set_password')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}