import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';
import { resolveAdminContext, requireAdmin, partyAdminScopeCheck } from '../../shared/adminAuth.ts';

// Links (or unlinks) a platform user to a ClientAccount. Sets the user's
// client_account_id (used by RLS for account-level scoping) and updates the
// ClientAccount's contact_email so the existing email-based linking still works.
// Party Admin or Super Admin only. Party Admins are restricted to their own party.
export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const ctx = await resolveAdminContext(base44);
    if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const adminErr = requireAdmin(ctx);
    if (adminErr) return adminErr;
    const { userPartyId, isPartyAdmin } = ctx;

    const body = await req.json();
    const { email, client_account_id, revenue_share_pct } = body || {};
    if (!email) return Response.json({ error: 'email is required' }, { status: 400 });

    // Resolve the target user
    const matches = await base44.asServiceRole.entities.User.filter({ email: email.toLowerCase() }, '-created_date', 10);
    const targetUser = matches && matches.length > 0 ? matches[0] : null;
    if (!targetUser) return Response.json({ error: 'User not found' }, { status: 404 });

    // Party Admins can only manage users in their own party
    if (isPartyAdmin) {
      const tParty = (targetUser.party_id) || (targetUser.data && targetUser.data.party_id) || null;
      const scopeErr = partyAdminScopeCheck(ctx, tParty);
      if (scopeErr) return scopeErr;
    }

    const normalizedEmail = email.toLowerCase();

    // Unlink any account previously tied to this email (clear stale contact_email)
    const staleAccounts = await base44.asServiceRole.entities.ClientAccount.filter(
      { contact_email: normalizedEmail }, '-created_date', 50
    );
    for (const a of staleAccounts) {
      if (!client_account_id || a.id !== client_account_id) {
        await base44.asServiceRole.entities.ClientAccount.update(a.id, { contact_email: '' });
      }
    }

    // Link the chosen account (or clear if no account selected)
    if (client_account_id) {
      const target = await base44.asServiceRole.entities.ClientAccount.get(client_account_id);
      if (!target) return Response.json({ error: 'Client account not found' }, { status: 404 });
      // Party Admins can only link accounts in their own party
      if (isPartyAdmin && target.party_id && target.party_id !== userPartyId) {
        return Response.json({ error: 'You can only link accounts in your own party.' }, { status: 403 });
      }
      // If that account is already linked to a different user, clear the other user's client_account_id
      if (target.contact_email && target.contact_email.toLowerCase() !== normalizedEmail) {
        const otherUsers = await base44.asServiceRole.entities.User.filter(
          { email: target.contact_email.toLowerCase() }, '-created_date', 10
        );
        for (const ou of otherUsers) {
          const ouClientId = (ou.client_account_id) || (ou.data && ou.data.client_account_id) || null;
          if (ouClientId === client_account_id) {
            await base44.asServiceRole.entities.User.update(ou.id, { client_account_id: '' });
          }
        }
      }
      const clientUpdate: Record<string, any> = { contact_email: normalizedEmail };
      if (revenue_share_pct != null && !isNaN(Number(revenue_share_pct))) {
        clientUpdate.revenue_share_pct = Number(revenue_share_pct);
      }
      await base44.asServiceRole.entities.ClientAccount.update(client_account_id, clientUpdate);
    }

    // Set (or clear) the user's client_account_id
    await base44.asServiceRole.entities.User.update(targetUser.id, {
      client_account_id: client_account_id || ''
    });

    return Response.json({ ok: true, email: targetUser.email, client_account_id: client_account_id || null });
  } catch (error) {
    return Response.json({ error: error.message || 'Failed to link user account' }, { status: 500 });
  }
}