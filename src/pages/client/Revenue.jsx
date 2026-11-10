import { useClientAggregates } from '@/lib/useClientAggregates';
import PageHeader from '@/components/PageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import BreakdownPanel from '@/components/BreakdownPanel';
import { useLanguage } from '@/lib/i18n';
import { formatCurrency, scaleRevenue } from '@/lib/royalty';
import { PeriodFilterBar, usePeriodFilter, formatMonthLabel } from '@/lib/PeriodFilterContext';

const toBreakdown = (arr, scale) =>
  (arr || []).map((x) => ({ key: x.key, value: scale(x.gross) })).sort((a, b) => b.value - a.value);

export default function Revenue() {
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
  const scale = (v) => scaleRevenue(v, sharePct);
  const totalNet = scale(data?.gross || 0);

  const trackData = toBreakdown(data?.perTrack, scale);
  const albumData = toBreakdown(data?.perAlbum, scale);
  const countryData = toBreakdown(data?.perCountry, scale);
  const storeData = toBreakdown(data?.perStore, scale);
  const callerData = toBreakdown(data?.perCaller, scale);

  return (
    <div>
      <PageHeader
        title={t('revenue.title')}
        subtitle={t('revenue.subtitle', { share: sharePct, period: formatMonthLabel(selected), total: formatCurrency(totalNet) })}
      />
      <PeriodFilterBar />
      <Tabs defaultValue="track">
        <TabsList className="mb-4 flex flex-wrap h-auto">
          <TabsTrigger value="track">{t('revenue.track_wise')}</TabsTrigger>
          <TabsTrigger value="album">{t('revenue.album_wise')}</TabsTrigger>
          <TabsTrigger value="country">{t('revenue.country_wise')}</TabsTrigger>
          <TabsTrigger value="store">{t('revenue.store_dsp')}</TabsTrigger>
          <TabsTrigger value="caller">{t('revenue.caller_tune')}</TabsTrigger>
        </TabsList>

        <TabsContent value="track">
          <Card className="p-5">
            <h2 className="font-semibold mb-4">{t('revenue.by_track')}</h2>
            <BreakdownPanel data={trackData} formatValue={formatCurrency} valueLabel={t('breakdown.revenue')} limit={50} />
          </Card>
        </TabsContent>

        <TabsContent value="album">
          <Card className="p-5">
            <h2 className="font-semibold mb-4">{t('revenue.by_album')}</h2>
            <BreakdownPanel data={albumData} formatValue={formatCurrency} valueLabel={t('breakdown.revenue')} limit={50} />
          </Card>
        </TabsContent>

        <TabsContent value="country">
          <Card className="p-5">
            <h2 className="font-semibold mb-4">{t('revenue.by_country')}</h2>
            <BreakdownPanel data={countryData} formatValue={formatCurrency} valueLabel={t('breakdown.revenue')} limit={50} />
          </Card>
        </TabsContent>

        <TabsContent value="store">
          <Card className="p-5">
            <h2 className="font-semibold mb-4">{t('revenue.by_store')}</h2>
            <BreakdownPanel data={storeData} formatValue={formatCurrency} valueLabel={t('breakdown.revenue')} limit={50} />
          </Card>
        </TabsContent>

        <TabsContent value="caller">
          <Card className="p-5">
            <h2 className="font-semibold mb-4">{t('revenue.by_caller')}</h2>
            <BreakdownPanel data={callerData} formatValue={formatCurrency} valueLabel={t('breakdown.revenue')} limit={50} />
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}