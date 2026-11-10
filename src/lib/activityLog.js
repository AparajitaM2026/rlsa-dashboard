import { base44 } from '@/api/base44Client';

// Best-effort audit logging. Never throws — logging must not break the action it records.
// Stamps the acting user's party_id so Party Admin activity is visible within their tenant.
export async function logActivity({ action, description, entity_type, entity_id, metadata, party_id }) {
  try {
    let pid = party_id;
    if (pid == null) {
      try {
        const me = await base44.auth.me();
        pid = me?.data?.party_id || me?.party_id || null;
      } catch (_) {
        /* ignore — super-admin logs without party_id are still allowed by RLS */
      }
    }
    await base44.entities.ActivityLog.create({
      action,
      description,
      entity_type: entity_type || '',
      entity_id: entity_id || '',
      party_id: pid || '',
      metadata:
        metadata == null
          ? ''
          : typeof metadata === 'string'
          ? metadata
          : JSON.stringify(metadata)
    });
  } catch (e) {
    /* ignore */
  }
}