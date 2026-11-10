import { ArrowRightLeft, Loader2, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';

export default function CatalogAssignBar({
  clients, targetClient, setTargetClient, sharePct, setSharePct,
  overrideLabel, setOverrideLabel, selectedCount, assigning, onAssign, message, t,
  canUndo, onUndo
}) {
  return (
    <div className="p-4">
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex-1 min-w-[200px] space-y-1">
          <Label>{t('ca.assign_to')}</Label>
          <Select value={targetClient || 'none'} onValueChange={(v) => setTargetClient(v === 'none' ? '' : v)}>
            <SelectTrigger><SelectValue placeholder={t('ca.select_client')} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{t('ca.none')}</SelectItem>
              {clients.map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.client_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="w-28 space-y-1">
          <Label>{t('ca.share_pct')}</Label>
          <Input type="number" min="0" max="100" value={sharePct} onChange={(e) => setSharePct(e.target.value)} />
        </div>
        <div className="flex items-center gap-2 pb-2">
          <Switch checked={overrideLabel} onCheckedChange={setOverrideLabel} />
          <span className="text-sm text-muted-foreground whitespace-nowrap">{t('ca.override_label')}</span>
        </div>
        <Button disabled={assigning || !targetClient || selectedCount === 0} onClick={onAssign}>
          {assigning ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <ArrowRightLeft className="w-4 h-4 mr-1" />}
          {t('ca.assign_selected')} ({selectedCount})
        </Button>
      </div>
      {message && (
        <div className={`mt-3 flex items-center justify-between gap-3 text-sm rounded-lg px-3 py-2 ${
          message.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-700'
        }`}>
          <span>{message.text}</span>
          {message.type === 'success' && canUndo && (
            <Button size="sm" variant="outline" disabled={assigning} onClick={onUndo} className="shrink-0">
              {assigning ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Undo2 className="w-3.5 h-3.5 mr-1" />}
              {t('ca.undo')}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}