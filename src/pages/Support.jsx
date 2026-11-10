import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { base44 } from '@/api/base44Client';
import PageHeader from '@/components/PageHeader';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import { MessageSquare, Plus, Send, X } from 'lucide-react';
import { formatMonthLabel } from '@/lib/PeriodFilterContext';
import { useLanguage } from '@/lib/i18n';
import { isSuperAdmin, isPartyAdmin, getPartyId } from '@/lib/roles';

const statusTone = { open: 'outline', in_progress: 'default', answered: 'default', closed: 'secondary' };
const statusOptions = [
  { value: 'open', label: 'Open' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'answered', label: 'Answered' },
  { value: 'closed', label: 'Closed' }
];

export default function Support() {
  const { user } = useAuth();
  const isSuper = isSuperAdmin(user);
  const isPA = isPartyAdmin(user);
  const isAdmin = isSuper || isPA;
  const partyId = getPartyId(user);
  const { t } = useLanguage();
  const [tickets, setTickets] = useState([]);
  const [clients, setClients] = useState([]);
  const [userMap, setUserMap] = useState({});
  const [partyMap, setPartyMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [reply, setReply] = useState('');
  const [msgLoading, setMsgLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [newTicket, setNewTicket] = useState({ subject: '', period: '', message: '' });
  const [creating, setCreating] = useState(false);

  const loadTickets = () => {
    setLoading(true);
    Promise.all([
      base44.entities.SupportTicket.list('-created_date', 500),
      base44.entities.ClientAccount.list('-created_date', 500),
      base44.entities.Party.list('-created_date', 500).catch(() => []),
      isAdmin ? base44.functions.invoke('listPartyUsers', {}).catch(() => ({ data: { users: [] } })) : Promise.resolve({ data: { users: [] } })
    ])
      .then(([tk, c, parties, usersRes]) => {
        setClients(c);
        const pm = {};
        (parties || []).forEach((p) => { pm[p.id] = p; });
        setPartyMap(pm);
        const um = {};
        (usersRes.data?.users || []).forEach((u) => { um[u.id] = u; });
        setUserMap(um);
        // Multi-tenant visibility: Super Admin = all, Party Admin = own party
        // (their tickets + their sub-labels' tickets), Client = own tickets only.
        let visible = tk;
        if (isSuper) visible = tk;
        else if (isPA) visible = tk.filter((x) => x.party_id === partyId);
        else visible = tk.filter((x) => x.created_by_id === user?.id);
        setTickets(visible);
      })
      .finally(() => setLoading(false));
  };
  useEffect(loadTickets, [user?.id]);

  useEffect(() => {
    if (!selectedId) { setMessages([]); return; }
    setMsgLoading(true);
    base44.entities.TicketMessage
      .filter({ ticket_id: selectedId }, 'created_date', 500)
      .then(setMessages)
      .finally(() => setMsgLoading(false));
  }, [selectedId]);

  // Resolve author + party info for a ticket (denormalized fields first, then
  // the user/party maps so existing tickets created before denormalization still
  // resolve instead of showing "Unknown client").
  const authorName = (tk) =>
    tk.created_by_name || userMap[tk.created_by_id]?.full_name || (tk.created_by_id === user?.id ? user?.full_name : '—');
  const authorEmail = (tk) =>
    tk.created_by_email || userMap[tk.created_by_id]?.email || (tk.created_by_id === user?.id ? user?.email : '—');
  const ticketPartyName = (tk) => partyMap[tk.party_id]?.name || '—';

  const createTicket = async (e) => {
    e.preventDefault();
    if (!newTicket.subject || !newTicket.message) return;
    setCreating(true);
    try {
      const myClient = clients.find((c) => c.contact_email === user?.email);
      const created = await base44.entities.SupportTicket.create({
        subject: newTicket.subject,
        message: newTicket.message,
        period: newTicket.period,
        status: 'open',
        client_account_id: myClient?.id || null,
        created_by_name: user?.full_name || user?.email || '',
        created_by_email: user?.email || '',
        party_id: partyId || ''
      });
      await base44.entities.TicketMessage.create({
        ticket_id: created.id,
        author_role: 'client',
        author_email: user?.email || '',
        body: newTicket.message,
        party_id: partyId || ''
      });
      setNewTicket({ subject: '', period: '', message: '' });
      setShowForm(false);
      loadTickets();
      setSelectedId(created.id);
    } finally {
      setCreating(false);
    }
  };

  const sendReply = async () => {
    if (!reply.trim() || !selectedId) return;
    const body = reply.trim();
    setReply('');
    try {
      const msg = await base44.entities.TicketMessage.create({
        ticket_id: selectedId,
        author_role: isAdmin ? 'admin' : 'client',
        author_email: user?.email || '',
        body,
        party_id: partyId || ''
      });
      setMessages((m) => [...m, msg]);
      const newStatus = isAdmin ? 'in_progress' : 'open';
      await base44.entities.SupportTicket.update(selectedId, { status: newStatus });
      setTickets((ts) => ts.map((tk) => (tk.id === selectedId ? { ...tk, status: newStatus } : tk)));
    } catch (e) {
      setReply(body);
    }
  };

  const setStatus = async (newStatus) => {
    if (!selectedId) return;
    await base44.entities.SupportTicket.update(selectedId, { status: newStatus });
    setTickets((ts) => ts.map((tk) => (tk.id === selectedId ? { ...tk, status: newStatus } : tk)));
  };

  const selected = tickets.find((tk) => tk.id === selectedId);

  return (
    <div>
      <PageHeader
        title={t('sup.title')}
        subtitle={isAdmin ? t('sup.subtitle_admin') : t('sup.subtitle_client')}
      >
        {!isSuper && (
          <Button onClick={() => setShowForm((s) => !s)} variant={showForm ? 'outline' : 'default'}>
            {showForm ? (
              <>
                <X className="w-4 h-4 mr-1" /> {t('sup.cancel')}
              </>
            ) : (
              <>
                <Plus className="w-4 h-4 mr-1" /> {t('sup.new_ticket')}
              </>
            )}
          </Button>
        )}
      </PageHeader>

      {showForm && (
        <Card className="p-5 mb-6">
          <form onSubmit={createTicket} className="space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="subj">{t('sup.subject')}</Label>
                <Input
                  id="subj"
                  required
                  value={newTicket.subject}
                  onChange={(e) => setNewTicket({ ...newTicket, subject: e.target.value })}
                  placeholder={t('sup.subject_ph')}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="per">{t('sup.statement_period')}</Label>
                <Input
                  id="per"
                  type="month"
                  value={newTicket.period}
                  onChange={(e) => setNewTicket({ ...newTicket, period: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="msg">{t('sup.message')}</Label>
              <Textarea
                id="msg"
                required
                rows={4}
                value={newTicket.message}
                onChange={(e) => setNewTicket({ ...newTicket, message: e.target.value })}
                placeholder={t('sup.message_ph')}
              />
            </div>
            <Button type="submit" disabled={creating}>
              {creating ? t('sup.creating') : t('sup.submit_ticket')}
            </Button>
          </form>
        </Card>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        <Card className="p-3 h-fit lg:col-span-1">
          <div className="flex items-center gap-2 px-2 py-2 mb-1">
            <MessageSquare className="w-4 h-4 text-indigo-600" />
            <h2 className="font-semibold text-sm">{t('sup.tickets')}</h2>
          </div>
          <div className="space-y-1 max-h-[70vh] overflow-auto">
            {loading && <p className="text-sm text-slate-400 p-3">{t('sup.loading')}</p>}
            {!loading && tickets.length === 0 && (
              <p className="text-sm text-slate-400 p-3">{t('sup.no_tickets')}</p>
            )}
            {tickets.map((tk) => (
              <button
                key={tk.id}
                onClick={() => setSelectedId(tk.id)}
                className={`w-full text-left rounded-lg p-3 border transition ${
                  selectedId === tk.id ? 'border-indigo-400 bg-indigo-50/50' : 'border-transparent hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-sm truncate">{tk.subject}</span>
                  <Badge variant={statusTone[tk.status] || 'outline'} className="capitalize text-[10px]">
                    {tk.status.replace('_', ' ')}
                  </Badge>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-xs text-slate-500 truncate">
                    {authorName(tk)}
                  </span>
                  <span className="text-xs text-slate-400 truncate ml-2">
                    {tk.period ? formatMonthLabel(tk.period) : '—'}
                  </span>
                </div>
                {isAdmin && (
                  <p className="text-[11px] text-slate-400 truncate mt-0.5">
                    {ticketPartyName(tk)} · {authorEmail(tk)}
                  </p>
                )}
              </button>
            ))}
          </div>
        </Card>

        <div className="lg:col-span-2">
          {!selected ? (
            <Card className="p-8 text-center text-slate-400">
              {tickets.length ? t('sup.select_conversation') : t('sup.no_conversation')}
            </Card>
          ) : (
            <Card className="flex flex-col h-[70vh]">
              <div className="px-5 py-4 border-b">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold truncate">{selected.subject}</p>
                    <p className="text-xs text-slate-500">
                      {selected.period ? formatMonthLabel(selected.period) : t('sup.no_period')}
                    </p>
                    <div className="text-xs text-slate-600 mt-1 flex flex-wrap gap-x-2 gap-y-0.5">
                      <span className="font-medium">{authorName(selected)}</span>
                      <span className="text-slate-400">· {authorEmail(selected)}</span>
                      <span className="text-slate-400">· {ticketPartyName(selected)}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {isAdmin ? (
                      <Select value={selected.status} onValueChange={setStatus}>
                        <SelectTrigger className="w-36 h-8 capitalize">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {statusOptions.map((s) => (
                            <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <Badge variant={statusTone[selected.status] || 'outline'} className="capitalize">
                        {selected.status.replace('_', ' ')}
                      </Badge>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex-1 overflow-auto p-5 space-y-3">
                {msgLoading && <p className="text-sm text-slate-400">{t('sup.loading_messages')}</p>}
                {!msgLoading && messages.length === 0 && (
                  <p className="text-sm text-slate-400">{t('sup.no_messages')}</p>
                )}
                {messages.map((m) => {
                  const mine = m.author_email === user?.email;
                  return (
                    <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                      <div
                        className={`max-w-[75%] rounded-lg px-4 py-2 ${
                          m.author_role === 'admin'
                            ? 'bg-indigo-600 text-white'
                            : mine
                            ? 'bg-slate-200 text-slate-800'
                            : 'bg-white border'
                        }`}
                      >
                        <p className="text-xs opacity-70 mb-0.5">
                          {m.author_role === 'admin' ? t('sup.ott_staff') : t('sup.client')}
                          {!mine && m.author_email ? ` · ${m.author_email}` : ''}
                        </p>
                        <p className="text-sm whitespace-pre-wrap">{m.body}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
              {selected.status !== 'closed' && (
                <div className="p-3 border-t flex items-center gap-2">
                  <Input
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        sendReply();
                      }
                    }}
                    placeholder={t('sup.write_reply')}
                  />
                  <Button onClick={sendReply} disabled={!reply.trim()}>
                    <Send className="w-4 h-4" />
                  </Button>
                </div>
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}