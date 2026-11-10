import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, Trash2 } from 'lucide-react';

export default function LogoUploadDialog({ open, onOpenChange, onSaved, currentLogoUrl, currentBrandName, partyId }) {
  const { toast } = useToast();
  const [file, setFile] = useState(null);
  const [brandName, setBrandName] = useState(currentBrandName || 'Mayra Music');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setBrandName(currentBrandName || 'Mayra Music');
      setFile(null);
    }
  }, [open, currentBrandName]);

  const handleClose = (next) => {
    if (saving) return;
    if (!next) setFile(null);
    onOpenChange(next);
  };

  const saveBranding = async (logoUrl, name) => {
    const res = await base44.functions.invoke('updatePartyLogo', { 
      logo_url: logoUrl, 
      name: name,
      party_id: partyId 
    });
    if (res.data?.error) throw new Error(res.data.error);
    const savedUrl = res.data?.logo_url !== undefined ? res.data.logo_url : logoUrl;
    const savedName = res.data?.name || name;
    onSaved({ logoUrl: savedUrl || '', name: savedName });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      let finalLogoUrl = currentLogoUrl;
      if (file) {
        const { file_url } = await base44.integrations.Core.UploadPublicFile({ file });
        finalLogoUrl = file_url;
      }
      await saveBranding(finalLogoUrl, brandName);
      setFile(null);
      toast({ title: 'Branding updated', description: 'Brand name and logo updated successfully.' });
      onOpenChange(false);
    } catch (error) {
      toast({ title: 'Could not update branding', description: error.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    setSaving(true);
    try {
      await saveBranding('', 'Mayra Music');
      setFile(null);
      setBrandName('Mayra Music');
      toast({ title: 'Reset to default', description: 'Showing default branding again.' });
      onOpenChange(false);
    } catch (error) {
      toast({ title: 'Could not reset', description: error.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Customize Brand & Logo</DialogTitle>
          <DialogDescription>
            Update the brand name and logo shown across the dashboard for you and your team.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Brand / Label Name</Label>
            <Input
              type="text"
              placeholder="e.g. Mayra Music"
              value={brandName}
              disabled={saving}
              onChange={(e) => setBrandName(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Logo Image</Label>
            <Input
              type="file"
              accept="image/*"
              disabled={saving}
              onChange={(e) => setFile(e.target.files?.[0] || null)}
            />
            {file ? (
              <div className="mt-2 flex items-center gap-3 p-2 border border-border/80 rounded-lg bg-card/60">
                <img
                  src={URL.createObjectURL(file)}
                  alt="Selected logo preview"
                  className="h-12 w-12 object-contain rounded border border-white/10 bg-black/40 p-1"
                />
                <span className="text-xs text-muted-foreground truncate">{file.name}</span>
              </div>
            ) : currentLogoUrl ? (
              <div className="mt-2 flex items-center gap-3 p-2 border border-border/80 rounded-lg bg-card/60">
                <img
                  src={currentLogoUrl}
                  alt="Current logo"
                  className="h-12 w-12 object-contain rounded border border-white/10 bg-black/40 p-1"
                />
                <span className="text-xs text-muted-foreground">Current active logo</span>
              </div>
            ) : null}
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={handleReset} disabled={saving} className="gap-2">
            <Trash2 className="w-4 h-4" /> Reset
          </Button>
          <Button onClick={handleSave} disabled={saving} className="gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {saving ? 'Saving…' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
