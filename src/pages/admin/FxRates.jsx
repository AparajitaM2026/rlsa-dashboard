import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
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
import { DollarSign, RefreshCw, Plus, Trash2, Info } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { isSuperAdmin } from '@/lib/roles';
import { Navigate } from 'react-router-dom';

export default function FxRates() {
  const { user } = useAuth();
  const [rates, setRates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [fetching, setFetching] = useState(false);
  const [manualRate, setManualRate] = useState('');
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const loadRates = async () => {
    setLoading(true);
    try {
      const data = await base44.entities.MonthlyFxRate.list('-created_date', 500);
      data.sort((a, b) => (b.year - a.year) || (b.month - a.month));
      setRates(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadRates(); }, []);

  if (!isSuperAdmin(user)) return <Navigate to="/dashboard" replace />;

  const handleFetch = async () => {
    setFetching(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await base44.functions.invoke('fetchFxRate', {
        year: Number(year),
        month: Number(month),
      });
      setSuccess(`Rate for ${year}-${String(month).padStart(2, '0')}: ₹${res.data.rate.toFixed(4)} per $1`);
      await loadRates();
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to fetch rate');
    } finally {
      setFetching(false);
    }
  };

  const handleManualAdd = async () => {
    const rate = parseFloat(manualRate);
    if (!rate || rate <= 0) return;
    setError(null);
    setSuccess(null);
    try {
      const existing = rates.filter((r) => r.year === Number(year) && r.month === Number(month));
      for (const r of existing) {
        await base44.entities.MonthlyFxRate.delete(r.id);
      }
      await base44.entities.MonthlyFxRate.create({
        year: Number(year),
        month: Number(month),
        rate,
        source: 'manual',
      });
      setManualRate('');
      setSuccess(`Manual rate saved for ${year}-${String(month).padStart(2, '0')}`);
      await loadRates();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async (id) => {
    await base44.entities.MonthlyFxRate.delete(id);
    await loadRates();
  };

  return (
    <div>
      <PageHeader title="Exchange Rate Management" subtitle="Monthly USD → INR rates for PDL vendor currency conversion" />

      <div className="grid lg:grid-cols-2 gap-6 mb-6">
        <Card className="p-6">
          <h2 className="font-semibold mb-4">Fetch / Add Rate</h2>
          <div className="flex gap-3 items-end mb-4">
            <div className="space-y-1">
              <Label>Year</Label>
              <Input type="number" value={year} onChange={(e) => setYear(e.target.value)} className="w-32" />
            </div>
            <div className="space-y-1">
              <Label>Month</Label>
              <Input type="number" min="1" max="12" value={month} onChange={(e) => setMonth(e.target.value)} className="w-24" />
            </div>
            <Button onClick={handleFetch} disabled={fetching}>
              <RefreshCw className={`w-4 h-4 mr-1 ${fetching ? 'animate-spin' : ''}`} />
              Fetch from API
            </Button>
          </div>
          <div className="pt-4 border-t">
            <h3 className="text-sm font-medium mb-2">Or enter manually</h3>
            <div className="flex gap-3 items-end">
              <div className="space-y-1 flex-1">
                <Label>Rate (INR per 1 USD)</Label>
                <Input type="number" step="0.0001" value={manualRate} onChange={(e) => setManualRate(e.target.value)} placeholder="e.g. 83.50" />
              </div>
              <Button onClick={handleManualAdd} disabled={!manualRate}>
                <Plus className="w-4 h-4 mr-1" />
                Save
              </Button>
            </div>
          </div>
          {error && <p className="text-sm text-rose-600 mt-3 bg-rose-50 rounded-lg p-2">{error}</p>}
          {success && <p className="text-sm text-emerald-600 mt-3 bg-emerald-50 rounded-lg p-2">{success}</p>}
        </Card>

        <Card className="p-6">
          <div className="flex items-center gap-2 mb-3">
            <Info className="w-5 h-5 text-indigo-600" />
            <h2 className="font-semibold">How PDL Conversion Works</h2>
          </div>
          <ul className="text-sm text-slate-600 space-y-2">
            <li>• When a <strong>PDL</strong> vendor CSV is uploaded, each row's INR revenue is converted to USD using the exchange rate for that row's Month/Year.</li>
            <li>• Rates are auto-fetched from the Frankfurter API (ECB reference rates) and cached in the database.</li>
            <li>• You can manually add or override rates above for any month.</li>
            <li>• Formula: <code className="bg-slate-100 px-1 rounded">USD = INR ÷ Rate</code></li>
            <li>• Non-PDL vendors (Orchard, Symphonic, etc.) are <strong>not affected</strong> — their values are stored as-is.</li>
          </ul>
        </Card>
      </div>

      <Card className="overflow-hidden">
        <div className="px-5 py-4 border-b flex items-center justify-between">
          <h2 className="font-semibold">Cached Rates</h2>
          <span className="text-sm text-slate-500">{rates.length} rates</span>
        </div>
        {loading ? (
          <div className="p-8 text-center text-slate-400">Loading...</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Year</TableHead>
                <TableHead>Month</TableHead>
                <TableHead className="text-right">Rate (INR/USD)</TableHead>
                <TableHead>Source</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rates.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.year}</TableCell>
                  <TableCell>{String(r.month).padStart(2, '0')}</TableCell>
                  <TableCell className="text-right font-mono">{r.rate?.toFixed(4)}</TableCell>
                  <TableCell>
                    <Badge variant={r.source === 'manual' ? 'default' : 'secondary'}>
                      {r.source || 'unknown'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <button onClick={() => handleDelete(r.id)} className="text-slate-400 hover:text-rose-600">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </TableCell>
                </TableRow>
              ))}
              {rates.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-slate-400 py-8">
                    No rates cached yet. Fetch a rate or add one manually.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        )}
      </Card>
    </div>
  );
}