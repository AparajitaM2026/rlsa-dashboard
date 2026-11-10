import { useState, useEffect } from 'react';
import { useActiveClient } from '@/lib/ClientContext';
import { useLanguage } from '@/lib/i18n';
import { base44 } from '@/api/base44Client';
import PageHeader from '@/components/PageHeader';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { logActivity } from '@/lib/activityLog';
import { useAuth } from '@/lib/AuthContext';
import { isPartyAdmin } from '@/lib/roles';
import PartySubLabelAccounts from '@/components/client/PartySubLabelAccounts';
import { Plus, Trash2, Edit2, Check, X, Loader2 } from 'lucide-react';

export default function SubLabels() {
  const { clientAccount, loading } = useActiveClient();
  const { user } = useAuth();
  const { t } = useLanguage();
  const [subLabels, setSubLabels] = useState([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');

  const load = async () => {
    if (!clientAccount?.id) return;
    setDataLoading(true);
    try {
      const list = await base44.entities.SubLabel.filter({ client_account_id: clientAccount.id }, '-created_date', 500);
      setSubLabels(list);
    } catch (err) {
      console.error(err);
    } finally {
      setDataLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [clientAccount]);

  if (isPartyAdmin(user)) return <PartySubLabelAccounts />;

  if (loading || dataLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!clientAccount) {
    return <Card className="p-8 text-center text-slate-500">{t('common.no_account')}</Card>;
  }

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await base44.entities.SubLabel.create({
        name: newName.trim(),
        client_account_id: clientAccount.id,
        client_name: clientAccount.client_name,
        party_id: clientAccount.party_id || '',
        status: 'active'
      });
      await logActivity({
        action: 'sublabel_created',
        description: `Sub-label "${newName.trim()}" created under ${clientAccount.client_name}`,
        entity_type: 'SubLabel'
      });
      setNewName('');
      load();
    } catch (err) {
      alert('Failed to create sub-label: ' + (err.message || 'Unknown error'));
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id, name) => {
    if (!confirm(`Delete sub-label "${name}"? Existing releases will keep the cached name.`)) return;
    try {
      await base44.entities.SubLabel.delete(id);
      await logActivity({
        action: 'sublabel_deleted',
        description: `Sub-label "${name}" deleted from ${clientAccount.client_name}`,
        entity_type: 'SubLabel',
        entity_id: id
      });
      load();
    } catch (err) {
      alert('Failed to delete: ' + (err.message || 'Unknown error'));
    }
  };

  const handleSaveEdit = async (id) => {
    if (!editName.trim()) return;
    try {
      await base44.entities.SubLabel.update(id, { name: editName.trim() });
      await logActivity({
        action: 'sublabel_updated',
        description: `Sub-label renamed to "${editName.trim()}"`,
        entity_type: 'SubLabel',
        entity_id: id
      });
      setEditingId(null);
      load();
    } catch (err) {
      alert('Failed to update: ' + (err.message || 'Unknown error'));
    }
  };

  return (
    <div>
      <PageHeader title="Sub-Label Management" subtitle={`Manage sub-labels under ${clientAccount.client_name}`} />

      <Card className="p-4 mb-6">
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <Label className="text-sm">Create New Sub-Label</Label>
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Enter sub-label name" onKeyDown={(e) => e.key === 'Enter' && handleCreate()} />
          </div>
          <Button onClick={handleCreate} disabled={creating || !newName.trim()}>
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Add Sub-Label
          </Button>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Sub-Label Name</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {subLabels.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-slate-400 py-8">
                  No sub-labels yet. Create one above to organize your releases.
                </TableCell>
              </TableRow>
            )}
            {subLabels.map((sl) => (
              <TableRow key={sl.id}>
                <TableCell className="font-medium">
                  {editingId === sl.id ? (
                    <div className="flex items-center gap-2">
                      <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="h-8" autoFocus onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit(sl.id)} />
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-emerald-600" onClick={() => handleSaveEdit(sl.id)}><Check className="w-4 h-4" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-slate-400" onClick={() => setEditingId(null)}><X className="w-4 h-4" /></Button>
                    </div>
                  ) : (
                    sl.name
                  )}
                </TableCell>
                <TableCell><Badge variant={sl.status === 'active' ? 'default' : 'secondary'} className="capitalize">{sl.status || 'active'}</Badge></TableCell>
                <TableCell className="text-slate-400 text-sm">{new Date(sl.created_date).toLocaleDateString()}</TableCell>
                <TableCell className="text-right">
                  {editingId !== sl.id && (
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditingId(sl.id); setEditName(sl.name); }}><Edit2 className="w-3.5 h-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500" onClick={() => handleDelete(sl.id, sl.name)}><Trash2 className="w-3.5 h-3.5" /></Button>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}