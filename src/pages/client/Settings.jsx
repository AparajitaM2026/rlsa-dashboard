import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';
import PageHeader from '@/components/PageHeader';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { KeyRound, Mail, BellRing, Save, CheckCircle2 } from 'lucide-react';
import { useActiveClient } from '@/lib/ClientContext';
import { useLanguage } from '@/lib/i18n';

export default function Settings() {
  const { user } = useAuth();
  const { clientAccount, loading } = useActiveClient();
  const { t } = useLanguage();

  // Password
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState(null);

  // Contact email
  const [email, setEmail] = useState('');
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailMsg, setEmailMsg] = useState(null);

  // Notifications
  const [notif, setNotif] = useState({
    notify_payouts: true,
    notify_monthly_report: true,
    notify_unmapped: false
  });
  const [notifSaving, setNotifSaving] = useState(false);
  const [notifMsg, setNotifMsg] = useState(null);

  // Initialise forms from the client account once loaded.
  useEffect(() => {
    if (!clientAccount?.id) return;
    setEmail(clientAccount.contact_email || '');
    setNotif({
      notify_payouts: clientAccount.notify_payouts ?? true,
      notify_monthly_report: clientAccount.notify_monthly_report ?? true,
      notify_unmapped: clientAccount.notify_unmapped ?? false
    });
  }, [clientAccount]);

  const changePassword = async (e) => {
    e.preventDefault();
    setPwMsg(null);
    if (pw.next !== pw.confirm) {
      setPwMsg({ type: 'error', text: t('settings.pw_mismatch') });
      return;
    }
    if (pw.next.length < 8) {
      setPwMsg({ type: 'error', text: t('settings.pw_short') });
      return;
    }
    setPwSaving(true);
    try {
      const res = await base44.functions.invoke('changeOwnPassword', {
        current_password: pw.current,
        new_password: pw.next
      });
      setPw({ current: '', next: '', confirm: '' });
      setPwMsg({ type: 'ok', text: t('settings.pw_updated') });
    } catch (err) {
      const msg = err?.response?.data?.error || err?.message || t('settings.pw_error');
      setPwMsg({
        type: 'error',
        text: msg.toLowerCase().includes('incorrect') ? t('settings.pw_incorrect') : msg
      });
    } finally {
      setPwSaving(false);
    }
  };

  const saveEmail = async (e) => {
    e.preventDefault();
    setEmailMsg(null);
    if (!clientAccount?.id) return;
    setEmailSaving(true);
    try {
      await base44.entities.ClientAccount.update(clientAccount.id, { contact_email: email });
      setEmailMsg({ type: 'ok', text: t('settings.email_updated') });
    } catch (err) {
      setEmailMsg({ type: 'error', text: err.message || t('settings.email_error') });
    } finally {
      setEmailSaving(false);
    }
  };

  const saveNotif = async (e) => {
    e.preventDefault();
    setNotifMsg(null);
    if (!clientAccount?.id) return;
    setNotifSaving(true);
    try {
      await base44.entities.ClientAccount.update(clientAccount.id, {
        notify_payouts: notif.notify_payouts,
        notify_monthly_report: notif.notify_monthly_report,
        notify_unmapped: notif.notify_unmapped
      });
      setNotifMsg({ type: 'ok', text: t('settings.notif_saved') });
    } catch (err) {
      setNotifMsg({ type: 'error', text: err.message || t('settings.notif_error') });
    } finally {
      setNotifSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!clientAccount) {
    return (
      <Card className="p-8 text-center">
        <p className="text-slate-500">
          {t('common.no_account')}
        </p>
      </Card>
    );
  }

  return (
    <div>
      <PageHeader title={t('settings.title')} subtitle={t('settings.subtitle')} />
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Password */}
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <KeyRound className="w-4 h-4 text-indigo-600" />
            <h2 className="font-semibold">{t('settings.change_password')}</h2>
          </div>
          <form onSubmit={changePassword} className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="cur">{t('settings.current_password')}</Label>
              <Input
                id="cur"
                type="password"
                required
                value={pw.current}
                onChange={(e) => setPw({ ...pw, current: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="np">{t('settings.new_password')}</Label>
              <Input
                id="np"
                type="password"
                required
                value={pw.next}
                onChange={(e) => setPw({ ...pw, next: e.target.value })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cp">{t('settings.confirm_password')}</Label>
              <Input
                id="cp"
                type="password"
                required
                value={pw.confirm}
                onChange={(e) => setPw({ ...pw, confirm: e.target.value })}
              />
            </div>
            <Button type="submit" disabled={pwSaving} className="w-full">
              {pwSaving ? t('settings.updating') : t('settings.update_password')}
            </Button>
            {pwMsg && <Msg msg={pwMsg} />}
          </form>
        </Card>

        {/* Contact email + notifications */}
        <div className="space-y-6">
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <Mail className="w-4 h-4 text-indigo-600" />
              <h2 className="font-semibold">{t('settings.contact_email')}</h2>
            </div>
            <form onSubmit={saveEmail} className="space-y-3">
              <div className="space-y-1">
                <Label htmlFor="em">{t('settings.email_address')}</Label>
                <Input
                  id="em"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <Button type="submit" disabled={emailSaving || !clientAccount?.id} className="w-full">
                <Save className="w-4 h-4 mr-1" />
                {emailSaving ? t('settings.saving') : t('settings.save_email')}
              </Button>
              {emailMsg && <Msg msg={emailMsg} />}
            </form>
          </Card>

          <Card className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <BellRing className="w-4 h-4 text-indigo-600" />
              <h2 className="font-semibold">{t('settings.notification_preferences')}</h2>
            </div>
            <form onSubmit={saveNotif} className="space-y-2">
              <NotifRow
                title={t('settings.notif_payouts_title')}
                desc={t('settings.notif_payouts_desc')}
                checked={notif.notify_payouts}
                onChange={(v) => setNotif({ ...notif, notify_payouts: v })}
              />
              <NotifRow
                title={t('settings.notif_monthly_title')}
                desc={t('settings.notif_monthly_desc')}
                checked={notif.notify_monthly_report}
                onChange={(v) => setNotif({ ...notif, notify_monthly_report: v })}
              />
              <NotifRow
                title={t('settings.notif_unmapped_title')}
                desc={t('settings.notif_unmapped_desc')}
                checked={notif.notify_unmapped}
                onChange={(v) => setNotif({ ...notif, notify_unmapped: v })}
              />
              <Button type="submit" disabled={notifSaving || !clientAccount?.id} className="w-full mt-2">
                {notifSaving ? t('settings.saving') : t('settings.save_preferences')}
              </Button>
              {notifMsg && <Msg msg={notifMsg} />}
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
}

function NotifRow({ title, desc, checked, onChange }) {
  return (
    <div className="flex items-center justify-between rounded-lg border p-3">
      <div className="pr-3">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-xs text-slate-500">{desc}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function Msg({ msg }) {
  return (
    <div
      className={`flex items-center gap-2 text-sm rounded-lg p-3 ${
        msg.type === 'ok' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
      }`}
    >
      {msg.type === 'ok' && <CheckCircle2 className="w-4 h-4" />}
      {msg.text}
    </div>
  );
}