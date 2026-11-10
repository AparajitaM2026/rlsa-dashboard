import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useSearchParams, Link } from 'react-router-dom';
import PageHeader from '@/components/PageHeader';
import MetricCard from '@/components/MetricCard';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import {
  Banknote,
  Headphones,
  Music2,
  ArrowLeft,
  Search,
  Globe2,
  Store as StoreIcon,
  Home
} from 'lucide-react';
import { useLanguage } from '@/lib/i18n';
import { PeriodFilterBar, usePeriodFilter, formatMonthLabel } from '@/lib/PeriodFilterContext';
import { formatCurrency, formatNumber } from '@/lib/royalty';

export default function HouseImprintDetail() {
  const [searchParams] = useSearchParams();
  const imprint = searchParams.get('name') || '';
  const { selected } = usePeriodFilter();
  const { t } = useLanguage();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!imprint) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    setError(null);
    base44.functions
      .invoke('aggregateHouseImprint', { imprint, period: selected })
      .then((res) => { if (!cancelled) setData(res.data); })
      .catch((e) => { if (!cancelled) setError(e?.message || 'Failed to load'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [imprint, selected]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!imprint) {
    return (
      <Card className="p-8 text-center">
        <p className="text-slate-500">{t('house_imprint.no_imprint')}</p>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="p-8 text-center text-rose-600">
        {error}
      </Card>
    );
  }

  const gross = data?.gross || 0;
  const units = data?.units || 0;
  const trackCount = data?.trackCount || 0;

  let tracks = (data?.perTrack || []).slice();
  if (query) {
    const q = query.toLowerCase();
    tracks = tracks.filter(
      (x) =>
        (x.track_title || '').toLowerCase().includes(q) ||
        (x.isrc || '').toLowerCase().includes(q) ||
        (x.artist || '').toLowerCase().includes(q)
    );
  }
  tracks.sort((a, b) => (b.gross || 0) - (a.gross || 0));

  const countries = (data?.perCountry || []).slice().sort((a, b) => b.gross - a.gross);
  const stores = (data?.perStore || []).slice().sort((a, b) => b.gross - a.gross);

  return (
    <div>
      <PageHeader
        title={`${imprint}`}
        subtitle={t('house_imprint.subtitle', { period: formatMonthLabel(selected) })}
      >
        <Link to="/all-labels-overview" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-700">
          <ArrowLeft className="w-4 h-4" /> {t('house_imprint.back')}
        </Link>
      </PageHeader>
      <PeriodFilterBar />

      <div className="grid sm:grid-cols-3 gap-4 mb-6">
        <MetricCard
          label={t('house_imprint.gross_revenue')}
          value={formatCurrency(gross)}
          icon={Banknote}
          accent="bg-amber-50 text-amber-600"
        />
        <MetricCard
          label={t('house_imprint.total_units')}
          value={formatNumber(units)}
          icon={Headphones}
          accent="bg-indigo-50 text-indigo-600"
        />
        <MetricCard
          label={t('house_imprint.unique_tracks')}
          value={formatNumber(trackCount)}
          icon={Music2}
          accent="bg-violet-50 text-violet-600"
        />
      </div>

      <Tabs defaultValue="tracks">
        <TabsList>
          <TabsTrigger value="tracks">{t('house_imprint.tracks')}</TabsTrigger>
          <TabsTrigger value="countries">{t('house_imprint.countries')}</TabsTrigger>
          <TabsTrigger value="stores">{t('house_imprint.stores')}</TabsTrigger>
        </TabsList>

        {/* Tracks tab */}
        <TabsContent value="tracks">
          <Card className="overflow-hidden">
            <div className="px-5 py-4 border-b flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold flex items-center gap-2">
                <Music2 className="w-4 h-4 text-indigo-600" /> {t('house_imprint.track_wise')}
              </h2>
              <div className="relative w-full sm:w-72">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input
                  placeholder={t('house_imprint.search_tracks')}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('house_imprint.track_title')}</TableHead>
                  <TableHead>{t('house_imprint.artist')}</TableHead>
                  <TableHead>{t('house_imprint.isrc')}</TableHead>
                  <TableHead className="text-right">{t('house_imprint.units')}</TableHead>
                  <TableHead className="text-right">{t('house_imprint.gross_revenue')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tracks.map((row, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{row.track_title}</TableCell>
                    <TableCell className="text-slate-500">{row.artist}</TableCell>
                    <TableCell className="text-slate-400 text-xs font-mono">{row.isrc}</TableCell>
                    <TableCell className="text-right">{formatNumber(row.units)}</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(row.gross)}</TableCell>
                  </TableRow>
                ))}
                {tracks.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-slate-400 py-8">
                      {t('house_imprint.no_data')}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        {/* Countries tab */}
        <TabsContent value="countries">
          <Card className="overflow-hidden">
            <div className="px-5 py-4 border-b flex items-center gap-2">
              <Globe2 className="w-4 h-4 text-indigo-600" />
              <h2 className="font-semibold">{t('house_imprint.country_wise')}</h2>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('house_imprint.country')}</TableHead>
                  <TableHead className="text-right">{t('house_imprint.units')}</TableHead>
                  <TableHead className="text-right">{t('house_imprint.gross_revenue')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {countries.map((c, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{c.key}</TableCell>
                    <TableCell className="text-right">{formatNumber(c.units)}</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(c.gross)}</TableCell>
                  </TableRow>
                ))}
                {countries.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-slate-400 py-8">
                      {t('house_imprint.no_data')}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>

        {/* Stores tab */}
        <TabsContent value="stores">
          <Card className="overflow-hidden">
            <div className="px-5 py-4 border-b flex items-center gap-2">
              <StoreIcon className="w-4 h-4 text-indigo-600" />
              <h2 className="font-semibold">{t('house_imprint.store_wise')}</h2>
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('house_imprint.store_dsp')}</TableHead>
                  <TableHead className="text-right">{t('house_imprint.units')}</TableHead>
                  <TableHead className="text-right">{t('house_imprint.gross_revenue')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stores.map((s, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{s.key}</TableCell>
                    <TableCell className="text-right">{formatNumber(s.units)}</TableCell>
                    <TableCell className="text-right font-medium">{formatCurrency(s.gross)}</TableCell>
                  </TableRow>
                ))}
                {stores.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-slate-400 py-8">
                      {t('house_imprint.no_data')}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}