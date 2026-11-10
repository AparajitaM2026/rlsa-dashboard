import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';

// Promotes an existing platform user to PARTY_ADMIN and links them to a party,
// WITHOUT changing their password or creating a duplicate account.
// Super Admin only. Optionally auto-creates a new party from a supplied name.
export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden — super admin only' }, { status: 403 });

    const body = await req.json();
    const { email, user_id, party_id, auto_create_party_name, auto_create_party_code } = body || {};

    if (!email && !user_id) {
      return Response.json({ error: 'email or user_id is required' }, { status: 400 });
    }

    // Resolve the target user
    let targetUser = null;
    if (user_id) {
      try {
        targetUser = await base44.asServiceRole.entities.User.get(user_id);
      } catch (_) { targetUser = null; }
    }
    if (!targetUser && email) {
      const matches = await base44.asServiceRole.entities.User.filter({ email: email.toLowerCase() }, '-created_date', 10);
      targetUser = matches && matches.length > 0 ? matches[0] : null;
    }
    if (!targetUser) {
      return Response.json({ error: 'User not found. Create the account first from User Management.' }, { status: 404 });
    }

    // Prevent demoting / re-targeting the acting super admin
    if (targetUser.email?.toLowerCase() === user.email?.toLowerCase()) {
      return Response.json({ error: 'You cannot promote yourself.' }, { status: 400 });
    }

    // Resolve the target party — either an existing id or auto-create from a name
    let resolvedPartyId = party_id;
    let createdParty = null;
    if (!resolvedPartyId && auto_create_party_name) {
      createdParty = await base44.asServiceRole.entities.Party.create({
        name: auto_create_party_name,
        code: auto_create_party_code || null,
        contact_email: targetUser.email || null,
        status: 'active'
      });
      resolvedPartyId = createdParty.id;
    }
    if (!resolvedPartyId) {
      return Response.json({ error: 'A party must be selected or a new party name provided.' }, { status: 400 });
    }

    // Promote: set access_role + party_id, leave password untouched
    await base44.asServiceRole.entities.User.update(targetUser.id, {
      access_role: 'PARTY_ADMIN',
      party_id: resolvedPartyId
    });

    // Link the user's existing client account(s) to the new party so their
    // historical data is preserved as their "Main Label / Self" profile.
    // Also stamp client_account_id on the user so RLS account-level scoping works.
    try {
      const existingAccounts = await base44.asServiceRole.entities.ClientAccount.filter(
        { contact_email: targetUser.email }, '-created_date', 50
      );
      for (const a of existingAccounts) {
        if (a.party_id !== resolvedPartyId) {
          await base44.asServiceRole.entities.ClientAccount.update(a.id, { party_id: resolvedPartyId });
        }
      }
      if (existingAccounts.length > 0) {
        await base44.asServiceRole.entities.User.update(targetUser.id, {
          client_account_id: existingAccounts[0].id
        });
      }
    } catch { /* non-fatal — account linking is best-effort */ }

    return Response.json({
      ok: true,
      user_id: targetUser.id,
      email: targetUser.email,
      party_id: resolvedPartyId,
      party_created: !!createdParty,
      party_name: createdParty?.name || null
    });
  } catch (error) {
    return Response.json({ error: error.message || 'Failed to promote user' }, { status: 500 });
  }
}