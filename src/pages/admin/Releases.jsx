import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { isSuperAdmin } from '@/lib/roles';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '@/lib/i18n';
import { base44 } from '@/api/base44Client';
import PageHeader from '@/components/PageHeader';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { logActivity } from '@/lib/activityLog';
import StreamingLinksEditor, { emptyLinks, parseLinks, hasAnyLinks } from '@/components/release/StreamingLinksEditor';
import ArtistProfiles from '@/components/release/ArtistProfiles';
import { CheckCircle2, XCircle, Clock, Search, Eye, Loader2, Link2, Trash2 } from 'lucide-react';

const STATUS_CONFIG = {
  draft: { label: 'Draft', icon: Clock, color: 'text-slate-600', bg: 'bg-slate-100', badge: 'outline' },
  pending_review: { label: 'Pending Review', icon: Clock, color: 'text-amber-600', bg: 'bg-amber-100', badge: 'secondary' },
  approved: { label: 'Approved', icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-100', badge: 'default' },
  rejected: { label: 'Action Needed', icon: XCircle, color: 'text-red-600', bg: 'bg-red-100', badge: 'destructive' }
};

export default function Releases() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [releases, setReleases] = useState([]);
  const [clients, setClients] = useState([]);
  const [subLabels, setSubLabels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [clientFilter, setClientFilter] = useState('all');
  const [subLabelFilter, setSubLabelFilter] = useState('all');
  const [reviewing, setReviewing] = useState(null);
  const [remarks, setRemarks] = useState('');
  const [editUpc, setEditUpc] = useState('');
  const [editTracks, setEditTracks] = useState([]);
  const [editLinks, setEditLinks] = useState(emptyLinks());
  const [actionLoading, setActionLoading] = useState(false);
  const [savingLinks, setSavingLinks] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  useEffect(() => {
    if (!isSuperAdmin(user)) {
      navigate('/dashboard');
      return;
    }
    loadData();
  }, [user]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [rels, cls, sls] = await Promise.all([
        base44.entities.Release.list('-created_date', 500),
        base44.entities.ClientAccount.list('-created_date', 500),
        base44.entities.SubLabel.list('-created_date', 500)
      ]);
      setReleases(rels);
      setClients(cls.filter((c) => !c.is_house_account));
      setSubLabels(sls);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  const filtered = releases.filter((r) => {
    if (r.status === 'draft') return false;
    if (statusFilter !== 'all' && r.status !== statusFilter) return false;
    if (clientFilter !== 'all' && r.client_account_id !== clientFilter) return false;
    if (subLabelFilter !== 'all' && r.sub_label_id !== subLabelFilter) return false;
    if (query) {
      const q = query.toLowerCase();
      return (r.release_title || '').toLowerCase().includes(q) || (r.artist_name || '').toLowerCase().includes(q) || (r.client_name || '').toLowerCase().includes(q);
    }
    return true;
  });

  const parseTracksSafe = (t) => {
    if (Array.isArray(t)) return t;
    if (typeof t === 'string') {
      try { return JSON.parse(t); } catch { return []; }
    }
    return [];
  };

  const openReview = (release) => {
    setReviewing(release);
    setRemarks(release.admin_remarks || '');
    setEditUpc(release.upc_ean || '');
    setEditTracks(parseTracksSafe(release.tracks));
    setEditLinks({ ...emptyLinks(), ...parseLinks(release.streaming_links) });
  };

  const handleSaveLinks = async () => {
    setSavingLinks(true);
    try {
      await base44.entities.Release.update(reviewing.id, {
        streaming_links: JSON.stringify(editLinks)
      });
      await logActivity({
        action: 'release_links_updated',
        description: `Streaming links updated for "${reviewing.release_title}" by ${reviewing.artist_name}`,
        entity_type: 'Release',
        entity_id: reviewing.id
      });
      setReviewing(null);
      loadData();
    } catch (err) {
      alert('Failed to save links: ' + (err.message || 'Unknown error'));
    } finally {
      setSavingLinks(false);
    }
  };

  const handleAction = async (action) => {
    setActionLoading(true);
    try {
      const newStatus = action === 'approve' ? 'approved' : 'rejected';
      const updateData = {
        status: newStatus,
        admin_remarks: action === 'approve' ? '' : remarks
      };
      if (action === 'approve') {
        if (editUpc.trim()) updateData.upc_ean = editUpc.trim();
        updateData.streaming_links = JSON.stringify(editLinks);
        updateData.artwork_url = '';
        updateData.tracks = JSON.stringify(editTracks.map((t) => ({ ...t, audio_url: '', audio_filename: '' })));
      }
      await base44.entities.Release.update(reviewing.id, updateData);
      await logActivity({
        action: action === 'approve' ? 'release_approved' : 'release_rejected',
        description: `Release "${reviewing.release_title}" by ${reviewing.artist_name} ${action === 'approve' ? 'approved' : 'rejected'}${remarks ? ` — ${remarks}` : ''}`,
        entity_type: 'Release',
        entity_id: reviewing.id
      });

      setReviewing(null);
      setRemarks('');
      loadData();
    } catch (err) {
      alert('Failed to update: ' + (err.message || 'Unknown error'));
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setDeleteLoading(true);
    try {
      await base44.entities.Release.delete(deleting.id);
      await logActivity({
        action: 'release_deleted',
        description: `Release "${deleting.release_title}" by ${deleting.artist_name} deleted`,
        entity_type: 'Release',
        entity_id: deleting.id
      });
      setDeleting(null);
      loadData();
    } catch (err) {
      alert('Failed to delete release: ' + (err.message || 'Unknown error'));
    } finally {
      setDeleteLoading(false);
    }
  };

  const StatusIcon = ({ status }) => {
    const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending_review;
    const Icon = cfg.icon;
    return (
      <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${cfg.bg} ${cfg.color}`}>
        <Icon className="w-3.5 h-3.5" />
        {cfg.label}
      </div>
    );
  };

  return (
    <div>
      <PageHeader title="Releases Management" subtitle="Review and approve client release submissions" />

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative w-full sm:w-56">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <Input placeholder="Search title, artist, client..." value={query} onChange={(e) => setQuery(e.target.value)} className="pl-9" />
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            <SelectItem value="pending_review">Pending Review</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Action Needed</SelectItem>
          </SelectContent>
        </Select>
        <Select value={clientFilter} onValueChange={setClientFilter}>
          <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Clients</SelectItem>
            {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.client_name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={subLabelFilter} onValueChange={setSubLabelFilter}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sub-Labels</SelectItem>
            {subLabels.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Release</TableHead>
              <TableHead>Artist</TableHead>
              <TableHead>Client / Sub-Label</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>UPC/EAN</TableHead>
              <TableHead>ISRC</TableHead>
              <TableHead>Links</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Submitted</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={10} className="text-center text-slate-400 py-8">No releases found.</TableCell>
              </TableRow>
            )}
            {filtered.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">
                  <div className="flex items-center gap-2">
                    {r.artwork_url && <img src={r.artwork_url} alt="" className="w-8 h-8 rounded object-cover" />}
                    <span>{r.release_title}</span>
                  </div>
                </TableCell>
                <TableCell className="text-slate-500">{r.artist_name}</TableCell>
                <TableCell>
                  <div className="text-sm">{r.client_name || '—'}</div>
                  {r.sub_label_name && <div className="text-xs text-slate-400">{r.sub_label_name}</div>}
                </TableCell>
                <TableCell><Badge variant="outline" className="uppercase text-xs">{r.release_type}</Badge></TableCell>
                <TableCell className="text-sm">
                  {r.upc_ean ? <span className="font-mono text-xs">{r.upc_ean}</span> : <Badge variant="secondary" className="text-xs bg-amber-100 text-amber-700">Needs Assignment</Badge>}
                </TableCell>
                <TableCell className="text-sm">
                  {(() => {
                    const trs = parseTracksSafe(r.tracks);
                    const withIsrc = trs.filter((tr) => tr.isrc).length;
                    if (trs.length === 0) return <span className="text-slate-400">—</span>;
                    const allAssigned = withIsrc === trs.length;
                    return <Badge variant="outline" className={`text-xs ${allAssigned ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>{withIsrc}/{trs.length}</Badge>;
                  })()}
                </TableCell>
                <TableCell>
                  {hasAnyLinks(parseLinks(r.streaming_links))
                    ? <Badge variant="outline" className="text-xs bg-emerald-50 text-emerald-700"><Link2 className="w-3 h-3 mr-1" /> Live</Badge>
                    : <Badge variant="secondary" className="text-xs bg-amber-100 text-amber-700">Pending</Badge>}
                </TableCell>
                <TableCell><StatusIcon status={r.status} /></TableCell>
                <TableCell className="text-slate-400 text-sm">{new Date(r.created_date).toLocaleDateString()}</TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <Button size="sm" variant="outline" onClick={() => openReview(r)}>
                      <Eye className="w-3.5 h-3.5" /> Review
                    </Button>
                    <Button size="sm" variant="destructive" onClick={() => setDeleting(r)}>
                      <Trash2 className="w-3.5 h-3.5" /> Delete
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>

      {/* Review Dialog */}
      <Dialog open={!!reviewing} onOpenChange={(v) => !v && setReviewing(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          {reviewing && (
            <>
              <DialogHeader>
                <DialogTitle>Review Release: {reviewing.release_title}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                {reviewing.artwork_url && (
                  <img src={reviewing.artwork_url} alt="Artwork" className="w-40 h-40 rounded-lg object-cover border mx-auto" />
                )}
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="text-slate-500">Artist:</span> {reviewing.artist_name}</div>
                  <div><span className="text-slate-500">Type:</span> <span className="uppercase">{reviewing.release_type}</span></div>
                  <div><span className="text-slate-500">Genre:</span> {reviewing.primary_genre || '—'}</div>
                  <div><span className="text-slate-500">Language:</span> {reviewing.language || '—'}</div>
                  <div><span className="text-slate-500">Release Date:</span> {reviewing.release_date || '—'}</div>
                  <div>
                    <span className="text-slate-500">UPC/EAN:</span>
                    <Input value={editUpc} onChange={(e) => setEditUpc(e.target.value)} className="h-8 text-sm font-mono mt-1" placeholder="Assign UPC/EAN barcode" />
                  </div>
                  <div><span className="text-slate-500">P-Line:</span> {reviewing.p_line || '—'}</div>
                  <div><span className="text-slate-500">C-Line:</span> {reviewing.c_line || '—'}</div>
                  <div><span className="text-slate-500">Client:</span> {reviewing.client_name || '—'}</div>
                  <div><span className="text-slate-500">Sub-Label:</span> {reviewing.sub_label_name || 'Main Label'}</div>
                  <div><span className="text-slate-500">Submitted by:</span> {reviewing.submitted_by_name || '—'}</div>
                  <div><span className="text-slate-500">Submitted on:</span> {new Date(reviewing.created_date).toLocaleString()}</div>
                </div>

                {reviewing.artwork_url && (
                  <div>
                    <Label className="text-sm font-semibold">Artwork</Label>
                    <a href={reviewing.artwork_url} target="_blank" rel="noreferrer" className="text-indigo-600 text-sm hover:underline block mt-1">Download Artwork File</a>
                  </div>
                )}

                <div>
                  <Label className="text-sm font-semibold">Primary Artist Profiles</Label>
                  <p className="text-xs text-slate-400 mb-2">Spotify, Facebook and Instagram profiles as submitted by the client.</p>
                  <ArtistProfiles tracks={editTracks} />
                </div>

                <div>
                  <Label className="text-sm font-semibold">Tracks</Label>
                  <div className="mt-2 space-y-2">
                    {editTracks.map((tr, i) => (
                      <div key={i} className="rounded-lg border p-3 text-sm space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{i + 1}. {tr.title}</span>
                          {tr.explicit && <Badge variant="destructive" className="text-xs">Explicit</Badge>}
                        </div>
                        <div className="text-xs text-slate-500 space-y-1.5">
                          <div className="flex items-center gap-2">
                            <span className="whitespace-nowrap">ISRC:</span>
                            <Input value={tr.isrc || ''} onChange={(e) => setEditTracks(prev => prev.map((t, ti) => ti === i ? { ...t, isrc: e.target.value } : t))} className="h-7 text-xs font-mono w-52" placeholder="Assign ISRC" />
                          </div>
                          <div>
                            {tr.version && <span>Version: {tr.version} · </span>}
                            {tr.composers && <span>Composers: {tr.composers} · </span>}
                            {tr.lyricists && <span>Lyricists: {tr.lyricists}</span>}
                          </div>
                        </div>
                        {tr.audio_url && <a href={tr.audio_url} target="_blank" rel="noreferrer" className="text-indigo-600 text-xs hover:underline">Download Audio</a>}
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <Label className="text-sm font-semibold flex items-center gap-1.5"><Link2 className="w-4 h-4" /> Streaming Platform Links</Label>
                  <p className="text-xs text-slate-400 mb-2">Add live streaming links. Users see "Link Pending" until these are filled.</p>
                  <StreamingLinksEditor links={editLinks} onChange={setEditLinks} />
                </div>

                <div>
                  <Label className="text-sm font-semibold">Admin Remarks <span className="text-slate-400 font-normal">(optional)</span></Label>
                  <Textarea value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Only required when rejecting — e.g. Low-res artwork, please re-upload at 3000x3000px minimum" rows={3} />
                  <p className="text-xs text-slate-400">Leave blank when approving. Remarks are only sent to the client when an action is needed.</p>
                </div>
              </div>
              <DialogFooter className="gap-2">
                <Button variant="ghost" onClick={() => setReviewing(null)}>Close</Button>
                {reviewing.status === 'approved' && (
                  <Button variant="outline" onClick={handleSaveLinks} disabled={savingLinks}>
                    {savingLinks ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
                    Save Links
                  </Button>
                )}
                {reviewing.status !== 'approved' && (
                  <>
                    <Button variant="destructive" onClick={() => handleAction('reject')} disabled={actionLoading || !remarks.trim()}>
                      {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                      Reject / Action Needed
                    </Button>
                    <Button onClick={() => handleAction('approve')} disabled={actionLoading} className="bg-emerald-600 hover:bg-emerald-700">
                      {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                      Approve
                    </Button>
                  </>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleting} onOpenChange={(v) => !v && setDeleting(null)}>
        <DialogContent className="max-w-md">
          {deleting && (
            <>
              <DialogHeader>
                <DialogTitle>Delete Release</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <p className="text-sm text-slate-600">
                  Are you sure you want to delete <span className="font-semibold">{deleting.release_title}</span> by {deleting.artist_name}?
                </p>
                <p className="text-sm text-red-600">
                  This will permanently remove the release and all its associated data (artwork, tracks, streaming links). This action cannot be undone.
                </p>
              </div>
              <DialogFooter className="gap-2">
                <Button variant="ghost" onClick={() => setDeleting(null)} disabled={deleteLoading}>Cancel</Button>
                <Button variant="destructive" onClick={handleDelete} disabled={deleteLoading}>
                  {deleteLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  Delete Release
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}