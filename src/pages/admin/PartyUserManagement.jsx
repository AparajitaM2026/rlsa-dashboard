import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { isPartyAdmin, getPartyId } from '@/lib/roles';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { KeyRound, Loader2, Pencil, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useLanguage } from '@/lib/i18n';
import { useToast } from '@/components/ui/use-toast';

export default function PartyUserManagement() {
  const { toast } = useToast();
  const { user } = useAuth();
  const { t } = useLanguage();
  const [users, setUsers] = useState([]);
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [form, setForm] = useState({ email: '', password: '', confirm: '', client_account_id: '' });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const [pwUser, setPwUser] = useState(null);
  const [pwForm, setPwForm] = useState({ password: '', confirm: '' });
  const [pwSaving, setPwSaving] = useState(false);
  const [pwError, setPwError] = useState('');

  const [editUser, setEditUser] = useState(null);
  const [editClientId, setEditClientId] = useState('');
  const [editCurrentClientId, setEditCurrentClientId] = useState('');
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState('');
  const [editShare, setEditShare] = useState('');

  const partyId = getPartyId(user);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const usersRes = await base44.functions.invoke('listPartyUsers', {});
      const u = usersRes?.data?.users || usersRes?.users || [];
      const cls = usersRes?.data?.clients || usersRes?.clients || [];
      setUsers(u);
      setClients(cls);
    } catch (err) {
      setError(err.response?.data?.error || err.message || t('pum.load_failed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  if (!isPartyAdmin(user)) return <Navigate to="/dashboard" replace />;
  if (!partyId) {
    return (
      <div>
        <PageHeader title={t('pum.title')} />
        <Card className="p-6"><p className="text-sm text-rose-600">{t('pum.party_missing')}</p></Card>
      </div>
    );
  }

  const submit = async (e) => {
    e.preventDefault();
    setFormError('');
    if (!form.email.trim()) { setFormError(t('pum.email')); return; }
    if (form.password.length < 8) { setFormError(t('pum.pw_too_short')); return; }
    if (form.password !== form.confirm) { setFormError(t('pum.pw_mismatch')); return; }
    setSaving(true);
    try {
      const email = form.email.trim().toLowerCase();
      const res = await base44.functions.invoke('setUserPassword', {
        email,
        new_password: form.password,
        access_role: 'CLIENT_USER',
        party_id: partyId,
        client_account_id: form.client_account_id || undefined
      });
      const apiError = res?.data?.error || res?.error;
      if (apiError) { setFormError(apiError); return; }
      if (form.client_account_id) {
        await base44.functions.invoke('linkUserClientAccount', {
          email,
          client_account_id: form.client_account_id
        });
      }
      const data = res?.data || res;
      if (data?.needs_verification) {
        toast({ title: t('pum.created_ok'), description: t('pum.pw_needs_verification', { email }), duration: 8000 });
      } else {
        toast({ title: t('pum.created_ok') });
      }
      setForm({ email: '', password: '', confirm: '', client_account_id: '' });
      load();
    } catch (err) {
      setFormError(err.response?.data?.error || err.data?.error || err.message || t('pum.pw_failed'));
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (u) => {
    setEditUser(u);
    const cid = u.client_account_id || '';
    setEditCurrentClientId(cid);
    setEditClientId(cid);
    const linked = cid ? clients.find((c) => c.id === cid) : null;
    setEditShare(linked ? String(linked.revenue_share_pct ?? '') : '');
    setEditError('');
  };

  const submitEdit = async (e) => {
    e.preventDefault();
    if (!editUser) return;
    setEditError('');
    setEditSaving(true);
    try {
      const email = (editUser.email || '').toLowerCase();
      const shareVal = editClientId && editShare !== '' ? Number(editShare) : undefined;
      await base44.functions.invoke('linkUserClientAccount', {
        email,
        client_account_id: editClientId || '',
        revenue_share_pct: shareVal
      });
      toast({ title: t('pum.link_updated') });
      setEditUser(null);
      load();
    } catch (err) {
      setEditError(err.response?.data?.error || err.data?.error || err.message || t('pum.link_failed'));
    } finally {
      setEditSaving(false);
    }
  };

  const handleDeleteUser = async (u) => {
    if (u.id === user?.id) return;
    if (!window.confirm(`Are you sure you want to delete user "${u.email}"?`)) return;
    try {
      const res = await base44.functions.invoke('deletePartyUser', { user_id: u.id });
      if (res.data?.error) throw new Error(res.data.error);
      toast({ title: 'User deleted' });
      load();
    } catch (err) {
      toast({ title: 'Could not delete user', description: err.message, variant: 'destructive' });
    }
  };

  const submitPassword = async (e) => {
    e.preventDefault();
    setPwError('');
    if (pwForm.password.length < 8) { setPwError(t('pum.pw_too_short')); return; }
    if (pwForm.password !== pwForm.confirm) { setPwError(t('pum.pw_mismatch')); return; }
    setPwSaving(true);
    try {
      const res = await base44.functions.invoke('setUserPassword', {
        email: pwUser.email,
        new_password: pwForm.password
      });
      const apiError = res?.data?.error || res?.error;
      if (apiError) { setPwError(apiError); return; }
      const data = res?.data || res;
      if (data?.needs_verification) {
        toast({ title: t('pum.pw_updated_ok'), description: t('pum.pw_needs_verification', { email: pwUser.email }), duration: 8000 });
      } else {
        toast({ title: t('pum.pw_updated_ok') });
      }
      setPwUser(null);
    } catch (err) {
      setPwError(err.response?.data?.error || err.data?.error || err.message || t('pum.pw_failed'));
    } finally {
      setPwSaving(false);
    }
  };

  const clientMap = Object.fromEntries(clients.map((c) => [c.id, c]));

  return (
    <div>
      <PageHeader title={t('pum.title')} subtitle={t('pum.subtitle')}>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </PageHeader>

      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="p-5 h-fit">
          <div className="flex items-center gap-2 mb-4">
            <Plus className="w-4 h-4 text-indigo-600" />
            <h2 className="font-semibold">{t('pum.new_user')}</h2>
          </div>
          <form onSubmit={submit} className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="email">{t('pum.email')}</Label>
              <Input id="email" type="email" required value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                placeholder="user@example.com" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pw">{t('um.new_password')}</Label>
              <Input id="pw" type="password" required minLength={8} value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder={t('um.new_password_ph')} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="pwc">{t('um.confirm_password')}</Label>
              <Input id="pwc" type="password" required minLength={8} value={form.confirm}
                onChange={(e) => setForm({ ...form, confirm: e.target.value })}
                placeholder={t('um.confirm_password_ph')} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="client">{t('pum.link_client')}</Label>
              <select id="client" value={form.client_account_id}
                onChange={(e) => setForm({ ...form, client_account_id: e.target.value })}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm">
                <option value="">{t('pum.no_link')}</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.client_name}</option>)}
              </select>
            </div>
            {formError && <p className="text-sm text-rose-600">{formError}</p>}
            <Button type="submit" disabled={saving} className="w-full">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              {saving ? t('pum.creating') : t('pum.create')}
            </Button>
          </form>
        </Card>

        <div className="lg:col-span-2">
          <Card className="overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('pum.email')}</TableHead>
                  <TableHead>{t('pum.role')}</TableHead>
                  <TableHead>{t('pum.verified')}</TableHead>
                  <TableHead>{t('pum.linked_account')}</TableHead>
                  <TableHead className="text-right"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && (
                  <TableRow><TableCell colSpan={5} className="text-center py-8"><Loader2 className="w-5 h-5 animate-spin inline text-slate-400" /></TableCell></TableRow>
                )}
                {!loading && error && (
                  <TableRow><TableCell colSpan={5} className="text-center text-rose-600 py-6">{error}</TableCell></TableRow>
                )}
                {!loading && !error && users.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="text-center text-slate-400 py-8">{t('pum.no_users')}</TableCell></TableRow>
                )}
                {!loading && !error && users.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium">{u.email}</TableCell>
                    <TableCell><Badge variant="outline" className="text-xs capitalize">{u.access_role || 'CLIENT_USER'}</Badge></TableCell>
                    <TableCell>
                      {u.is_verified
                        ? <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 text-xs">✓</Badge>
                        : <Badge variant="secondary" className="text-xs">—</Badge>}
                    </TableCell>
                    <TableCell>
                      {u.client_account_id && clientMap[u.client_account_id]
                        ? <span className="text-sm text-slate-600">{clientMap[u.client_account_id].client_name} <span className="text-xs text-slate-400">({clientMap[u.client_account_id].revenue_share_pct}%)</span></span>
                        : <span className="text-slate-400 text-xs">{t('pum.not_linked')}</span>}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button onClick={() => openEdit(u)}
                          className="p-1.5 rounded hover:bg-slate-100 text-indigo-600" title={t('pum.edit_user')}>
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button onClick={() => { setPwUser(u); setPwForm({ password: '', confirm: '' }); setPwError(''); }}
                          className="p-1.5 rounded hover:bg-slate-100 text-indigo-600" title={t('pum.set_password')}>
                          <KeyRound className="w-4 h-4" />
                        </button>
                        {u.id !== user?.id && (
                          <button onClick={() => handleDeleteUser(u)}
                            className="p-1.5 rounded hover:bg-rose-50 text-rose-500" title="Delete user">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </div>
      </div>

      <Dialog open={!!pwUser} onOpenChange={(v) => !v && setPwUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('pum.set_password')} — {pwUser?.email}</DialogTitle>
          </DialogHeader>
          <form onSubmit={submitPassword} className="space-y-4">
            <p className="text-xs text-slate-400">{t('um.pw_otp_on_login_hint')}</p>
            <div className="space-y-1">
              <Label htmlFor="npw">{t('um.new_password')}</Label>
              <Input id="npw" type="password" required minLength={8} value={pwForm.password}
                onChange={(e) => setPwForm({ ...pwForm, password: e.target.value })}
                placeholder={t('um.new_password_ph')} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="npwc">{t('um.confirm_password')}</Label>
              <Input id="npwc" type="password" required minLength={8} value={pwForm.confirm}
                onChange={(e) => setPwForm({ ...pwForm, confirm: e.target.value })}
                placeholder={t('um.confirm_password_ph')} />
            </div>
            {pwError && <p className="text-sm text-rose-600">{pwError}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setPwUser(null)} disabled={pwSaving}>{t('common.cancel')}</Button>
              <Button type="submit" disabled={pwSaving}>
                {pwSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                {t('pum.set_password')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editUser} onOpenChange={(v) => !v && setEditUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('pum.edit_user')} — {editUser?.email}</DialogTitle>
          </DialogHeader>
          <form onSubmit={submitEdit} className="space-y-4">
            <div className="space-y-1">
              <Label htmlFor="edit-client">{t('pum.link_client')}</Label>
              <select id="edit-client" value={editClientId}
                onChange={(e) => setEditClientId(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm">
                <option value="">{t('pum.no_link')}</option>
                {clients.map((c) => <option key={c.id} value={c.id}>{c.client_name}</option>)}
              </select>
              <p className="text-xs text-slate-400">{t('pum.edit_hint')}</p>
            </div>
            {editClientId && (
              <div className="space-y-1">
                <Label htmlFor="edit-share">{t('pum.revenue_share')}</Label>
                <Input id="edit-share" type="number" min="0" max="100" step="1" value={editShare}
                  onChange={(e) => setEditShare(e.target.value)}
                  placeholder="85" />
                <p className="text-xs text-slate-400">{t('pum.revenue_share_hint')}</p>
              </div>
            )}
            {editError && <p className="text-sm text-rose-600">{editError}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditUser(null)} disabled={editSaving}>{t('common.cancel')}</Button>
              <Button type="submit" disabled={editSaving}>
                {editSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Pencil className="w-4 h-4" />}
                {t('pum.save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}