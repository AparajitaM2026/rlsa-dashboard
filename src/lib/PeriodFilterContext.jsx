import { createContext, useState, useContext, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Calendar } from 'lucide-react';
import { translate } from '@/lib/i18n';

const PeriodContext = createContext(null);

/**
 * Wraps the authenticated app so every admin/client screen shares one
 * Statement Period selector. The selected month persists across page
 * navigation. "all" = cumulative across all retained report months.
 */
export function PeriodFilterProvider({ children }) {
  const [months, setMonths] = useState([]);
  const [selected, setSelected] = useState('all');
  const location = useLocation();

  useEffect(() => {
    // Periods are detected dynamically from actual RevenueRow records via a
    // backend function that probes which YYYY-MM periods have data — this
    // ensures all historical periods (e.g. 2025) appear even if CsvUploadJob
    // or MonthlyAggregate records are missing. Re-fetched on every route
    // change so newly uploaded months appear without a manual page refresh.
    base44.functions
      .invoke('getStatementPeriods', {})
      .then((res) => {
        setMonths(res.data?.periods || []);
      })
      .catch(() => setMonths([]));
  }, [location.pathname]);

  const filterRows = (rows, field = 'report_month') =>
    selected === 'all' ? rows : rows.filter((r) => r[field] === selected);

  return (
    <PeriodContext.Provider value={{ months, selected, setSelected, filterRows }}>
      {children}
    </PeriodContext.Provider>
  );
}

export function usePeriodFilter() {
  const ctx = useContext(PeriodContext);
  if (!ctx) return { months: [], selected: 'all', setSelected: () => {}, filterRows: (r) => r };
  return ctx;
}

const LOCALE_MAP = { en: 'en-US', ar: 'ar', fr: 'fr-FR' };

export function formatMonthLabel(m) {
  if (!m || m === 'all') return translate('common.all_time');
  const [y, mo] = m.split('-');
  const date = new Date(Number(y), Number(mo) - 1, 1);
  const locale = LOCALE_MAP[document.documentElement.lang] || 'en-US';
  return date.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
}

export function PeriodFilterBar() {
  const { months, selected, setSelected } = usePeriodFilter();
  return (
    <div className="flex items-center gap-2 mb-5">
      <Calendar className="w-4 h-4 text-primary" />
      <span className="text-sm font-medium text-foreground">{translate('common.statement_period')}</span>
      <Select value={selected} onValueChange={setSelected}>
        <SelectTrigger className="w-56 h-8 bg-card border-border text-foreground">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">{translate('common.all_time_cumulative')}</SelectItem>
          {months.map((m) => (
            <SelectItem key={m} value={m}>
              {formatMonthLabel(m)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {selected !== 'all' && (
        <span className="text-xs text-slate-400">
          {months.length ? translate('common.report_periods_available', { n: months.length }) : ''}
        </span>
      )}
    </div>
  );
}