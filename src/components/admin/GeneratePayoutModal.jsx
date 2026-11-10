import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { logActivity } from '@/lib/activityLog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { X } from 'lucide-react';

export default function GeneratePayoutModal({ clients, onClose, onCreated }) {
  const [clientId, setClientId] = useState('');
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [gross, setGross] = useState('');
  const [payout, setPayout] = useState('');
  const [status, setStatus] = useState('pending');
  const [paymentDate, setPaymentDate] = useState('');
  const [reference, setReference] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const selectedClient = clients.find((c) => c.id === clientId);

  useEffect(() => {
    if (selectedClient && gross) {
      const g = parseFloat(gross) || 0;
      const net = g * (selectedClient.revenue_share_pct / 100);
      setPayout(net.toFixed(2));
    }
  }, [gross, clientId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!clientId || !period || !payout) return;
    setSaving(true);
    setError(null);
    try {
      await base44.entities.Payout.create({
        client_account_id: clientId,
        period,
        gross_revenue: parseFloat(gross) || 0,
        payout_amount: parseFloat(payout) || 0,
        status,
        payment_date: paymentDate || null,
        reference: reference || null,
      });
      await logActivity({
        action: 'payout_created',
        description: `Created ${status} payout for ${selectedClient?.client_name} — ${period} ($${parseFloat(payout).toFixed(2)})`,
        entity_type: 'Payout',
      });
      onCreated();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-card rounded-xl shadow-lg border p-6 w-full max-w-md mx-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-lg">Generate Payout Record</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1">
            <Label>Client Account</Label>
            <select value={clientId} onChange={(e) => setClientId(e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm">
              <option value="">Select client…</option>
              {clients.filter((c) => !c.is_house_account).map((c) => (
                <option key={c.id} value={c.id}>{c.client_name} ({c.revenue_share_pct}%)</option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label>Statement Period</Label>
            <Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Gross Revenue (USD)</Label>
              <Input type="number" step="0.01" value={gross} onChange={(e) => setGross(e.target.value)} placeholder="0.00" />
            </div>
            <div className="space-y-1">
              <Label>Net Payout (USD)</Label>
              <Input type="number" step="0.01" value={payout} onChange={(e) => setPayout(e.target.value)} placeholder="0.00" />
            </div>
          </div>
          {selectedClient && gross && (
            <p className="text-xs text-slate-500">
              Auto-calculated: {selectedClient.revenue_share_pct}% of gross. Override if needed.
            </p>
          )}
          <div className="space-y-1">
            <Label>Status</Label>
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm">
              <option value="pending">Pending</option>
              <option value="processing">Processing</option>
              <option value="paid">Paid</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Payment Date</Label>
              <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Reference / Note</Label>
              <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Optional" />
            </div>
          </div>
          {error && <p className="text-sm text-rose-600 bg-rose-50 rounded-lg p-2">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving || !clientId || !payout}>{saving ? 'Saving…' : 'Create Payout'}</Button>
          </div>
        </form>
      </div>
    </div>
  );
}