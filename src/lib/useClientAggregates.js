import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useActiveClient } from '@/lib/ClientContext';
import { usePeriodFilter } from '@/lib/PeriodFilterContext';

/**
 * Loads the server-side aggregates for the currently active client scope.
 * - Single account (CLIENT_USER, SUPER_ADMIN preview, or a Party Admin's
 *   selected account) -> aggregateClientRevenue({ client_account_id, period }).
 * - Party Admin "All (Consolidated)" -> aggregateClientRevenue({ client_account_ids, period })
 *   which aggregates across every account in the party and returns a blended
 *   sharePct so the pages scale breakdowns uniformly.
 */
export function useClientAggregates() {
  const { clientAccount, loading, accountIds, consolidatedMode } = useActiveClient();
  const { selected } = usePeriodFilter();
  const [data, setData] = useState(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!clientAccount || accountIds.length === 0) {
      // Keep showing a spinner while the account context is still loading;
      // only clear data once we know there's no account to query.
      if (!loading) {
        setData(null);
        setError(null);
        setDataLoading(false);
      }
      return;
    }
    let cancelled = false;
    setDataLoading(true);
    setError(null);
    const payload = consolidatedMode
      ? { client_account_ids: accountIds, period: selected }
      : { client_account_id: accountIds[0], period: selected };
    base44.functions
      .invoke('aggregateClientRevenue', payload)
      .then((res) => {
        if (!cancelled) {
          setData(res.data || res);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setData(null);
          setError(err.message || 'Failed to load client revenue data');
        }
      })
      .finally(() => { if (!cancelled) setDataLoading(false); });
    return () => { cancelled = true; };
  }, [clientAccount?.id, accountIds.join(','), consolidatedMode, selected, loading]);

  return { clientAccount, loading, data, dataLoading, error };
}