import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { logActivity } from '@/lib/activityLog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { X, Loader2, CheckCircle2 } from 'lucide-react';
import { formatCurrency } from '@/lib/royalty';

export default function AutoGeneratePayoutsModal({ clients, existingPayouts, onClose, onDone }) {
  const [period, setPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [status, setStatus] = useState('pending');
  const [generating, setGenerating] = useState(false);
  const [results, setResults] = useState(null);

  const handleGenerate = async () => {
    setGenerating(true);
    setResults(null);
    const nonHouse = clients.filter((c) => !c.is_house_account);
    const created = [];
    const skipped = [];
    const errors = [];
    for (const client of nonHouse) {
      try {
        const res = await base44.functions.invoke('aggregateClientRevenue', {
          client_account_id: client.id,
          period,
        });
        const gross = res.data?.gross || 0;
        if (gross <= 0) {
          skipped.push({ name: client.client_name, reason: 'No revenue for this period' });
          continue;
        }
        const alreadyHas = existingPayouts.some(
          (p) => p.client_account_id === client.id && p.period === period &&
            (p.status === 'pending' || p.status === 'processing' || p.status === 'paid')
        );
        if (alreadyHas) {
          skipped.push({ name: client.client_name, reason: 'Payout already exists' });
          continue;
        }
        const net = gross * (client.revenue_share_pct / 100);
        await base44.entities.Payout.create({
          client_account_id: client.id,
          period,
          gross_revenue: gross,
          payout_amount: parseFloat(net.toFixed(2)),
          status,
        });
        created.push({ name: client.client_name, gross, net: parseFloat(net.toFixed(2)) });
      } catch (err) {
        errors.push({ name: client.client_name, error: err.message });
      }
    }
    if (created.length > 0) {
      await logActivity({
        action: 'payouts_auto_generated',
        description: `Auto-generated ${created.length} ${status} payout(s) for ${period}`,
        entity_type: 'Payout',
        metadata: { period, status, count: created.length },
      });
    }
    setResults({ created, skipped, errors });
    setGenerating(false);
    if (onDone) onDone();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-card rounded-xl shadow-lg border p-6 w-full max-w-lg mx-4 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-lg">Auto-Generate Pending Payouts</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>
        {!results && (
          <div className="space-y-4">
            <p className="text-sm text-slate-500">
              Calculates net earnings from revenue statements for all non-house clients and creates
              payout records with the selected status. Skips clients with no revenue or existing payouts.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Statement Period</Label>
                <Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} disabled={generating} />
              </div>
              <div className="space-y-1">
                <Label>Status</Label>
                <select value={status} onChange={(e) => setStatus(e.target.value)} disabled={generating}
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm">
                  <option value="pending">Pending</option>
                  <option value="processing">Processing</option>
                </select>
              </div>
            </div>
            <Button onClick={handleGenerate} disabled={generating || !period} className="w-full">
              {generating ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Generating…</> : 'Generate Payouts'}
            </Button>
          </div>
        )}
        {results && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-emerald-600">
              <CheckCircle2 className="w-5 h-5" />
              <span className="font-medium">Generated {results.created.length} payout(s) for {period}</span>
            </div>
            {results.created.length > 0 && (
              <div className="space-y-1">
                {results.created.map((c) => (
                  <div key={c.name} className="flex justify-between text-sm py-1.5 border-b">
                    <span className="font-medium">{c.name}</span>
                    <span className="text-emerald-600 font-semibold">{formatCurrency(c.net)}
                      <span className="text-slate-400 font-normal ml-1">(gross {formatCurrency(c.gross)})</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
            {results.skipped.length > 0 && (
              <div className="text-sm text-slate-500 pt-2">
                <p className="font-medium mb-1">Skipped {results.skipped.length}:</p>
                {results.skipped.map((s, i) => (
                  <div key={i} className="flex justify-between py-0.5">
                    <span>{s.name}</span>
                    <span className="text-slate-400">{s.reason}</span>
                  </div>
                ))}
              </div>
            )}
            {results.errors.length > 0 && (
              <div className="text-sm text-rose-600 pt-2">
                <p className="font-medium mb-1">Errors ({results.errors.length}):</p>
                {results.errors.map((e, i) => (
                  <div key={i}>{e.name}: {e.error}</div>
                ))}
              </div>
            )}
            <Button onClick={onClose} className="w-full mt-2">Done</Button>
          </div>
        )}
      </div>
    </div>
  );
}