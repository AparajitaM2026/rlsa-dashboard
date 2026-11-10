import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';
import { resolveAdminContext, requireAdmin, partyAdminScopeCheck } from '../../shared/adminAuth.ts';

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const ctx = await resolveAdminContext(base44);
    if (!ctx) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const adminErr = requireAdmin(ctx);
    if (adminErr) return adminErr;
    const { user, userPartyId, isPartyAdmin } = ctx;

    const body = await req.json();
    let { email, new_password, access_role, party_id, client_account_id } = body || {};
    // Party Admins may only create client users within their own party
    if (isPartyAdmin) {
      const scopeErr = partyAdminScopeCheck(ctx, null);
      if (scopeErr) return scopeErr;
      access_role = 'CLIENT_USER';
      party_id = userPartyId;
    }
    if (!email || !new_password) {
      return Response.json({ error: 'email and new_password are required' }, { status: 400 });
    }
    if (typeof new_password !== 'string' || new_password.length < 8) {
      return Response.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
    }
    if (email.toLowerCase() === user.email?.toLowerCase()) {
      return Response.json({ error: 'Use the Settings page to change your own password' }, { status: 400 });
    }

    // Find the platform user by email
    const matches = await base44.asServiceRole.entities.User.filter({ email: email.toLowerCase() }, '-created_date', 10);
    let targetUser = matches && matches.length > 0 ? matches[0] : null;

    // If no platform user exists yet, register one with the admin-set password
    let created = false;
    if (!targetUser) {
      try {
        await base44.auth.register({ email: email.toLowerCase(), password: new_password });
        created = true;
      } catch (e) {
        return Response.json({ error: `Failed to create user: ${e.message}` }, { status: 500 });
      }
      // Re-fetch the newly created user
      const rematches = await base44.asServiceRole.entities.User.filter({ email: email.toLowerCase() }, '-created_date', 10);
      targetUser = rematches && rematches.length > 0 ? rematches[0] : null;
      if (!targetUser) {
        return Response.json({ error: `User creation succeeded but user record not found for ${email}` }, { status: 500 });
      }
    }

    // Party Admins can only manage users already in their own party
    if (isPartyAdmin && targetUser) {
      const tParty = (targetUser.party_id) || (targetUser.data && targetUser.data.party_id) || null;
      const scopeErr = partyAdminScopeCheck(ctx, tParty);
      if (scopeErr) return scopeErr;
    }

    // Set the password on the entity (for existing users whose password needs resetting)
    const updatePayload = { password: new_password };
    if (access_role) updatePayload.access_role = access_role;
    if (party_id) updatePayload.party_id = party_id;
    if (client_account_id !== undefined) updatePayload.client_account_id = client_account_id || '';
    await base44.asServiceRole.entities.User.update(targetUser.id, updatePayload);

    // Check verification status — the platform requires OTP before login (is_verified is protected
    // and cannot be set programmatically). We intentionally do NOT send the OTP here; the OTP is
    // triggered only when the user first attempts to log in with these credentials.
    const freshUser = await base44.asServiceRole.entities.User.get(targetUser.id);
    const needsVerification = !freshUser?.is_verified;

    if (needsVerification) {
      const message = created
        ? `Account created for ${email}. When the user logs in with these credentials, they will receive a verification code to activate their account.`
        : `Password updated for ${email}. The user must verify their email on first login before they can access the account.`;
      return Response.json({ ok: true, created, needs_verification: true, message });
    }

    const message = `Password updated for ${targetUser.email}. The user can log in immediately.`;
    return Response.json({ ok: true, created, needs_verification: false, message });
  } catch (error) {
    return Response.json({ error: error.message || 'Failed to set password' }, { status: 500 });
  }
}