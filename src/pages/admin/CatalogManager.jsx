import { useState, useEffect, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/lib/AuthContext';
import { isSuperAdmin, isPartyAdmin, getPartyId } from '@/lib/roles';
import { base44 } from '@/api/base44Client';
import { usePeriodFilter, PeriodFilterBar, formatMonthLabel } from '@/lib/PeriodFilterContext';
import PageHeader from '@/components/PageHeader';
import { Card } from '@/components/ui/card';
import { Search } from 'lucide-react';
import { logActivity } from '@/lib/activityLog';
import { useLanguage } from '@/lib/i18n';
import CatalogSourceBar from '@/components/catalog/CatalogSourceBar';
import CatalogAssignBar from '@/components/catalog/CatalogAssignBar';
import CatalogImprints from '@/components/catalog/CatalogImprints';
import CatalogTracks from '@/components/catalog/CatalogTracks';
import MappingTable from '@/components/catalog/MappingTable';
import RecentSearches from '@/components/catalog/RecentSearches';

export default function CatalogManager() {
  const { user } = useAuth();
  const { t } = useLanguage();
  const { selected } = usePeriodFilter();
  const partyId = getPartyId(user);
  const isPA = isPartyAdmin(user);

  const [clients, setClients] = useState([]);
  const [assignableClients, setAssignableClients] = useState([]);
  const [mappings, setMappings] = useState([]);
  const [mappingsLoading, setMappingsLoading] = useState(true);

  const [source, setSource] = useState('house');
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState([]);
  const [imprints, setImprints] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());

  const [targetClient, setTargetClient] = useState('');
  const [sharePct, setSharePct] = useState(85);
  const [overrideLabel, setOverrideLabel] = useState(true);
  const [assigning, setAssigning] = useState(false);
  const [message, setMessage] = useState(null);
  const [lastAction, setLastAction] = useState(null);

  const [savingEdit, setSavingEdit] = useState(false);
  const [scanProgress, setScanProgress] = useState(null);
  const [activeJobId, setActiveJobId] = useState(null);
  const [recentJobs, setRecentJobs] = useState([]);

  useEffect(() => {
    Promise.all([
      base44.entities.ClientAccount.list('-created_date', 500),
      base44.entities.ArtistMapping.list('-created_date', 500)
    ]).then(([c, m]) => {
      let scopedClients = c;
      let scopedAssignable = c.filter((x) => !x.is_house_account && x.status === 'active');
      let scopedMappings = m;
      if (isPA) {
        scopedClients = c.filter((x) => !x.is_house_account && x.party_id === partyId);
        scopedAssignable = scopedClients.filter((x) => x.status === 'active');
        const ids = new Set(scopedClients.map((x) => x.id));
        scopedMappings = m.filter((mp) => ids.has(mp.client_account_id));
      }
      setClients(scopedClients);
      setAssignableClients(scopedAssignable);
      setMappings(scopedMappings);
      if (isPA && scopedAssignable.length > 0 && source === 'house') {
        setSource(scopedAssignable[0].id);
      }
    }).finally(() => setMappingsLoading(false));
  }, []);

  const reloadMappings = useCallback(() => {
    setMappingsLoading(true);
    base44.entities.ArtistMapping.list('-created_date', 500)
      .then(setMappings)
      .finally(() => setMappingsLoading(false));
  }, []);

  // Load recently completed background search jobs for the cached-results dropdown.
  const loadRecentJobs = useCallback(async () => {
    try {
      const f = isPA ? { status: 'completed', party_id: partyId } : { status: 'completed' };
      const jobs = await base44.entities.CatalogSearchJob.filter(f, '-created_date', 10);
      setRecentJobs(jobs);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    loadRecentJobs();
    // Resume polling if there's an in-flight search (e.g. admin navigated away and came back).
    base44.entities.CatalogSearchJob.filter(
      isPA ? { status: { $in: ['pending', 'processing'] }, party_id: partyId } : { status: { $in: ['pending', 'processing'] } }, '-created_date', 1
    ).then((active) => {
      if (active.length > 0) {
        setActiveJobId(active[0].id);
        setSearching(true);
        setQuery(active[0].query);
        setSource(active[0].source || 'house');
        setScanProgress({ scanned: active[0].scanned || 0, tracks: active[0].track_count || 0, imprints: active[0].imprint_count || 0 });
      }
    }).catch(() => {});
  }, [loadRecentJobs]);

  // Poll the active background search job until it completes, then load cached results.
  useEffect(() => {
    if (!activeJobId) return;
    let mounted = true;
    const poll = async () => {
      try {
        const job = await base44.entities.CatalogSearchJob.get(activeJobId);
        if (!mounted) return;
        if (job.status === 'completed') {
          setResults(JSON.parse(job.results || '[]'));
          setImprints(JSON.parse(job.imprints || '[]'));
          setSearching(false);
          setActiveJobId(null);
          setScanProgress(null);
          loadRecentJobs();
          setMessage({ type: 'success', text: t('ca.bg_search_complete', { query: job.query, n: job.track_count }) });
        } else if (job.status === 'failed') {
          setSearching(false);
          setActiveJobId(null);
          setScanProgress(null);
          setMessage({ type: 'error', text: job.error || 'Search failed' });
        } else {
          setScanProgress({ scanned: job.scanned || 0, tracks: job.track_count || 0, imprints: job.imprint_count || 0 });
        }
      } catch { /* ignore transient errors */ }
    };
    poll();
    const interval = setInterval(poll, 2000);
    return () => { mounted = false; clearInterval(interval); };
  }, [activeJobId, t, loadRecentJobs]);

  if (user && !isSuperAdmin(user)) return <Navigate to="/dashboard" replace />;

  const doSearch = async (e) => {
    e?.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    setMessage(null);
    setSelectedIds(new Set());
    setResults([]);
    setImprints([]);
    setScanProgress({ scanned: 0, tracks: 0, imprints: 0 });
    if (isPA && (source === 'house' || source === 'all')) {
      setSearching(false);
      setScanProgress(null);
      setMessage({ type: 'error', text: 'Select one of your accounts as the source.' });
      return;
    }
    try {
      // Run per-field $regex queries in parallel directly from the frontend.
      // This reads only matching records (not all rows), avoiding the
      // "entity read traffic volume limit exceeded" error.
      const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = { $regex: escapeRegex(query.trim()), $options: 'i' };

      const filter = {};
      if (source === 'house') filter.is_house_label = true;
      else if (source !== 'all') filter.client_account_id = source;
      if (selected !== 'all') filter.report_month = selected;

      const fields = ['track_title', 'album_title', 'artist', 'isrc', 'label_imprint'];
      const settled = await Promise.allSettled(
        fields.map((field) =>
          base44.entities.RevenueRow.filter({ ...filter, [field]: regex }, '-created_date', 5000)
        )
      );

      const seen = new Map();
      const imprintMap = new Map();
      let scanned = 0;

      for (const s of settled) {
        if (s.status !== 'fulfilled') continue;
        scanned += s.value.length;
        for (const r of s.value) {
          const key = `${r.isrc || ''}|${r.track_title || ''}`;
          const gross = Number(r.gross_revenue) || 0;
          const units = Number(r.units) || 0;

          const ex = seen.get(key);
          if (ex) {
            ex.gross += gross;
            ex.units += units;
            ex.rows += 1;
          } else {
            seen.set(key, {
              track_title: r.track_title || '',
              isrc: r.isrc || '',
              album_title: r.album_title || '',
              artist: r.artist || '',
              label_imprint: r.label_imprint || '',
              gross, units, rows: 1,
            });
          }

          const ik = r.label_imprint || '(blank)';
          const ie = imprintMap.get(ik) || { gross: 0, units: 0, rows: 0 };
          ie.gross += gross;
          ie.units += units;
          ie.rows += 1;
          imprintMap.set(ik, ie);
        }
      }

      const mergedResults = Array.from(seen.values()).sort((a, b) => b.gross - a.gross);
      const mergedImprints = Array.from(imprintMap.entries())
        .map(([key, v]) => ({ key, ...v }))
        .sort((a, b) => b.gross - a.gross);

      setResults(mergedResults);
      setImprints(mergedImprints);
      setScanProgress(null);
      setSearching(false);

      if (mergedResults.length === 0 && mergedImprints.length === 0) {
        setMessage({ type: 'info', text: t('ca.no_results') });
      } else {
        setMessage({ type: 'success', text: t('ca.bg_search_complete', { query: query.trim(), n: mergedResults.length }) });
      }

      // Cache as a completed job for the "Recent Searches" dropdown.
      const sourceLabel = source === 'house' ? t('ca.source_house')
        : source === 'all' ? t('ca.source_all')
        : clients.find((c) => c.id === source)?.client_name || source;
      base44.entities.CatalogSearchJob.create({
        query: query.trim(),
        source, source_label: sourceLabel, period: selected,
        status: 'completed',
        party_id: isPA ? partyId : undefined,
        results: JSON.stringify(mergedResults.slice(0, 5000)),
        imprints: JSON.stringify(mergedImprints.slice(0, 500)),
        track_count: mergedResults.length,
        imprint_count: mergedImprints.length,
        scanned,
      }).then(() => loadRecentJobs()).catch(() => {});
    } catch (e) {
      setSearching(false);
      setScanProgress(null);
      setMessage({ type: 'error', text: e?.message || 'Search failed' });
    }
  };

  const loadCachedResults = (job) => {
    if (isPA && (job.source === 'house' || job.source === 'all')) {
      setMessage({ type: 'error', text: 'This saved search is outside your party scope.' });
      return;
    }
    setQuery(job.query);
    setSource(job.source || 'house');
    setSelectedIds(new Set());
    setMessage(null);
    try {
      setResults(JSON.parse(job.results || '[]'));
      setImprints(JSON.parse(job.imprints || '[]'));
      setMessage({ type: 'success', text: t('ca.bg_search_complete', { query: job.query, n: job.track_count }) });
    } catch {
      setResults([]);
      setImprints([]);
    }
  };

  const toggleSelect = (idx) => {
    const next = new Set(selectedIds);
    if (next.has(idx)) next.delete(idx); else next.add(idx);
    setSelectedIds(next);
  };

  const toggleAll = () => {
    if (selectedIds.size === results.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(results.map((_, i) => i)));
  };

  const buildRevertUpdate = (src) => {
    if (src === 'house') return { $set: { is_house_label: true }, $unset: { client_account_id: '' } };
    if (src !== 'all') return { $set: { is_house_label: false, client_account_id: src } };
    return { $unset: { client_account_id: '' } };
  };

  const assignTracks = async () => {
    if (!targetClient || selectedIds.size === 0) return;
    setAssigning(true);
    setMessage(null);
    try {
      const items = Array.from(selectedIds).map((i) => results[i]);
      let totalRows = 0;
      const createdMappingIds = [];
      for (const item of items) {
        const matchType = item.isrc ? 'isrc' : 'track_title';
        const matchValue = item.isrc || item.track_title;
        const mapping = await base44.entities.ArtistMapping.create({
          match_type: matchType,
          match_value: matchValue,
          client_account_id: targetClient,
          revenue_share_pct: Number(sharePct) || 85,
          override_label: overrideLabel,
          party_id: isPA ? partyId : undefined
        });
        if (mapping?.id) createdMappingIds.push(mapping.id);
        const filter = item.isrc
          ? { isrc: item.isrc }
          : { track_title: item.track_title };
        if (source === 'house') filter.is_house_label = true;
        else if (source !== 'all') filter.client_account_id = source;
        if (selected !== 'all') filter.report_month = selected;
        await base44.entities.RevenueRow.updateMany(filter, {
          $set: { is_house_label: false, client_account_id: targetClient }
        });
        totalRows += item.rows;
      }
      const clientName = clients.find((c) => c.id === targetClient)?.client_name || 'client';
      await logActivity({
        action: 'catalog_content_assigned',
        description: `Assigned ${items.length} track(s) (${totalRows} rows) → ${clientName}`,
        entity_type: 'ArtistMapping',
        metadata: { track_count: items.length, rows: totalRows, client: clientName, source }
      });
      setLastAction({ type: 'tracks', mappingIds: createdMappingIds, items, source, targetClient, period: selected });
      setMessage({ type: 'success', text: t('ca.assigned_tracks', { n: items.length, client: clientName }) });
      setSelectedIds(new Set());
      setResults([]);
      setImprints([]);
      setQuery('');
      reloadMappings();
    } catch (e) {
      setMessage({ type: 'error', text: e?.message || 'Assignment failed' });
    } finally {
      setAssigning(false);
    }
  };

  const undoLastAction = async () => {
    if (!lastAction) return;
    setAssigning(true);
    setMessage(null);
    try {
      if (lastAction.type === 'tracks') {
        for (const id of lastAction.mappingIds) {
          await base44.entities.ArtistMapping.delete(id);
        }
        for (const item of lastAction.items) {
          const filter = item.isrc ? { isrc: item.isrc } : { track_title: item.track_title };
          filter.client_account_id = lastAction.targetClient;
          if (lastAction.period !== 'all') filter.report_month = lastAction.period;
          await base44.entities.RevenueRow.updateMany(filter, buildRevertUpdate(lastAction.source));
        }
      } else if (lastAction.type === 'imprint') {
        if (lastAction.labelMappingExisted) {
          const revert = lastAction.source === 'house'
            ? { is_house: true, client_account_id: null }
            : { is_house: false, client_account_id: lastAction.source };
          await base44.entities.LabelMapping.update(lastAction.labelMappingId, revert);
        } else {
          await base44.entities.LabelMapping.delete(lastAction.labelMappingId);
        }
        const filter = { label_imprint: lastAction.imprintKey, client_account_id: lastAction.targetClient };
        if (lastAction.period !== 'all') filter.report_month = lastAction.period;
        await base44.entities.RevenueRow.updateMany(filter, buildRevertUpdate(lastAction.source));
      }
      await logActivity({
        action: 'catalog_assignment_undone',
        description: `Undid last ${lastAction.type === 'tracks' ? 'track' : 'imprint'} assignment`,
        entity_type: lastAction.type === 'tracks' ? 'ArtistMapping' : 'LabelMapping'
      });
      setLastAction(null);
      setMessage({ type: 'success', text: t('ca.undone') });
      reloadMappings();
    } catch (e) {
      setMessage({ type: 'error', text: e?.message || 'Undo failed' });
    } finally {
      setAssigning(false);
    }
  };

  const reassignImprint = async (imprint) => {
    if (!targetClient) {
      setMessage({ type: 'error', text: t('ca.select_client_first') });
      return;
    }
    setAssigning(true);
    setMessage(null);
    try {
      const existing = await base44.entities.LabelMapping.filter({ raw_imprint: imprint.key });
      let labelMappingId = null;
      const labelMappingExisted = existing.length > 0;
      if (labelMappingExisted) {
        labelMappingId = existing[0].id;
        await base44.entities.LabelMapping.update(labelMappingId, {
          is_house: false,
          client_account_id: targetClient
        });
      } else {
        const created = await base44.entities.LabelMapping.create({
          raw_imprint: imprint.key,
          is_house: false,
          client_account_id: targetClient,
          party_id: isPA ? partyId : undefined
        });
        labelMappingId = created?.id || null;
      }
      const filter = { label_imprint: imprint.key };
      if (source === 'house') filter.is_house_label = true;
      else if (source !== 'all') filter.client_account_id = source;
      if (selected !== 'all') filter.report_month = selected;
      await base44.entities.RevenueRow.updateMany(filter, {
        $set: { is_house_label: false, client_account_id: targetClient }
      });
      const clientName = clients.find((c) => c.id === targetClient)?.client_name || 'client';
      await logActivity({
        action: 'catalog_imprint_assigned',
        description: `Reassigned imprint "${imprint.key}" (${imprint.rows} rows) → ${clientName}`,
        entity_type: 'LabelMapping',
        metadata: { imprint: imprint.key, rows: imprint.rows, client: clientName }
      });
      setLastAction({ type: 'imprint', imprintKey: imprint.key, labelMappingId, labelMappingExisted, source, targetClient, period: selected });
      setMessage({ type: 'success', text: t('ca.assigned_imprint', { imprint: imprint.key, client: clientName }) });
      setImprints((prev) => prev.filter((i) => i.key !== imprint.key));
    } catch (e) {
      setMessage({ type: 'error', text: e?.message || 'Reassignment failed' });
    } finally {
      setAssigning(false);
    }
  };

  const saveEdit = async (id, form) => {
    setSavingEdit(true);
    try {
      await base44.entities.ArtistMapping.update(id, form);
      await logActivity({
        action: 'artist_mapping_updated',
        description: `Updated mapping for "${form.match_value}"`,
        entity_type: 'ArtistMapping',
        entity_id: id
      });
      reloadMappings();
    } finally {
      setSavingEdit(false);
    }
  };

  const deleteMapping = async (m) => {
    if (!confirm(t('ca.delete_confirm', { name: m.match_value }))) return;
    await base44.entities.ArtistMapping.delete(m.id);
    await logActivity({
      action: 'artist_mapping_deleted',
      description: `Deleted mapping for "${m.match_value}"`,
      entity_type: 'ArtistMapping',
      entity_id: m.id
    });
    reloadMappings();
  };

  return (
    <div>
      <PageHeader title={t('ca.title')} subtitle={t('ca.subtitle', { period: formatMonthLabel(selected) })}>
        <RecentSearches jobs={recentJobs} onLoadJob={loadCachedResults} t={t} />
      </PageHeader>
      <PeriodFilterBar />

      <Card className="mb-6">
        <CatalogSourceBar
          source={source} setSource={setSource}
          clients={clients}
          query={query} setQuery={setQuery}
          searching={searching} onSearch={doSearch} t={t}
          scopeParty={isPA}
        />
        <CatalogAssignBar
          clients={assignableClients}
          targetClient={targetClient} setTargetClient={setTargetClient}
          sharePct={sharePct} setSharePct={setSharePct}
          overrideLabel={overrideLabel} setOverrideLabel={setOverrideLabel}
          selectedCount={selectedIds.size}
          assigning={assigning} onAssign={assignTracks}
          message={message} t={t}
          canUndo={!!lastAction} onUndo={undoLastAction}
        />
      </Card>

      {searching && scanProgress && (
        <div className="mb-4 text-sm text-muted-foreground flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
          Scanning… {scanProgress.scanned.toLocaleString()} rows · {scanProgress.tracks} tracks · {scanProgress.imprints} imprints
        </div>
      )}

      <CatalogImprints
        imprints={imprints} reassigning={assigning}
        onReassign={reassignImprint} t={t}
      />

      <CatalogTracks
        results={results}
        selectedIds={selectedIds}
        onToggle={toggleSelect} onToggleAll={toggleAll}
        t={t}
      />

      {!searching && results.length === 0 && imprints.length === 0 && query && (
        <Card className="p-8 text-center text-muted-foreground mb-6">{t('ca.no_results')}</Card>
      )}
      {!searching && !query && (
        <Card className="p-8 text-center mb-6">
          <Search className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">{t('ca.search_hint')}</p>
        </Card>
      )}

      <MappingTable
        mappings={mappings} clients={clients}
        loading={mappingsLoading} saving={savingEdit}
        onSaveEdit={saveEdit} onDelete={deleteMapping} t={t}
      />
    </div>
  );
}