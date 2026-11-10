import { Music2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table';
import { formatCurrency, formatNumber } from '@/lib/royalty';

export default function CatalogTracks({
  results, selectedIds, onToggle, onToggleAll, t
}) {
  if (!results || results.length === 0) return null;
  const allSelected = selectedIds.size === results.length;
  return (
    <Card className="overflow-hidden">
      <div className="px-5 py-4 border-b flex items-center gap-2">
        <Music2 className="w-4 h-4 text-indigo-600" />
        <h2 className="font-semibold">{t('ca.tracks')}</h2>
        <button onClick={onToggleAll} className="ml-auto text-sm text-indigo-600 hover:underline">
          {allSelected ? t('ca.deselect_all') : t('ca.select_all')}
        </button>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8"></TableHead>
            <TableHead>{t('ca.track')}</TableHead>
            <TableHead>{t('ca.album')}</TableHead>
            <TableHead>{t('ca.artist')}</TableHead>
            <TableHead>{t('ca.isrc')}</TableHead>
            <TableHead>{t('ca.imprint')}</TableHead>
            <TableHead className="text-right">{t('ca.rows')}</TableHead>
            <TableHead className="text-right">{t('ca.gross')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {results.map((r, i) => (
            <TableRow key={i} className={selectedIds.has(i) ? 'bg-indigo-50' : ''}>
              <TableCell>
                <Switch checked={selectedIds.has(i)} onCheckedChange={() => onToggle(i)} />
              </TableCell>
              <TableCell className="font-medium truncate max-w-[180px]">{r.track_title || '—'}</TableCell>
              <TableCell className="text-muted-foreground truncate max-w-[160px]">{r.album_title || '—'}</TableCell>
              <TableCell className="text-muted-foreground truncate max-w-[120px]">{r.artist || '—'}</TableCell>
              <TableCell className="text-muted-foreground text-xs">{r.isrc || '—'}</TableCell>
              <TableCell className="text-muted-foreground truncate max-w-[140px]">{r.label_imprint || '—'}</TableCell>
              <TableCell className="text-right">{formatNumber(r.rows)}</TableCell>
              <TableCell className="text-right">{formatCurrency(r.gross)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}