// Shared admin authentication / authorization helpers for backend functions.
// Extracted so setUserPassword and linkUserClientAccount (and any future admin
// function) reuse the same role-resolution logic instead of duplicating it.

export interface AdminContext {
  user: any;
  userAccessRole: string | null;
  userPartyId: string | null;
  isSuper: boolean;
  isPartyAdmin: boolean;
}

// Resolves the acting user's admin context from a base44 client.
export async function resolveAdminContext(base44: any): Promise<AdminContext | null> {
  const user = await base44.auth.me();
  if (!user) return null;
  const userAccessRole = (user.access_role) || (user.data && user.data.access_role) || null;
  const userPartyId = (user.party_id) || (user.data && user.data.party_id) || null;
  const isSuper = user.role === 'admin';
  const isPartyAdmin = userAccessRole === 'PARTY_ADMIN';
  return { user, userAccessRole, userPartyId, isSuper, isPartyAdmin };
}

// Returns an error Response if the acting user is not an admin (super or party).
export function requireAdmin(ctx: AdminContext): Response | null {
  if (!ctx.isSuper && !ctx.isPartyAdmin) {
    return Response.json({ error: 'Forbidden — admin only' }, { status: 403 });
  }
  return null;
}

// Returns an error Response if a Party Admin is not linked to a party, or if the
// target user belongs to a different party. Returns null if the check passes.
export function partyAdminScopeCheck(ctx: AdminContext, targetPartyId: string | null): Response | null {
  if (ctx.isSuper) return null;
  if (!ctx.userPartyId) {
    return Response.json({ error: 'Your account is not linked to a party.' }, { status: 403 });
  }
  if (targetPartyId && targetPartyId !== ctx.userPartyId) {
    return Response.json({ error: 'You can only manage users in your own party.' }, { status: 403 });
  }
  return null;
}