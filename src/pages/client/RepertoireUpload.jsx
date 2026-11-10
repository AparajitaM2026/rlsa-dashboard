import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useActiveClient } from '@/lib/ClientContext';
import { useAuth } from '@/lib/AuthContext';
import { useLanguage } from '@/lib/i18n';
import { base44 } from '@/api/base44Client';
import PageHeader from '@/components/PageHeader';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import TrackRow from '@/components/release/TrackRow';
import RectificationBanner from '@/components/release/RectificationBanner';
import { uploadPublicFileWithProgress } from '@/lib/uploadWithProgress';
import { logActivity } from '@/lib/activityLog';
import { ArrowLeft, ArrowRight, Upload, Loader2, Plus, Check, Disc3, Layers, Album } from 'lucide-react';

const GENRES = ['Pop', 'Rock', 'Hip-Hop/Rap', 'R&B/Soul', 'Electronic', 'Dance', 'Jazz', 'Classical', 'Country', 'Latin', 'Reggae', 'Folk', 'Blues', 'World', 'Devotional/Spiritual', 'Film/Soundtrack', 'Alternative', 'Indie', 'Other'];
const LANGUAGES = ['English', 'Hindi', 'Arabic', 'French', 'Spanish', 'Portuguese', 'Punjabi', 'Tamil', 'Telugu', 'Bengali', 'Urdu', 'Turkish', 'Korean', 'Japanese', 'Mandarin', 'Other'];

const GENRE_SUBGENRES = {
  'Pop': ['Indie Pop', 'Synth Pop', 'Dance Pop', 'Electropop', 'K-Pop', 'J-Pop', 'Bedroom Pop', 'Hyperpop', 'Art Pop', 'Teen Pop', 'Power Pop'],
  'Rock': ['Indie Rock', 'Alternative Rock', 'Classic Rock', 'Hard Rock', 'Punk Rock', 'Progressive Rock', 'Garage Rock', 'Psychedelic Rock', 'Post-Rock', 'Grunge', 'Metal'],
  'Hip-Hop/Rap': ['Trap', 'Drill', 'Boom Bap', 'Lo-Fi Hip-Hop', 'Conscious Hip-Hop', 'Mumble Rap', 'Old School Hip-Hop', 'Phonk', 'Afrobeat Hip-Hop', 'Desi Hip-Hop'],
  'R&B/Soul': ['Neo-Soul', 'Alternative R&B', 'Contemporary R&B', 'Funk', 'Smooth Soul', 'Quiet Storm', 'New Jack Swing'],
  'Electronic': ['House', 'Techno', 'Trance', 'Dubstep', 'Drum & Bass', 'Ambient', 'IDM', 'Synthwave', 'Garage', 'Future Bass'],
  'Dance': ['EDM', 'Deep House', 'Tech House', 'Disco', 'Nu-Disco', 'Eurodance', 'Tropical House', 'Progressive House', 'Hard Dance'],
  'Jazz': ['Smooth Jazz', 'Bebop', 'Fusion', 'Swing', 'Free Jazz', 'Latin Jazz', 'Vocal Jazz', 'Soul Jazz', 'Cool Jazz'],
  'Classical': ['Orchestral', 'Chamber Music', 'Solo Instrumental', 'Choral', 'Opera', 'Contemporary Classical', 'Baroque', 'Romantic', 'Minimalism'],
  'Country': ['Modern Country', 'Classic Country', 'Country Pop', 'Outlaw Country', 'Bluegrass', 'Americana', 'Alt-Country', 'Honky Tonk'],
  'Latin': ['Reggaeton', 'Latin Pop', 'Salsa', 'Bachata', 'Merengue', 'Cumbia', 'Latin Trap', 'Bossanova', 'Samba', 'Ranchera'],
  'Reggae': ['Roots Reggae', 'Dub', 'Dancehall', 'Ska', 'Reggae Fusion', 'Lovers Rock', 'Ragga'],
  'Folk': ['Indie Folk', 'Folk Pop', 'Folk Rock', 'Traditional Folk', 'Anti-Folk', 'Psychedelic Folk', 'Celtic Folk'],
  'Blues': ['Delta Blues', 'Chicago Blues', 'Electric Blues', 'Acoustic Blues', 'Blues Rock', 'Soul Blues', 'Texas Blues'],
  'World': ['Afrobeat', 'Bollywood', 'Arabic Pop', 'Middle Eastern', 'African Traditional', 'Celtic', 'Flamenco', 'Fado', 'Bhangra'],
  'Devotional/Spiritual': ['Bhajan', 'Kirtan', 'Qawwali', 'Gospel', 'Sufi', 'Mantra', 'Chant', 'Inspirational'],
  'Film/Soundtrack': ['Original Score', 'Soundtrack', 'Background Music', 'Theme Song', 'Musical Theater', 'Trailer Music'],
  'Alternative': ['Indie Alternative', 'Shoegaze', 'Post-Punk', 'Gothic Rock', 'Dream Pop', 'Noise Pop', 'Math Rock'],
  'Indie': ['Indie Pop', 'Indie Rock', 'Indie Folk', 'Indie Electronic', 'Bedroom Pop', 'Lo-Fi Indie', 'Dream Pop', 'Chamber Pop'],
  'Other': ['N/A']
};

const TYPE_ICONS = { single: Disc3, ep: Layers, album: Album };

export default function RepertoireUpload() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const editId = searchParams.get('edit') || searchParams.get('id');

  const { clientAccount, loading, isPartyAdminView, partyAccounts, ownAccount } = useActiveClient();
  const { user } = useAuth();
  const { t } = useLanguage();

  const [step, setStep] = useState(1);
  const [loadingEdit, setLoadingEdit] = useState(!!editId);
  const [subLabels, setSubLabels] = useState([]);
  const [uploadAsId, setUploadAsId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [artworkUploading, setArtworkUploading] = useState(false);
  const [artworkProgress, setArtworkProgress] = useState(0);
  const [rectification, setRectification] = useState('');
  const [form, setForm] = useState({
    release_title: '', release_type: 'single', artist_name: '',
    primary_genre: '', sub_genre: '', language: '', release_date: '',
    p_line: '', c_line: '', upc_ean: '', upc_mode: '',
    sub_label_id: '', sub_label_name: '',
    artwork_url: '', artwork_filename: ''
  });
  const [tracks, setTracks] = useState([{ title: '', version: '', isrc: '', isrc_mode: '', explicit: false, artists: [{ name: '', spotify_mode: '', spotify_artist_url: '', artist_facebook: '', artist_instagram: '' }], composers: '', lyricists: '', audio_url: '', audio_filename: '' }]);

  useEffect(() => {
    if (!editId) return;
    setLoadingEdit(true);
    base44.entities.Release.get(editId)
      .then((rel) => {
        if (!rel) return;
        setForm({
          release_title: rel.release_title || '',
          release_type: rel.release_type || 'single',
          artist_name: rel.artist_name || '',
          primary_genre: rel.primary_genre || rel.genre || '',
          sub_genre: rel.sub_genre || '',
          language: rel.language || '',
          release_date: rel.release_date || '',
          p_line: rel.p_line || '',
          c_line: rel.c_line || '',
          upc_ean: rel.upc_ean || '',
          upc_mode: rel.upc_ean ? 'have' : 'none',
          sub_label_id: rel.sub_label_id || '',
          sub_label_name: rel.sub_label_name || '',
          artwork_url: rel.artwork_url || '',
          artwork_filename: rel.artwork_filename || ''
        });

        let rawTracks = rel.tracks;
        if (typeof rawTracks === 'string') {
          try { rawTracks = JSON.parse(rawTracks); } catch { rawTracks = []; }
        }
        if (Array.isArray(rawTracks) && rawTracks.length > 0) {
          setTracks(rawTracks.map(t => ({
            title: t.title || '',
            version: t.version || '',
            isrc: t.isrc || '',
            isrc_mode: t.isrc ? 'have' : (t.isrc_mode || 'none'),
            explicit: !!t.explicit,
            artists: Array.isArray(t.artists) && t.artists.length > 0
              ? t.artists
              : [{ name: '', spotify_mode: '', spotify_artist_url: '', artist_facebook: '', artist_instagram: '' }],
            composers: t.composers || '',
            lyricists: t.lyricists || '',
            audio_url: t.audio_url || '',
            audio_filename: t.audio_filename || ''
          })));
        }

        if (rel.client_account_id) {
          setUploadAsId(rel.client_account_id);
        }
        setRectification(rel.admin_remarks || '');
      })
      .catch((err) => {
        console.error('Failed to load release for editing:', err);
      })
      .finally(() => {
        setLoadingEdit(false);
      });
  }, [editId]);

  useEffect(() => {
    if (clientAccount?.id) {
      base44.entities.SubLabel.filter({ client_account_id: clientAccount.id, status: 'active' }).then(setSubLabels).catch(() => {});
    }
  }, [clientAccount?.id]);

  useEffect(() => {
    if (isPartyAdminView && !uploadAsId) {
      setUploadAsId(ownAccount?.id || partyAccounts.find((a) => a.id !== ownAccount?.id)?.id || '');
    }
  }, [isPartyAdminView, partyAccounts, ownAccount]);

  if (loading || loadingEdit) {
    return (
      <div className="flex flex-col items-center justify-center py-20 space-y-3">
        <div className="w-8 h-8 border-4 border-primary/50 border-t-indigo-600 rounded-full animate-spin" />
        {loadingEdit && <p className="text-sm text-muted-foreground">Loading release details...</p>}
      </div>
    );
  }

  if (!clientAccount) {
    return <Card className="p-8 text-center text-muted-foreground">{t('common.no_account')}</Card>;
  }

  const updateForm = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));
  const updateTrack = (index, track) => setTracks(tracks.map((tr, i) => (i === index ? track : tr)));
  const removeTrack = (index) => setTracks(tracks.filter((_, i) => i !== index));
  const addTrack = () => setTracks([...tracks, { title: '', version: '', isrc: '', isrc_mode: '', explicit: false, artists: [{ name: '', spotify_mode: '', spotify_artist_url: '', artist_facebook: '', artist_instagram: '' }], composers: '', lyricists: '', audio_url: '', audio_filename: '' }]);

  const handleArtworkUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setArtworkUploading(true);
    setArtworkProgress(0);
    try {
      const res = await uploadPublicFileWithProgress(file, setArtworkProgress);
      updateForm('artwork_url', res.file_url);
      updateForm('artwork_filename', file.name);
    } catch (err) {
      alert('Artwork upload failed: ' + (err.message || 'Unknown error'));
    } finally {
      setArtworkUploading(false);
      setArtworkProgress(0);
    }
  };

  const canNext1 = form.release_title && form.artist_name && form.release_date;
  const canNext2 = tracks.length > 0 && tracks.every((tr) => tr.title && (tr.artists || []).every((a) => a.name));
  const canSubmit = canNext1 && canNext2 && form.artwork_url && tracks.every((tr) => tr.audio_url) && (!isPartyAdminView || !!uploadAsId);

  
  const handleSaveDraft = async () => {
    if (!form.release_title.trim()) {
      alert('Please enter at least a Release Title to save as draft.');
      return;
    }
    setSavingDraft(true);
    try {
      const subLabel = subLabels.find((s) => s.id === form.sub_label_id);
      const targetAccount = isPartyAdminView
        ? partyAccounts.find((a) => a.id === uploadAsId) || ownAccount || partyAccounts[0]
        : clientAccount;
      if (!targetAccount) {
        alert('Please select an account to save under.');
        setSavingDraft(false);
        return;
      }
      const payload = {
        release_id: editId || undefined,
        ...form,
        sub_label_id: isPartyAdminView ? '' : form.sub_label_id,
        sub_label_name: isPartyAdminView ? '' : (subLabel?.name || ''),
        client_account_id: targetAccount.id,
        client_name: targetAccount.client_name,
        tracks,
        is_draft: true
      };
      const res = await base44.functions.invoke('submitRelease', payload);
      if (res.data?.ok) {
        await logActivity({
          action: 'release_draft_saved',
          description: `Release "${form.release_title}" saved as draft`,
          entity_type: 'Release',
          entity_id: res.data.release?.id || editId || ''
        });
        alert('Release saved as draft! You can view it under My Releases in Repertoire.');
        navigate('/repertoire');
      } else {
        alert('Failed to save draft: ' + (res.data?.error || 'Unknown error'));
      }
    } catch (err) {
      alert('Failed to save draft: ' + (err.message || 'Unknown error'));
    } finally {
      setSavingDraft(false);
    }
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const subLabel = subLabels.find((s) => s.id === form.sub_label_id);
      const targetAccount = isPartyAdminView
        ? partyAccounts.find((a) => a.id === uploadAsId)
        : clientAccount;
      if (!targetAccount) { alert('Please select an account to upload under.'); setSubmitting(false); return; }
      const payload = {
        release_id: editId || undefined,
        ...form,
        sub_label_id: isPartyAdminView ? '' : form.sub_label_id,
        sub_label_name: isPartyAdminView ? '' : (subLabel?.name || ''),
        client_account_id: targetAccount.id,
        client_name: targetAccount.client_name,
        tracks
      };
      const res = await base44.functions.invoke('submitRelease', payload);
      if (res.data?.ok) {
        await logActivity({
          action: 'release_submitted',
          description: `Release "${form.release_title}" by ${form.artist_name} submitted for review`,
          entity_type: 'Release',
          entity_id: res.data.release?.id || editId || ''
        });
        alert('Release submitted successfully! You will be notified once it is reviewed.');
        navigate('/repertoire');
      } else {
        alert('Submission failed: ' + (res.data?.error || 'Unknown error'));
      }
    } catch (err) {
      alert('Submission failed: ' + (err.message || 'Unknown error'));
    } finally {
      setSubmitting(false);
    }
  };

  const steps = ['Release Info', 'Track Details', 'Assets & Submit'];

  return (
    <div>
      <PageHeader
        title={editId ? `Edit Release: ${form.release_title || 'Draft'}` : "Upload New Release"}
        subtitle={editId ? "Update your release information, tracks, or assets" : "Submit a new release for admin review and DSP delivery"}
      />

      {editId && (
        <div className="flex items-center justify-between p-3.5 mb-6 bg-card/80 border border-border/80 rounded-xl">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-primary font-semibold bg-indigo-100 px-2 py-0.5 rounded">
              Editing Draft / Release
            </span>
            <span className="text-sm font-medium text-foreground font-semibold">
              {form.release_title || 'Untitled Release'}
            </span>
          </div>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => navigate('/client/repertoire/upload')}
            className="text-xs text-foreground font-medium hover:text-slate-900 h-7"
          >
            Cancel & Upload New
          </Button>
        </div>
      )}

      <RectificationBanner notice={rectification} />

      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-6">
        {steps.map((label, i) => {
          const stepNum = i + 1;
          const isActive = step === stepNum;
          const isDone = step > stepNum;
          return (
            <div key={i} className="flex items-center gap-2">
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${isActive ? 'bg-indigo-600 text-white' : isDone ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-muted-foreground'}`}>
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-xs ${isActive ? 'bg-white/20' : isDone ? 'bg-emerald-500 text-white' : 'bg-slate-200'}`}>
                  {isDone ? <Check className="w-3 h-3" /> : stepNum}
                </span>
                {label}
              </div>
              {i < steps.length - 1 && <div className="w-8 h-px bg-border" />}
            </div>
          );
        })}
      </div>

      {/* Step 1: Release Info */}
      {step === 1 && (
        <Card className="p-6 space-y-5">
          <div>
            <Label className="text-sm font-semibold mb-2 block">Release Type</Label>
            <div className="grid grid-cols-3 gap-3">
              {['single', 'ep', 'album'].map((type) => {
                const Icon = TYPE_ICONS[type];
                const isActive = form.release_type === type;
                return (
                  <button key={type} onClick={() => updateForm('release_type', type)} className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition ${isActive ? 'border-primary bg-primary/15' : 'border-border bg-card/60 hover:border-primary/40'}`}>
                    <Icon className={`w-7 h-7 ${isActive ? 'text-primary' : 'text-slate-400'}`} />
                    <span className={`text-sm font-medium capitalize ${isActive ? 'text-primary font-semibold' : 'text-foreground font-medium'}`}>{type}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Release Title *</Label>
              <Input value={form.release_title} onChange={(e) => updateForm('release_title', e.target.value)} placeholder="Enter release title" />
            </div>
            <div>
              <Label>Artist Name(s) *</Label>
              <Input value={form.artist_name} onChange={(e) => updateForm('artist_name', e.target.value)} placeholder="Primary artist" />
            </div>
            <div>
              <Label>Primary Genre</Label>
              <Select value={form.primary_genre} onValueChange={(v) => { updateForm('primary_genre', v); updateForm('sub_genre', ''); }}>
                <SelectTrigger><SelectValue placeholder="Select genre" /></SelectTrigger>
                <SelectContent>{GENRES.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Sub-Genre</Label>
              <Select value={form.sub_genre} onValueChange={(v) => updateForm('sub_genre', v)} disabled={!form.primary_genre}>
                <SelectTrigger><SelectValue placeholder={form.primary_genre ? "Select sub-genre" : "Select genre first"} /></SelectTrigger>
                <SelectContent>
                  {(GENRE_SUBGENRES[form.primary_genre] || []).map((sg) => <SelectItem key={sg} value={sg}>{sg}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Language</Label>
              <Select value={form.language} onValueChange={(v) => updateForm('language', v)}>
                <SelectTrigger><SelectValue placeholder="Select language" /></SelectTrigger>
                <SelectContent>{LANGUAGES.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>Release Date *</Label>
              <Input type="date" value={form.release_date} onChange={(e) => updateForm('release_date', e.target.value)} />
            </div>
            <div>
              <Label>P-Line</Label>
              <Input value={form.p_line} onChange={(e) => updateForm('p_line', e.target.value)} placeholder="℗ 2026 Label Name" />
            </div>
            <div>
              <Label>C-Line</Label>
              <Input value={form.c_line} onChange={(e) => updateForm('c_line', e.target.value)} placeholder="© 2026 Label Name" />
            </div>
            <div>
              <Label>UPC/EAN</Label>
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => updateForm('upc_mode', 'own')}
                    className={`px-3 py-2 rounded-lg border-2 text-sm font-medium transition text-left ${form.upc_mode === 'own' ? 'border-primary bg-primary/15 text-primary font-semibold' : 'border-border bg-card/60 hover:border-primary/40 text-muted-foreground'}`}
                  >
                    I have My Own UPC/EAN
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, upc_mode: 'none', upc_ean: '' })}
                    className={`px-3 py-2 rounded-lg border-2 text-sm font-medium transition text-left ${form.upc_mode === 'none' ? 'border-primary bg-primary/15 text-primary font-semibold' : 'border-border bg-card/60 hover:border-primary/40 text-muted-foreground'}`}
                  >
                    I don't have a UPC
                  </button>
                </div>
                {form.upc_mode === 'own' && (
                  <Input value={form.upc_ean} onChange={(e) => updateForm('upc_ean', e.target.value)} placeholder="Enter your UPC/EAN" className="font-mono" />
                )}
                {form.upc_mode === 'none' && (
                  <p className="text-xs text-muted-foreground italic">Mayra Music will create a UPC on your behalf and update it once the release is live.</p>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleSaveDraft}
              disabled={savingDraft || submitting || !form.release_title.trim()}
            >
              {savingDraft ? <><Loader2 className="w-4 h-4 animate-spin mr-1" /> Saving Draft...</> : 'Save as Draft'}
            </Button>
            <Button onClick={() => setStep(2)} disabled={!canNext1}>
              Next: Track Details <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </Card>
      )}

      {/* Step 2: Track Details */}
      {step === 2 && (
        <Card className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Add track-level details and upload audio files. Number of tracks should match your release type (Single: 1, EP: 2-6, Album: 7+).</p>
          </div>
          {tracks.map((track, i) => (
            <TrackRow key={i} index={i} track={track} onChange={updateTrack} onRemove={removeTrack} />
          ))}
          <Button variant="outline" onClick={addTrack} className="w-full border-dashed">
            <Plus className="w-4 h-4" /> Add Track
          </Button>
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <Button variant="ghost" onClick={() => setStep(1)}><ArrowLeft className="w-4 h-4 mr-1" /> Back</Button>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleSaveDraft}
                disabled={savingDraft || submitting || !form.release_title.trim()}
              >
                {savingDraft ? <><Loader2 className="w-4 h-4 animate-spin mr-1" /> Saving Draft...</> : 'Save as Draft'}
              </Button>
              <Button onClick={() => setStep(3)} disabled={!canNext2}>
                Next: Assets <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Step 3: Assets & Submit */}
      {step === 3 && (
        <Card className="p-6 space-y-5">
          <div>
            <Label className="text-sm font-semibold mb-2 block">Artwork File (JPG/PNG, min 3000×3000px)</Label>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2 px-4 py-2 rounded-lg border-2 border-dashed border-border/80 cursor-pointer bg-card/40 hover:bg-card/70 text-foreground text-sm font-medium transition">
                {artworkUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                <span>{form.artwork_url ? 'Replace Artwork' : 'Upload Artwork'}</span>
                <input type="file" accept=".jpg,.jpeg,.png" className="hidden" onChange={handleArtworkUpload} disabled={artworkUploading} />
              </label>
              {form.artwork_filename && !artworkUploading && <span className="text-xs text-muted-foreground">{form.artwork_filename}</span>}
            </div>
            {artworkUploading && (
              <div className="flex items-center gap-2 mt-2">
                <div className="flex-1 h-2 bg-slate-200 rounded-full overflow-hidden max-w-xs">
                  <div className="h-full bg-indigo-600 rounded-full transition-all duration-200" style={{ width: `${artworkProgress}%` }} />
                </div>
                <span className="text-xs text-muted-foreground tabular-nums">{artworkProgress}%</span>
              </div>
            )}
            {form.artwork_url && <img src={form.artwork_url} alt="Artwork preview" className="mt-3 w-32 h-32 rounded-lg object-cover border" />}
          </div>

          {isPartyAdminView ? (
            <div>
              <Label className="text-sm font-semibold mb-2 block">Upload As</Label>
              <Select value={uploadAsId} onValueChange={setUploadAsId}>
                <SelectTrigger><SelectValue placeholder="Select account" /></SelectTrigger>
                <SelectContent>
                  {ownAccount && <SelectItem value={ownAccount.id}>Main Label (Self) — {ownAccount.client_name}</SelectItem>}
                  {partyAccounts.filter((a) => a.id !== ownAccount?.id).map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.client_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-400 mt-1">Upload under your main label or any sub-label account you manage.</p>
            </div>
          ) : (
            <div>
              <Label className="text-sm font-semibold mb-2 block">Sub-Label</Label>
              <Select value={form.sub_label_id} onValueChange={(v) => updateForm('sub_label_id', v)}>
                <SelectTrigger><SelectValue placeholder="Main Label (default)" /></SelectTrigger>
                <SelectContent>
                  {subLabels.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-xs text-slate-400 mt-1">Select a sub-label if applicable, or leave as Main Label.</p>
            </div>
          )}

          {/* Review summary */}
          <div className="rounded-xl bg-card/60 border border-border/80 p-5 space-y-2 text-sm">
            <p className="font-semibold text-foreground mb-2 text-base">Review Summary</p>
            <p><span className="text-muted-foreground">Title:</span> {form.release_title}</p>
            <p><span className="text-muted-foreground">Type:</span> <span className="uppercase">{form.release_type}</span></p>
            <p><span className="text-muted-foreground">Artist:</span> {form.artist_name}</p>
            <p><span className="text-muted-foreground">Genre:</span> {form.primary_genre || '—'} {form.sub_genre ? `/ ${form.sub_genre}` : ''}</p>
            <p><span className="text-muted-foreground">Release Date:</span> {form.release_date || '—'}</p>
            <p><span className="text-muted-foreground">Tracks:</span> {tracks.length}</p>
            {tracks.map((tr, i) => (
              <div key={i} className={tracks.length > 1 ? 'mt-1 pl-2 border-l-2 border-primary/50' : ''}>
                {tracks.length > 1 && <p className="font-medium text-foreground font-medium">{tr.title}</p>}
                <p><span className="text-muted-foreground">Primary Artist(s):</span> {(tr.artists || []).map((a) => a.name).filter(Boolean).join(', ') || '—'}</p>
                <p><span className="text-muted-foreground">Spotify:</span> {(tr.artists || []).filter((a) => a.spotify_artist_url).length}/{(tr.artists || []).length} linked</p>
                <p><span className="text-muted-foreground">Composers:</span> {tr.composers || '—'}</p>
                <p><span className="text-muted-foreground">Lyricists:</span> {tr.lyricists || '—'}</p>
              </div>
            ))}
            <p><span className="text-muted-foreground">Artwork:</span> {form.artwork_url ? '✓ Uploaded' : '✗ Missing'}</p>
            <p><span className="text-muted-foreground">Audio files:</span> {tracks.filter((tr) => tr.audio_url).length}/{tracks.length} uploaded</p>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <Button variant="ghost" onClick={() => setStep(2)}><ArrowLeft className="w-4 h-4" /> Back</Button>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleSaveDraft}
                disabled={savingDraft || submitting || !form.release_title.trim()}
              >
                {savingDraft ? <><Loader2 className="w-4 h-4 animate-spin mr-1" /> Saving Draft...</> : 'Save as Draft'}
              </Button>
              <Button onClick={handleSubmit} disabled={!canSubmit || submitting || savingDraft}>
                {submitting ? <><Loader2 className="w-4 h-4 animate-spin mr-1" /> Submitting...</> : <>Submit for Review <Check className="w-4 h-4 ml-1" /></>}
              </Button>
            </div>
          </div>
          {!canSubmit && (
            <p className="text-xs text-amber-600 text-center">Please complete all fields and upload all assets before submitting.</p>
          )}
        </Card>
      )}
    </div>
  );
}
