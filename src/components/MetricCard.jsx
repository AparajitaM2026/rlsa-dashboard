import { Card } from '@/components/ui/card';

export default function MetricCard({ label, value, sub, icon: Icon, accent }) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-slate-500">{label}</p>
          <p className="text-2xl font-semibold mt-1 tracking-tight truncate">{value}</p>
          {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
        </div>
        {Icon && (
          <div className={`rounded-lg p-2 shrink-0 ${accent || 'bg-indigo-50 text-indigo-600'}`}>
            <Icon className="w-5 h-5" />
          </div>
        )}
      </div>
    </Card>
  );
}