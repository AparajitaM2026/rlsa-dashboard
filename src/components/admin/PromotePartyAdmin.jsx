import { useState, useMemo, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Loader2, Search, UserCog, Check } from 'lucide-react';
import { useLanguage } from '@/lib/i18n';
import { useToast } from '@/components/ui/use-toast';
import { getAccessRole } from '@/lib/roles';

function displayName(u) {
  return u.full_name || u.email || u.id;
}

export default function PromotePartyAdmin({ parties, onPromoted }) {
  const { t } = useLanguage();
  const { toast } = useToast();

  const [users, setUsers] = useState([]);
  const [clientNames, setClientNames] = useState({}); // email(lower) -> client_name
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState(null);
  const [partyMode, setPartyMode] = useState('existing'); // 'existing' | 'new'
  const [partyId, setPartyId] = useState('');
  const [newPartyName, setNewPartyName] = useState('');
  const [promoting, setPromoting] = useState(false);

  // Load users + client accounts once when the promote tab is first used
  useEffect(() => {
    if (users.length > 0) return;
    setLoadingUsers(true);
    Promise.all([
      base44.entities.User.list('-created_date', 500),
      base44.entities.ClientAccount.list('-created_date', 500)
    ])
      .then(([u, accounts]) => {
        setUsers(u);
        const map = {};
        for (const a of accounts) {
          if (a.contact_email) map[a.contact_email.toLowerCase()] = a.client_name;
        }
        setClientNames(map);
      })
      .finally(() => setLoadingUsers(false));
  }, [users.length]);

  const clientNameFor = (u) => clientNames[(u.email || '').toLowerCase()] || null;

  const filtered = useMemo(() => {
    const isRealUser = (u) => {
      const email = (u.email || '').toLowerCase().trim();
      // Exclude reserved test/documentation addresses (never real users)
      if (email.endsWith('@example.com') || email.endsWith('@example.org')) return false;
      return true;
    };
    const q = search.trim().toLowerCase();
    if (!q) return users.filter(isRealUser).slice(0, 8);
    return users
      .filter(isRealUser)
      .filter((u) => {
        const name = (u.full_name || '').toLowerCase();
        const email = (u.email || '').toLowerCase();
        const client = (clientNameFor(u) || '').toLowerCase();
        return name.includes(q) || email.includes(q) || client.includes(q);
      })
      .slice(0, 8);
  }, [users, search, clientNames]);

  const canPromote = selectedUser && (partyMode === 'existing' ? !!partyId : !!newPartyName.trim());

  const promote = async () => {
    if (!canPromote) return;
    setPromoting(true);
    try {
      const payload = { email: selectedUser.email };
      if (partyMode === 'existing') {
        payload.party_id = partyId;
      } else {
        payload.auto_create_party_name = newPartyName.trim();
      }
      const res = await base44.functions.invoke('promoteToPartyAdmin', payload);
      const data = res?.data || res;
      if (data?.error) throw new Error(data.error);
      toast({
        title: t('parties.promote_ok'),
        description: data?.party_created
          ? t('parties.promote_ok_party_created', { email: selectedUser.email, party: data.party_name })
          : t('parties.promote_ok_existing', { email: selectedUser.email }),
        duration: 8000
      });
      setSelectedUser(null);
      setSearch('');
      setNewPartyName('');
      setPartyId('');
      onPromoted?.();
    } catch (err) {
      toast({ title: err.message || t('parties.promote_failed'), variant: 'destructive' });
    } finally {
      setPromoting(false);
    }
  };

  if (selectedUser) {
    const role = getAccessRole(selectedUser) || selectedUser.role || '—';
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between rounded-lg border bg-slate-50 p-3">
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{displayName(selectedUser)}</p>
            <p className="text-xs text-slate-500 truncate">{selectedUser.email}</p>
          </div>
          <Badge variant="secondary" className="ml-2 shrink-0 capitalize">
            {t('parties.promote_role_badge', { role })}
          </Badge>
        </div>
        <button
          type="button"
          onClick={() => setSelectedUser(null)}
          className="text-xs text-indigo-600 hover:underline"
        >
          {t('parties.promote_change')}
        </button>

        <div className="space-y-1">
          <Label>{t('parties.promote_party_mode')}</Label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setPartyMode('existing')}
              className={`text-xs rounded-md border px-3 py-2 transition ${partyMode === 'existing' ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-500'}`}
            >
              {t('parties.promote_party_existing')}
            </button>
            <button
              type="button"
              onClick={() => setPartyMode('new')}
              className={`text-xs rounded-md border px-3 py-2 transition ${partyMode === 'new' ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-500'}`}
            >
              {t('parties.promote_party_new')}
            </button>
          </div>
        </div>

        {partyMode === 'existing' ? (
          <div className="space-y-1">
            <Label>{t('parties.assign_party')}</Label>
            <Select value={partyId} onValueChange={setPartyId}>
              <SelectTrigger><SelectValue placeholder={t('parties.select_party')} /></SelectTrigger>
              <SelectContent>
                {parties.filter((p) => p.status !== 'inactive').map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <div className="space-y-1">
            <Label>{t('parties.promote_new_party_name')}</Label>
            <Input
              value={newPartyName}
              onChange={(e) => setNewPartyName(e.target.value)}
              placeholder={t('parties.promote_new_party_name_ph')}
            />
          </div>
        )}

        <p className="text-xs text-slate-400">{t('parties.promote_hint')}</p>
        <Button type="button" onClick={promote} disabled={!canPromote || promoting} className="w-full">
          {promoting ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <UserCog className="w-4 h-4 mr-1" />}
          {t('parties.promote_btn')}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('parties.promote_search_ph')}
          className="pl-9"
        />
      </div>
      {loadingUsers && (
        <p className="text-xs text-slate-400 flex items-center gap-1 py-2">
          <Loader2 className="w-3 h-3 animate-spin" /> {t('common.loading')}
        </p>
      )}
      {!loadingUsers && filtered.length === 0 && (
        <p className="text-xs text-slate-400 py-3 text-center">{t('parties.promote_no_users')}</p>
      )}
      <div className="max-h-64 overflow-auto rounded-md border divide-y">
        {filtered.map((u) => {
          const role = getAccessRole(u) || u.role || '—';
          const client = clientNameFor(u);
          return (
            <button
              key={u.id}
              type="button"
              onClick={() => setSelectedUser(u)}
              className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-slate-50 transition"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{displayName(u)}</p>
                <p className="text-xs text-slate-500 truncate">
                  {u.email}
                  {client && <span className="text-indigo-500"> · {client}</span>}
                </p>
              </div>
              <Badge variant="outline" className="ml-2 shrink-0 capitalize text-[10px]">{role}</Badge>
            </button>
          );
        })}
      </div>
    </div>
  );
}