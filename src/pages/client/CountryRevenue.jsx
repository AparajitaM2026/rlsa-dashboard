import { MapContainer, TileLayer, CircleMarker, Tooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { useClientAggregates } from '@/lib/useClientAggregates';
import PageHeader from '@/components/PageHeader';
import { Card } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Globe2 } from 'lucide-react';
import { useLanguage } from '@/lib/i18n';
import { PeriodFilterBar, usePeriodFilter, formatMonthLabel } from '@/lib/PeriodFilterContext';
import { getCentroid } from '@/lib/countryCentroids';
import { formatCurrency, formatNumber, scaleRevenue, sumField } from '@/lib/royalty';

export default function CountryRevenue() {
  const { clientAccount, loading, data, dataLoading } = useClientAggregates();
  const { selected } = usePeriodFilter();
  const { t } = useLanguage();

  if (loading || dataLoading) {
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

  const sharePct = data?.sharePct != null ? data.sharePct : (clientAccount?.revenue_share_pct || 0);

  const countries = (data?.perCountry || []).map((c) => ({
    name: c.key,
    units: c.units,
    gross: c.gross,
    payout: scaleRevenue(c.gross, sharePct),
    centroid: getCentroid(c.key)
  }));

  const totalUnits = sumField(countries, 'units');
  const totalPayout = sumField(countries, 'payout');
  const maxGross = countries.reduce((m, c) => Math.max(m, c.gross), 0);

  const radiusFor = (gross) =>
    maxGross > 0 ? Math.max(4, Math.min(28, (gross / maxGross) * 28)) : 6;

  return (
    <div>
      <PageHeader
        title={t('country.title')}
        subtitle={t('country.subtitle', { share: sharePct, period: formatMonthLabel(selected) })}
      />

      <PeriodFilterBar />

      <div className="grid sm:grid-cols-3 gap-4 mb-6">
        <Card className="p-4">
          <p className="text-xs text-slate-500">{t('country.countries')}</p>
          <p className="text-xl font-semibold mt-1">{formatNumber(countries.length)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500">{t('country.total_units')}</p>
          <p className="text-xl font-semibold mt-1">{formatNumber(totalUnits)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500">{t('country.client_revenue_share')}</p>
          <p className="text-xl font-semibold mt-1 text-emerald-600">{formatCurrency(totalPayout)}</p>
        </Card>
      </div>

      <Card className="overflow-hidden mb-6">
        <div className="px-5 py-4 border-b flex items-center gap-2">
          <Globe2 className="w-4 h-4 text-indigo-600" />
          <h2 className="font-semibold">{t('country.world_map')}</h2>
        </div>
        <div className="h-[400px] w-full">
          <MapContainer
            center={[20, 0]}
            zoom={2}
            minZoom={2}
            scrollWheelZoom={false}
            style={{ height: '100%', width: '100%' }}
            worldCopyJump
          >
            <TileLayer
              attribution='&copy; OpenStreetMap contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {countries
              .filter((c) => c.centroid && c.gross > 0)
              .map((c) => (
                <CircleMarker
                  key={c.name}
                  center={[c.centroid.lat, c.centroid.lng]}
                  radius={radiusFor(c.gross)}
                  pathOptions={{
                    color: '#4f46e5',
                    weight: 1,
                    fillColor: '#6366f1',
                    fillOpacity: 0.55
                  }}
                >
                  <Tooltip>
                    <div className="text-xs">
                      <p className="font-semibold">{c.name}</p>
                      <p>{t('country.tooltip_units', { n: formatNumber(c.units) })}</p>
                      <p>{t('country.tooltip_share', { v: formatCurrency(c.payout) })}</p>
                    </div>
                  </Tooltip>
                </CircleMarker>
              ))}
          </MapContainer>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="px-5 py-4 border-b">
          <h2 className="font-semibold">{t('country.summary')}</h2>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('country.country')}</TableHead>
              <TableHead className="text-right">{t('country.total_units')}</TableHead>
              <TableHead className="text-right">{t('country.client_revenue_share')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {countries.map((c, i) => (
              <TableRow key={i}>
                <TableCell className="font-medium">{c.name}</TableCell>
                <TableCell className="text-right">{formatNumber(c.units)}</TableCell>
                <TableCell className="text-right font-semibold text-emerald-600">
                  {formatCurrency(c.payout)}
                </TableCell>
              </TableRow>
            ))}
            {countries.length === 0 && (
              <TableRow>
                <TableCell colSpan={3} className="text-center text-slate-400 py-8">
                  {t('country.no_data')}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}