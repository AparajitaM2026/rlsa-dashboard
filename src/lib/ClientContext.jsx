import { createContext, useState, useContext, useEffect } from 'react';
import { Outlet } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import { isSuperAdmin, isPartyAdmin, getPartyId } from '@/lib/roles';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Eye, Layers } from 'lucide-react';

const ClientContext = createContext(null);
const ALL = 'all';

/**
 * Provides the active client account + the account ids to query to all
 * client-facing pages.
 * - CLIENT_USER: auto-matched by login email (single account).
 * - SUPER_ADMIN: preview selector across ALL non-house clients.
 * - PARTY_ADMIN: Account selector — "All (Consolidated)", "Main Label (Self)",
 *   or any sub-label account in their party. "All" aggregates across every
 *   account in the party.
 */
export function ClientPreviewProvider() {
  const { user } = useAuth();
  const superAdmin = isSuperAdmin(user);
  const partyAdmin = isPartyAdmin(user);
  const partyId = getPartyId(user);

  const [myAccount, setMyAccount] = useState(null);
  const [allClients, setAllClients] = useState([]);
  const [previewId, setPreviewId] = useState(null);
  const [partyAccounts, setPartyAccounts] = useState([]);
  const [ownAccount, setOwnAccount] = useState(null);
  const [selectedAccountId, setSelectedAccountId] = useState(ALL);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    if (superAdmin) {
      base44.entities.ClientAccount.list('-created_date', 500).then((c) => {
        const nonHouse = c.filter((x) => !x.is_house_account);
        setAllClients(nonHouse);
        const saved = localStorage.getItem('ott_preview_client');
        const initial = saved && nonHouse.find((x) => x.id === saved) ? saved : nonHouse[0]?.id || null;
        setPreviewId(initial);
        setLoading(false);
      });
    } else if (partyAdmin) {
      base44.entities.ClientAccount.list('-created_date', 500).then(async (c) => {
        const nonHouse = c.filter((x) => !x.is_house_account);
        // The Party Admin's "Self" account is the one whose contact_email matches
        // their login. Look across ALL accounts (not just party-scoped) so a user
        // promoted before their account was stamped is still recovered.
        let own = nonHouse.find((x) => (x.contact_email || '').toLowerCase() === (user.email || '').toLowerCase()) || null;
        // Self-heal: stamp the account with the new party_id so it is properly
        // scoped going forward (one-time, best-effort).
        if (own && own.party_id !== partyId) {
          try {
            await base44.entities.ClientAccount.update(own.id, { party_id: partyId });
            own = { ...own, party_id: partyId };
          } catch { /* ignore — keep going with the unstamped account */ }
        }
        let mine = nonHouse.filter((x) => x.party_id === partyId);
        if (own && !mine.find((m) => m.id === own.id)) mine = [own, ...mine];
        setPartyAccounts(mine);
        setOwnAccount(own);
        const saved = localStorage.getItem('ott_party_account');
        const validIds = new Set(mine.map((m) => m.id));
        const initial = saved && (saved === ALL || validIds.has(saved)) ? saved : ALL;
        setSelectedAccountId(initial);
        setLoading(false);
      });
    } else {
      base44.entities.ClientAccount.filter({ contact_email: user.email }).then(async (res) => {
        const acct = res[0] || null;
        setMyAccount(acct);
        // Backfill client_account_id on the user record so RLS account-level
        // scoping works for existing users created before the field was added.
        if (acct) {
          const existing = (user.data && user.data.client_account_id) || user.client_account_id || null;
          if (!existing) {
            try { await base44.auth.updateMe({ client_account_id: acct.id }); } catch { /* non-fatal */ }
          }
        }
        setLoading(false);
      });
    }
  }, [user, reloadKey]);

  const selectPreview = (id) => {
    setPreviewId(id);
    if (id) localStorage.setItem('ott_preview_client', id);
  };
  const selectAccount = (id) => {
    setSelectedAccountId(id);
    localStorage.setItem('ott_party_account', id);
  };
  const reload = () => setReloadKey((k) => k + 1);

  // Resolve the active client account + the account ids to query
  let clientAccount = null;
  let accountIds = [];
  let consolidatedMode = false;
  let accountShareMap = {};

  if (superAdmin) {
    clientAccount = allClients.find((c) => c.id === previewId) || null;
    accountIds = clientAccount ? [clientAccount.id] : [];
    accountShareMap = clientAccount ? { [clientAccount.id]: clientAccount.revenue_share_pct ?? 0 } : {};
  } else if (partyAdmin) {
    if (selectedAccountId === ALL) {
      consolidatedMode = true;
      accountIds = partyAccounts.map((a) => a.id);
      clientAccount = partyAccounts.length ? { id: null, client_name: 'All (Consolidated Party View)', revenue_share_pct: 0 } : null;
      accountShareMap = Object.fromEntries(partyAccounts.map((a) => [a.id, a.revenue_share_pct ?? 0]));
    } else {
      clientAccount = partyAccounts.find((a) => a.id === selectedAccountId) || null;
      accountIds = clientAccount ? [clientAccount.id] : [];
      accountShareMap = clientAccount ? { [clientAccount.id]: clientAccount.revenue_share_pct ?? 0 } : {};
    }
  } else {
    clientAccount = myAccount;
    accountIds = myAccount ? [myAccount.id] : [];
    accountShareMap = myAccount ? { [myAccount.id]: myAccount.revenue_share_pct ?? 0 } : {};
  }

  const value = {
    clientAccount, loading, accountIds, consolidatedMode, accountShareMap,
    isAdmin: superAdmin, allClients, previewId, selectPreview,
    isPartyAdminView: partyAdmin, partyAccounts, ownAccount, selectedAccountId, selectAccount, reload
  };

  return (
    <ClientContext.Provider value={value}>
      {superAdmin && allClients.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 mb-4 rounded-lg border border-border/80 bg-card/80 backdrop-blur-md shadow-sm px-4 py-2.5">
          <Eye className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium text-foreground font-semibold">Previewing client view as:</span>
          <Select value={previewId || ''} onValueChange={selectPreview}>
            <SelectTrigger className="w-64 h-8 bg-card border-border text-foreground font-medium"><SelectValue placeholder="Select client" /></SelectTrigger>
            <SelectContent>
              {allClients.map((c) => <SelectItem key={c.id} value={c.id}>{c.client_name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}
      {partyAdmin && partyAccounts.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 mb-4 rounded-lg border border-border/80 bg-card/80 backdrop-blur-md shadow-sm px-4 py-2.5">
          <Layers className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium text-foreground font-semibold">Account:</span>
          <Select value={selectedAccountId} onValueChange={selectAccount}>
            <SelectTrigger className="w-72 h-8 bg-card border-border text-foreground font-medium"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All (Consolidated Party View)</SelectItem>
              {ownAccount && <SelectItem value={ownAccount.id}>Main Label (Self) — {ownAccount.client_name}</SelectItem>}
              {partyAccounts.filter((a) => a.id !== ownAccount?.id).map((a) => (
                <SelectItem key={a.id} value={a.id}>{a.client_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <Outlet />
    </ClientContext.Provider>
  );
}

export function useActiveClient() {
  return useContext(ClientContext) || { clientAccount: null, loading: true, accountIds: [], consolidatedMode: false, accountShareMap: {} };
}