import { Link } from 'react-router-dom';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Pencil } from 'lucide-react';

export default function RectificationDialog({ release, onClose }) {
  if (!release) return null;
  return (
    <Dialog open={!!release} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-red-600">
            <AlertTriangle className="w-5 h-5" /> Rectification Notice
          </DialogTitle>
          <DialogDescription>
            {release.release_title} — the admin could not approve this release. Please correct the items below and resubmit.
          </DialogDescription>
        </DialogHeader>
        <div className="text-sm text-slate-700 whitespace-pre-wrap max-h-72 overflow-y-auto rounded-lg bg-red-50 border border-red-200 p-3">
          {release.admin_remarks}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
          <Button asChild>
            <Link to={`/client/repertoire/upload?edit=${release.id}`}>
              <Pencil className="w-4 h-4" /> Fix &amp; Resubmit
            </Link>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}