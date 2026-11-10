import { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { isAdminLevel } from '@/lib/roles';
import { base44 } from '@/api/base44Client';
import { usePeriodFilter, PeriodFilterBar, formatMonthLabel } from '@/lib/PeriodFilterContext';
import { useLanguage } from '@/lib/i18n';
import { formatCurrency, formatNumber } from '@/lib/royalty';
import PageHeader from '@/components/PageHeader';
import MetricCard from '@/components/MetricCard';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table';
import {
  Banknote, Headphones, Music2, Search, Globe2, Store as StoreIcon, Home, ChevronRight
} from 'lucide-react';

export default function HouseCatalogDetails() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const { selected } = usePeriodFilter();

  const [imprints, setImprints] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [selectedImprint, setSelectedImprint] = useState(null);
  const [search, setSearch] = useState('');
  const [detail, setDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [progressRows, setProgressRows] = useState(0);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoadingList(true);
    setSelectedImprint(null);
    const aggPromise = selected === 'all'
      ? base44.entities.MonthlyAggregate.list('-report_month', 500)
      : base44.entities.MonthlyAggregate.filter({ report_month: selected }, '-report_month', 1);

    aggPromise.then((aggs) => {
      const imprintMap = new Map();
      for (const a of aggs || []) {
        let pi = [];
        try { pi = a.per_imprint ? JSON.parse(a.per_imprint) : []; } catch {}
        for (const im of pi) {
          if (im.is_house) {
            const e = imprintMap.get(im.key) || { key: im.key, gross: 0, units: 0, rows: 0 };
            e.gross += Number(im.gross) || 0;
            e.units += Number(im.units) || 0;
            e.rows += Number(im.rows) || 0;
            imprintMap.set(im.key, e);
          }
        }
      }
      setImprints(Array.from(imprintMap.values()).sort((a, b) => b.gross - a.gross));
    }).finally(() => setLoadingList(false));
  }, [selected]);

  useEffect(() => {
    if (!selectedImprint) { setDetail(null); return; }
    let cancelled = false;
    setLoadingDetail(true);
    setError(null);
    setProgressRows(0);

    const merged = { gross: 0, units: 0, trackCount: 0, perStore: new Map(), perCountry: new Map(), perTrack: new Map() };
    const seenIsrcs = new Set();

    const mergeBatch = (data) => {
      merged.gross += Number(data.gross) || 0;
      merged.units += Number(data.units) || 0;
      // trackCount: merge isrc sets (we approximate by adding new unique isrcs)
      for (const t of data.perTrack || []) {
        const k = t.key || t.isrc || t.track_title;
        if (!seenIsrcs.has(k)) seenIsrcs.add(k);
      }
      merged.trackCount = seenIsrcs.size;
      for (const s of data.perStore || []) {
        const e = merged.perStore.get(s.key) || { gross: 0, units: 0, rows: 0 };
        e.gross += Number(s.gross) || 0; e.units += Number(s.units) || 0; e.rows += Number(s.rows) || 0;
        merged.perStore.set(s.key, e);
      }
      for (const c of data.perCountry || []) {
        const e = merged.perCountry.get(c.key) || { gross: 0, units: 0, rows: 0 };
        e.gross += Number(c.gross) || 0; e.units += Number(c.units) || 0; e.rows += Number(c.rows) || 0;
        merged.perCountry.set(c.key, e);
      }
      for (const t of data.perTrack || []) {
        const k = t.key || t.isrc || t.track_title;
        const e = merged.perTrack.get(k) || { isrc: t.isrc, track_title: t.track_title, artist: t.artist, album_title: t.album_title, gross: 0, units: 0, rows: 0 };
        e.gross += Number(t.gross) || 0; e.units += Number(t.units) || 0; e.rows += Number(t.rows) || 0;
        merged.perTrack.set(k, e);
      }
    };

    const finalize = () => ({
      gross: merged.gross,
      units: merged.units,
      trackCount: merged.trackCount,
      perStore: Array.from(merged.perStore, ([k, v]) => ({ key: k, ...v })).sort((a, b) => b.gross - a.gross),
      perCountry: Array.from(merged.perCountry, ([k, v]) => ({ key: k, ...v })).sort((a, b) => b.gross - a.gross),
      perTrack: Array.from(merged.perTrack, ([k, v]) => ({ key: k, ...v })).sort((a, b) => b.gross - a.gross),
    });

    const MAX_BATCHES = 5; // cap total scan at ~30k rows to avoid timeouts on huge imprints
    let batchCount = 0;
    let partial = false;

    const fetchBatch = (skip) => {
      if (cancelled) return;
      batchCount++;
      base44.functions.invoke('aggregateHouseImprint', { imprint: selectedImprint, period: selected, skip })
        .then((res) => {
          if (cancelled) return;
          const data = res.data || res;
          mergeBatch(data);
          setProgressRows(data.rowsScanned || 0);
          if (data.nextSkip != null && batchCount < MAX_BATCHES) {
            fetchBatch(data.nextSkip);
          } else {
            partial = data.nextSkip != null;
            const result = finalize();
            result.partial = partial;
            setDetail(result);
            setLoadingDetail(false);
          }
        })
        .catch((e) => {
          if (!cancelled) { setError(e?.message || 'Failed to load'); setLoadingDetail(false); }
        });
    };

    fetchBatch(0);
    return () => { cancelled = true; };
  }, [selectedImprint, selected]);

  if (user && !isAdminLevel(user)) return <Navigate to="/dashboard" replace />;

  const filteredImprints = search
    ? imprints.filter((i) => i.key.toLowerCase().includes(search.toLowerCase()))
    : imprints;

  const gross = detail?.gross || 0;
  const units = detail?.units || 0;
  const trackCount = detail?.trackCount || 0;

  const tracks = (detail?.perTrack || []).slice().sort((a, b) => (b.gross || 0) - (a.gross || 0));
  const countries = (detail?.perCountry || []).slice().sort((a, b) => b.gross - a.gross);
  const stores = (detail?.perStore || []).slice().sort((a, b) => b.gross - a.gross);

  return (
    <div>
      <PageHeader
        title={t('hcd.title')}
        subtitle={t('hcd.subtitle', { period: formatMonthLabel(selected) })}
      />
      <PeriodFilterBar />

      <div className="grid lg:grid-cols-[320px_1fr] gap-6">
        {/* Imprint list sidebar */}
        <Card className="overflow-hidden h-fit">
          <div className="px-4 py-3 border-b">
            <div className="flex items-center gap-2 mb-2">
              <Home className="w-4 h-4 text-amber-600" />
              <h2 className="font-semibold text-sm">{t('hcd.house_imprints')}</h2>
            </div>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder={t('hcd.search_imprints')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 h-8 text-sm"
              />
            </div>
          </div>
          <div className="max-h-[600px] overflow-y-auto">
            {loadingList ? (
              <div className="p-8 text-center">
                <div className="w-6 h-6 border-2 border-slate-200 border-t-indigo-600 rounded-full animate-spin mx-auto" />
              </div>
            ) : filteredImprints.length === 0 ? (
              <p className="p-6 text-center text-sm text-slate-400">{t('hcd.no_imprints')}</p>
            ) : (
              filteredImprints.map((im) => (
                <button
                  key={im.key}
                  onClick={() => setSelectedImprint(im.key)}
                  className={`w-full text-left px-4 py-3 border-b transition flex items-center justify-between gap-2 ${
                    selectedImprint === im.key
                      ? 'bg-indigo-50 border-l-2 border-l-indigo-600'
                      : 'hover:bg-slate-50'
                  }`}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{im.key}</p>
                    <p className="text-xs text-slate-400">{formatNumber(im.rows)} rows · {formatCurrency(im.gross)}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-300 flex-shrink-0" />
                </button>
              ))
            )}
          </div>
        </Card>

        {/* Detail panel */}
        <div className="min-w-0">
          {!selectedImprint ? (
            <Card className="p-12 text-center">
              <Home className="w-10 h-10 text-slate-200 mx-auto mb-3" />
              <p className="text-sm text-slate-400">{t('hcd.select_imprint')}</p>
            </Card>
          ) : loadingDetail ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <div className="w-8 h-8 border-4 border-slate-200 border-t-indigo-600 rounded-full animate-spin" />
              {progressRows > 0 && (
                <p className="text-sm text-slate-400">{formatNumber(progressRows)} rows scanned…</p>
              )}
            </div>
          ) : error ? (
            <Card className="p-8 text-center text-rose-600">{error}</Card>
          ) : (
            <>
              <h2 className="text-lg font-semibold mb-4 truncate">{selectedImprint}</h2>
              {detail?.partial && (
                <div className="mb-4 px-4 py-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 text-xs">
                  Showing top results from {formatNumber(progressRows)} scanned rows (large imprint — partial scan).
                </div>
              )}
              <div className="grid sm:grid-cols-3 gap-4 mb-6">
                <MetricCard label={t('house_imprint.gross_revenue')} value={formatCurrency(gross)} icon={Banknote} accent="bg-amber-50 text-amber-600" />
                <MetricCard label={t('house_imprint.total_units')} value={formatNumber(units)} icon={Headphones} accent="bg-indigo-50 text-indigo-600" />
                <MetricCard label={t('house_imprint.unique_tracks')} value={formatNumber(trackCount)} icon={Music2} accent="bg-violet-50 text-violet-600" />
              </div>

              <Tabs defaultValue="tracks">
                <TabsList>
                  <TabsTrigger value="tracks">{t('house_imprint.tracks')}</TabsTrigger>
                  <TabsTrigger value="countries">{t('house_imprint.countries')}</TabsTrigger>
                  <TabsTrigger value="stores">{t('house_imprint.stores')}</TabsTrigger>
                </TabsList>

                <TabsContent value="tracks">
                  <Card className="overflow-hidden">
                    <div className="px-5 py-4 border-b flex items-center gap-2">
                      <Music2 className="w-4 h-4 text-indigo-600" />
                      <h3 className="font-semibold text-sm">{t('house_imprint.track_wise')}</h3>
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t('house_imprint.track_title')}</TableHead>
                          <TableHead>{t('house_imprint.artist')}</TableHead>
                          <TableHead>{t('house_imprint.isrc')}</TableHead>
                          <TableHead className="text-right">{t('house_imprint.units')}</TableHead>
                          <TableHead className="text-right">{t('house_imprint.gross_revenue_col')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {tracks.slice(0, 200).map((row, i) => (
                          <TableRow key={i}>
                            <TableCell className="font-medium">{row.track_title || '—'}</TableCell>
                            <TableCell className="text-slate-500">{row.artist || '—'}</TableCell>
                            <TableCell className="text-slate-400 text-xs font-mono">{row.isrc || '—'}</TableCell>
                            <TableCell className="text-right">{formatNumber(row.units)}</TableCell>
                            <TableCell className="text-right font-medium">{formatCurrency(row.gross)}</TableCell>
                          </TableRow>
                        ))}
                        {tracks.length === 0 && (
                          <TableRow><TableCell colSpan={5} className="text-center text-slate-400 py-8">{t('house_imprint.no_data')}</TableCell></TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </Card>
                </TabsContent>

                <TabsContent value="countries">
                  <Card className="overflow-hidden">
                    <div className="px-5 py-4 border-b flex items-center gap-2">
                      <Globe2 className="w-4 h-4 text-indigo-600" />
                      <h3 className="font-semibold text-sm">{t('house_imprint.country_wise')}</h3>
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t('house_imprint.country')}</TableHead>
                          <TableHead className="text-right">{t('house_imprint.units')}</TableHead>
                          <TableHead className="text-right">{t('house_imprint.gross_revenue_col')}</TableHead>
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
                          <TableRow><TableCell colSpan={3} className="text-center text-slate-400 py-8">{t('house_imprint.no_data')}</TableCell></TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </Card>
                </TabsContent>

                <TabsContent value="stores">
                  <Card className="overflow-hidden">
                    <div className="px-5 py-4 border-b flex items-center gap-2">
                      <StoreIcon className="w-4 h-4 text-indigo-600" />
                      <h3 className="font-semibold text-sm">{t('house_imprint.store_wise')}</h3>
                    </div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t('house_imprint.store_dsp')}</TableHead>
                          <TableHead className="text-right">{t('house_imprint.units')}</TableHead>
                          <TableHead className="text-right">{t('house_imprint.gross_revenue_col')}</TableHead>
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
                          <TableRow><TableCell colSpan={3} className="text-center text-slate-400 py-8">{t('house_imprint.no_data')}</TableCell></TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </Card>
                </TabsContent>
              </Tabs>
            </>
          )}
        </div>
      </div>
    </div>
  );
}