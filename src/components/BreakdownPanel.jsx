import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid
} from 'recharts';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { BarChart3 } from 'lucide-react';
import { useLanguage } from '@/lib/i18n';

export default function BreakdownPanel({
  data = [],
  valueLabel = 'Revenue',
  formatValue,
  limit
}) {
  const { t } = useLanguage();
  const fmt = formatValue || ((v) => v);
  const storeLabels = { yt: 'YouTube' };
  const labelOf = (key) => storeLabels[String(key).toLowerCase()] || key;
  
  const safeData = Array.isArray(data) ? data : [];
  const items = limit ? safeData.slice(0, limit) : safeData;
  const chartItems = items.slice(0, 10);
  const chartData = chartItems.map((d) => ({
    name: String(labelOf(d?.key || '')).slice(0, 18),
    value: Number(d?.value) || 0
  }));
  const total = items.reduce((acc, d) => acc + (Number(d?.value) || 0), 0);

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      {chartData.length === 0 ? (
        <div className="h-72 flex flex-col items-center justify-center text-muted-foreground border border-dashed border-border/50 rounded-xl bg-card/30 p-6 text-center">
          <BarChart3 className="w-10 h-10 opacity-30 mb-2 text-primary" />
          <p className="text-sm font-medium text-foreground/80">
            No chart data available for this period
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Data for this dimension is not reported by DSPs for this statement period.
          </p>
        </div>
      ) : (
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 20 }}>
              <CartesianGrid vertical={false} stroke="rgba(255, 255, 255, 0.08)" />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 11, fill: '#94a3b8' }}
                interval={0}
                angle={-20}
                textAnchor="end"
                height={55}
                stroke="rgba(255, 255, 255, 0.15)"
              />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} stroke="rgba(255, 255, 255, 0.15)" width={65} />
              <Tooltip
                formatter={(v) => [fmt(v), valueLabel]}
                contentStyle={{
                  backgroundColor: '#191026',
                  borderColor: 'rgba(255, 255, 255, 0.15)',
                  color: '#f8f5fc',
                  borderRadius: '0.5rem',
                  boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)'
                }}
              />
              <Bar dataKey="value" radius={[6, 6, 0, 0]} fill="#6366f1" maxBarSize={48} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      <div className="rounded-lg border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('breakdown.breakdown')}</TableHead>
              <TableHead className="text-right">{valueLabel}</TableHead>
              <TableHead className="text-right">{t('breakdown.share')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">
                  No data available for this period.
                </TableCell>
              </TableRow>
            ) : (
              items.map((d) => {
                const pct = total > 0 ? ((Number(d?.value || 0) / total) * 100).toFixed(1) : '0.0';
                return (
                  <TableRow key={d?.key || Math.random()}>
                    <TableCell className="font-medium text-foreground">{labelOf(d?.key || '')}</TableCell>
                    <TableCell className="text-right text-foreground font-semibold">{fmt(d?.value || 0)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{pct}%</TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
