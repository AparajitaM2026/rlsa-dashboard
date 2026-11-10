import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { base44 } from '@/api/base44Client';
import { Navigate } from 'react-router-dom';
import PageHeader from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Building2, Plus, KeyRound, Loader2, Sparkles, Users, UserCog } from 'lucide-react';
import { useLanguage } from '@/lib/i18n';
import { useToast } from '@/components/ui/use-toast';
import { isSuperAdmin } from '@/lib/roles';
import PromotePartyAdmin from '@/components/admin/PromotePartyAdmin';

export default function Parties() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const { toast } = useToast();
  const [parties, setParties] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showPartyForm, setShowPartyForm] = useState(false);
  const [partyForm, setPartyForm] = useState({ name: '', code: '', contact_email: '', notes: '' });
  const [savingParty, setSavingParty] = useState(false);

  const [adminForm, setAdminForm] = useState({ email: '', password: '', party_id: '' });
  const [savingAdmin, setSavingAdmin] = useState(false);
  const [adminTab, setAdminTab] = useState('create');
  const [migrating, setMigrating] = useState(false);
  const [migrationResult, setMigrationResult] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    base44.entities.Party
      .list('-created_date', 500)
      .then(setParties)
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  if (!isSuperAdmin(user)) return <Navigate to="/dashboard" replace />;

  const createParty = async (e) => {
    e.preventDefault();
    if (!partyForm.name) return;
    setSavingParty(true);
    try {
      await base44.entities.Party.create({
        name: partyForm.name,
        code: partyForm.code || null,
        contact_email: partyForm.contact_email || null,
        notes: partyForm.notes || null,
        status: 'active'
      });
      toast({ title: t('parties.created_ok') });
      setPartyForm({ name: '', code: '', contact_email: '', notes: '' });
      setShowPartyForm(false);
      load();
    } catch (err) {
      toast({ title: err.message || t('parties.create_failed'), variant: 'destructive' });
    } finally {
      setSavingParty(false);
    }
  };

  const provisionAdmin = async (e) => {
    e.preventDefault();
    if (!adminForm.email || !adminForm.password || !adminForm.party_id) return;
    setSavingAdmin(true);
    try {
      const res = await base44.functions.invoke('setUserPassword', {
        email: adminForm.email,
        new_password: adminForm.password,
        access_role: 'PARTY_ADMIN',
        party_id: adminForm.party_id
      });
      const data = res?.data || res;
      if (data?.error) throw new Error(data.error);
      toast({
        title: t('parties.admin_provisioned'),
        description: data?.needs_verification
          ? t('parties.admin_needs_otp', { email: adminForm.email })
          : t('parties.admin_ready', { email: adminForm.email }),
        duration: 8000
      });
      setAdminForm({ email: '', password: '', party_id: '' });
    } catch (err) {
      toast({ title: err.message || t('parties.provision_failed'), variant: 'destructive' });
    } finally {
      setSavingAdmin(false);
    }
  };

  const runMigration = async () => {
    if (!confirm(t('parties.migrate_confirm'))) return;
    setMigrating(true);
    setMigrationResult(null);
    try {
      const res = await base44.functions.invoke('migrateToParties', {});
      const data = res?.data || res;
      if (data?.error) throw new Error(data.error);
      setMigrationResult(data);
      toast({ title: t('parties.migrate_ok') });
      load();
    } catch (err) {
      toast({ title: err.message || t('parties.migrate_failed'), variant: 'destructive' });
    } finally {
      setMigrating(false);
    }
  };

  return (
    <div>
      <PageHeader title={t('parties.title')} subtitle={t('parties.subtitle')}>
        <div className="flex gap-2">
          <Button variant="outline" onClick={runMigration} disabled={migrating}>
            {migrating ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1" />}
            {t('parties.run_migration')}
          </Button>
          <Button onClick={() => setShowPartyForm((s) => !s)} variant={showPartyForm ? 'outline' : 'default'}>
            {showPartyForm ? t('common.cancel') : <><Plus className="w-4 h-4 mr-1" /> {t('parties.new_party')}</>}
          </Button>
        </div>
      </PageHeader>

      {migrationResult && (
        <Card className="p-4 mb-6 bg-emerald-50/50 border-emerald-200">
          <p className="text-sm font-medium mb-1">
            {t('parties.migrate_done', { name: migrationResult.party?.name })}
          </p>
          <p className="text-xs text-slate-600">
            {t('parties.migrate_summary', {
              users: (migrationResult.users_party_id_set || 0) + (migrationResult.promoted_super_admin || 0) + (migrationResult.tagged_client_user || 0),
              super: migrationResult.promoted_super_admin || 0
            })}
          </p>
        </Card>
      )}

      {showPartyForm && (
        <Card className="p-5 mb-6">
          <form onSubmit={createParty} className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>{t('parties.name')}</Label>
              <Input required value={partyForm.name} onChange={(e) => setPartyForm({ ...partyForm, name: e.target.value })} placeholder={t('parties.name_ph')} />
            </div>
            <div className="space-y-1">
              <Label>{t('parties.code')}</Label>
              <Input value={partyForm.code} onChange={(e) => setPartyForm({ ...partyForm, code: e.target.value })} placeholder={t('parties.code_ph')} />
            </div>
            <div className="space-y-1">
              <Label>{t('parties.contact_email')}</Label>
              <Input type="email" value={partyForm.contact_email} onChange={(e) => setPartyForm({ ...partyForm, contact_email: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label>{t('parties.notes')}</Label>
              <Input value={partyForm.notes} onChange={(e) => setPartyForm({ ...partyForm, notes: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={savingParty}>
                {savingParty ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Plus className="w-4 h-4 mr-1" />}
                {t('common.create')}
              </Button>
            </div>
          </form>
        </Card>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card className="overflow-hidden">
            <div className="flex items-center gap-2 px-5 py-4 border-b">
              <Building2 className="w-4 h-4 text-indigo-600" />
              <h2 className="font-semibold text-sm">{t('parties.list_title')}</h2>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('parties.name')}</TableHead>
                  <TableHead>{t('parties.code')}</TableHead>
                  <TableHead>{t('parties.contact')}</TableHead>
                  <TableHead>{t('parties.status')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && (
                  <TableRow><TableCell colSpan={4} className="text-center text-slate-400 py-6"><Loader2 className="w-4 h-4 animate-spin inline mr-2" />{t('common.loading')}</TableCell></TableRow>
                )}
                {!loading && parties.length === 0 && (
                  <TableRow><TableCell colSpan={4} className="text-center text-slate-400 py-6">{t('parties.no_parties')}</TableCell></TableRow>
                )}
                {parties.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell className="text-slate-500">{p.code || '—'}</TableCell>
                    <TableCell className="text-slate-500">{p.contact_email || '—'}</TableCell>
                    <TableCell>
                      <Badge variant={p.status === 'active' ? 'default' : 'secondary'} className="capitalize">{p.status || 'active'}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </div>

        <Card className="p-5 h-fit">
          <div className="flex items-center gap-2 mb-4">
            <KeyRound className="w-4 h-4 text-indigo-600" />
            <h2 className="font-semibold text-sm">{t('parties.provision_admin')}</h2>
          </div>
          <div className="grid grid-cols-2 gap-2 mb-4">
            <button
              type="button"
              onClick={() => setAdminTab('create')}
              className={`flex items-center justify-center gap-1.5 text-xs rounded-md border px-3 py-2 transition ${adminTab === 'create' ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-500'}`}
            >
              <KeyRound className="w-3.5 h-3.5" />
              {t('parties.tab_create')}
            </button>
            <button
              type="button"
              onClick={() => setAdminTab('promote')}
              className={`flex items-center justify-center gap-1.5 text-xs rounded-md border px-3 py-2 transition ${adminTab === 'promote' ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-500'}`}
            >
              <UserCog className="w-3.5 h-3.5" />
              {t('parties.tab_promote')}
            </button>
          </div>

          {adminTab === 'create' ? (
            <form onSubmit={provisionAdmin} className="space-y-3">
              <div className="space-y-1">
                <Label>{t('parties.assign_party')}</Label>
                <Select value={adminForm.party_id} onValueChange={(v) => setAdminForm({ ...adminForm, party_id: v })}>
                  <SelectTrigger><SelectValue placeholder={t('parties.select_party')} /></SelectTrigger>
                  <SelectContent>
                    {parties.filter((p) => p.status !== 'inactive').map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>{t('parties.admin_email')}</Label>
                <Input type="email" required value={adminForm.email} onChange={(e) => setAdminForm({ ...adminForm, email: e.target.value })} placeholder="admin@label.com" />
              </div>
              <div className="space-y-1">
                <Label>{t('parties.admin_password')}</Label>
                <Input type="text" required value={adminForm.password} onChange={(e) => setAdminForm({ ...adminForm, password: e.target.value })} placeholder={t('parties.admin_password_ph')} />
              </div>
              <p className="text-xs text-slate-400 flex items-start gap-1">
                <Users className="w-3 h-3 mt-0.5" />
                {t('parties.admin_hint')}
              </p>
              <Button type="submit" disabled={savingAdmin} className="w-full">
                {savingAdmin ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <KeyRound className="w-4 h-4 mr-1" />}
                {t('parties.provision')}
              </Button>
            </form>
          ) : (
            <PromotePartyAdmin parties={parties} onPromoted={load} />
          )}
        </Card>
      </div>
    </div>
  );
}