import { useState } from 'react';
import { useActiveClient } from '@/lib/ClientContext';
import { useAuth } from '@/lib/AuthContext';
import { getPartyId } from '@/lib/roles';
import { base44 } from '@/api/base44Client';
import PageHeader from '@/components/PageHeader';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { logActivity } from '@/lib/activityLog';
import { Plus, Trash2, Edit2, Check, X, Loader2, Building2 } from 'lucide-react';

/**
 * Party Admin sub-label management. Under the separate-accounts model, each
 * sub-label is its own ClientAccount in the party. The Party Admin's own
 * account ("Main Label / Self") is shown read-only; every other account in
 * the party is a sub-label account they can create / rename / delete.
 */
export default function PartySubLabelAccounts() {
  const { partyAccounts, ownAccount, loading, reload } = useActiveClient();
  const { user } = useAuth();
  const partyId = getPartyId(user);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');

  const subLabelAccounts = partyAccounts.filter((a) => a.id !== ownAccount?.id);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      await base44.entities.ClientAccount.create({
        client_name: newName.trim(),
        contact_email: '',
        revenue_share_pct: ownAccount?.revenue_share_pct ?? 85,
        is_house_account: false,
        status: 'active',
        party_id: partyId
      });
      await logActivity({
        action: 'sublabel_account_created',
        description: `Sub-label account "${newName.trim()}" created`,
        entity_type: 'ClientAccount'
      });
      setNewName('');
      reload();
    } catch (err) {
      alert('Failed to create sub-label account: ' + (err.message || 'Unknown error'));
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id, name) => {
    if (!confirm(`Delete sub-label account "${name}"? Its releases and revenue history stay, but the account is removed.`)) return;
    try {
      await base44.entities.ClientAccount.delete(id);
      await logActivity({
        action: 'sublabel_account_deleted',
        description: `Sub-label account "${name}" deleted`,
        entity_type: 'ClientAccount',
        entity_id: id
      });
      reload();
    } catch (err) {
      alert('Failed to delete: ' + (err.message || 'Unknown error'));
    }
  };

  const handleSaveEdit = async (id) => {
    if (!editName.trim()) return;
    try {
      await base44.entities.ClientAccount.update(id, { client_name: editName.trim() });
      await logActivity({
        action: 'sublabel_account_renamed',
        description: `Sub-label account renamed to "${editName.trim()}"`,
        entity_type: 'ClientAccount',
        entity_id: id
      });
      setEditingId(null);
      reload();
    } catch (err) {
      alert('Failed to update: ' + (err.message || 'Unknown error'));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-indigo-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Sub-Label Accounts"
        subtitle="Each sub-label is its own account with its own login and revenue. Provision logins for them in My Users."
      />

      {ownAccount && (
        <Card className="p-4 mb-6 bg-indigo-50/40 border-indigo-200">
          <div className="flex items-center gap-3">
            <Building2 className="w-5 h-5 text-indigo-600" />
            <div>
              <p className="text-xs text-slate-500">Main Label (Self)</p>
              <p className="font-semibold">{ownAccount.client_name}</p>
            </div>
            <Badge className="ml-auto bg-indigo-100 text-indigo-700 hover:bg-indigo-100">Self</Badge>
          </div>
        </Card>
      )}

      <Card className="p-4 mb-6">
        <div className="flex items-end gap-3">
          <div className="flex-1">
            <Label className="text-sm">Create New Sub-Label Account</Label>
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
              <TableHead>Sub-Label Account</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {subLabelAccounts.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-slate-400 py-8">
                  No sub-label accounts yet. Create one above, then provision a login in My Users.
                </TableCell>
              </TableRow>
            )}
            {subLabelAccounts.map((sl) => (
              <TableRow key={sl.id}>
                <TableCell className="font-medium">
                  {editingId === sl.id ? (
                    <div className="flex items-center gap-2">
                      <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="h-8" autoFocus onKeyDown={(e) => e.key === 'Enter' && handleSaveEdit(sl.id)} />
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-emerald-600" onClick={() => handleSaveEdit(sl.id)}><Check className="w-4 h-4" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-slate-400" onClick={() => setEditingId(null)}><X className="w-4 h-4" /></Button>
                    </div>
                  ) : (
                    sl.client_name
                  )}
                </TableCell>
                <TableCell><Badge variant={sl.status === 'active' ? 'default' : 'secondary'} className="capitalize">{sl.status || 'active'}</Badge></TableCell>
                <TableCell className="text-slate-400 text-sm">{new Date(sl.created_date).toLocaleDateString()}</TableCell>
                <TableCell className="text-right">
                  {editingId !== sl.id && (
                    <div className="flex justify-end gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditingId(sl.id); setEditName(sl.client_name); }}><Edit2 className="w-3.5 h-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500" onClick={() => handleDelete(sl.id, sl.client_name)}><Trash2 className="w-3.5 h-3.5" /></Button>
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