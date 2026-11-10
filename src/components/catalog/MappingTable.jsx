import { useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow
} from '@/components/ui/table';

export default function MappingTable({
  mappings, clients, loading, saving, onSaveEdit, onDelete, t
}) {
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({
    match_type: 'isrc', match_value: '', client_account_id: '',
    revenue_share_pct: 70, override_label: false
  });

  const clientName = (id) => clients.find((c) => c.id === id)?.client_name || '—';

  const matchTypeBadge = (type) => {
    if (type === 'isrc') return <Badge className="bg-indigo-100 text-indigo-700 hover:bg-indigo-100">{t('ca.type_isrc')}</Badge>;
    if (type === 'track_title') return <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">{t('ca.type_track')}</Badge>;
    return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100">{t('ca.type_album')}</Badge>;
  };

  const startEdit = (m) => {
    setEditingId(m.id);
    setEditForm({
      match_type: m.match_type || 'isrc',
      match_value: m.match_value || '',
      client_account_id: m.client_account_id || '',
      revenue_share_pct: m.revenue_share_pct || 70,
      override_label: !!m.override_label
    });
  };

  const submit = (e) => {
    e.preventDefault();
    onSaveEdit(editingId, editForm).then(() => setEditingId(null));
  };

  return (
    <Card className="overflow-hidden">
      <div className="px-5 py-4 border-b">
        <h2 className="font-semibold">{t('ca.existing_mappings')}</h2>
        <p className="text-sm text-muted-foreground mt-0.5">{t('ca.existing_mappings_desc')}</p>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('ca.match_value')}</TableHead>
            <TableHead>{t('ca.match_type')}</TableHead>
            <TableHead>{t('ca.client')}</TableHead>
            <TableHead>{t('ca.override')}</TableHead>
            <TableHead className="text-right">{t('ca.action')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {mappings.map((m) => (
            <TableRow key={m.id}>
              <TableCell className="font-medium">{m.match_value}</TableCell>
              <TableCell>{matchTypeBadge(m.match_type)}</TableCell>
              <TableCell>{clientName(m.client_account_id)}</TableCell>
              <TableCell>
                {m.override_label ? <Badge className="bg-rose-100 text-rose-700 hover:bg-rose-100">{t('ca.override')}</Badge> : '—'}
              </TableCell>
              <TableCell className="text-right">
                <button onClick={() => startEdit(m)} className="p-1.5 rounded hover:bg-muted"><Pencil className="w-4 h-4" /></button>
                <button onClick={() => onDelete(m)} className="p-1.5 rounded hover:bg-muted text-rose-600"><Trash2 className="w-4 h-4" /></button>
              </TableCell>
            </TableRow>
          ))}
          {!loading && mappings.length === 0 && (
            <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">{t('ca.no_mappings')}</TableCell></TableRow>
          )}
        </TableBody>
      </Table>

      {editingId && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setEditingId(null)}>
          <Card className="p-5 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
            <h2 className="font-semibold mb-4">{t('ca.edit_mapping')}</h2>
            <form onSubmit={submit} className="space-y-3">
              <div className="space-y-1">
                <Label>{t('ca.match_type')}</Label>
                <Select value={editForm.match_type} onValueChange={(v) => setEditForm({ ...editForm, match_type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="isrc">{t('ca.type_isrc')}</SelectItem>
                    <SelectItem value="track_title">{t('ca.type_track')}</SelectItem>
                    <SelectItem value="album_title">{t('ca.type_album')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>{t('ca.match_value')}</Label>
                <Input required value={editForm.match_value} onChange={(e) => setEditForm({ ...editForm, match_value: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>{t('ca.client')}</Label>
                <Select value={editForm.client_account_id || 'none'} onValueChange={(v) => setEditForm({ ...editForm, client_account_id: v === 'none' ? '' : v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t('ca.none')}</SelectItem>
                    {clients.filter((c) => !c.is_house_account).map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.client_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>{t('ca.share_pct')}</Label>
                <Input type="number" min="0" max="100" value={editForm.revenue_share_pct} onChange={(e) => setEditForm({ ...editForm, revenue_share_pct: Number(e.target.value) })} />
              </div>
              <div className="flex items-center justify-between rounded-lg border p-3">
                <p className="text-sm font-medium">{t('ca.override_label')}</p>
                <Switch checked={editForm.override_label} onCheckedChange={(v) => setEditForm({ ...editForm, override_label: v })} />
              </div>
              <div className="flex gap-2 pt-1">
                <Button type="submit" disabled={saving} className="flex-1">{t('common.update')}</Button>
                <Button type="button" variant="outline" onClick={() => setEditingId(null)}>{t('common.cancel')}</Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </Card>
  );
}