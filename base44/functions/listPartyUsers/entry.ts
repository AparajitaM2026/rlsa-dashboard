import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';

// Returns the users belonging to the caller's party (Party Admin) or all users
// (Super Admin). Party Admins are restricted to their own party's users.
// Sensitive fields (password, tokens) are stripped from the response.
// Also returns the party's client accounts so the frontend doesn't need a
// separate API call.
export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const userAccessRole = (user.access_role) || (user.data && user.data.access_role) || null;
    const userPartyId = (user.party_id) || (user.data && user.data.party_id) || null;
    const isSuper = user.role === 'admin';
    const isPartyAdmin = userAccessRole === 'PARTY_ADMIN';
    if (!isSuper && !isPartyAdmin) return Response.json({ error: 'Forbidden — admin only' }, { status: 403 });

    // Fetch users and clients in parallel, scoped by party for Party Admins
    let users, allClients;
    if (isPartyAdmin) {
      if (!userPartyId) return Response.json({ error: 'Your account is not linked to a party.' }, { status: 403 });
      [users, allClients] = await Promise.all([
        base44.asServiceRole.entities.User.filter({ party_id: userPartyId }, '-created_date', 500),
        base44.asServiceRole.entities.ClientAccount.filter({ party_id: userPartyId }, '-created_date', 500)
      ]);
    } else {
      [users, allClients] = await Promise.all([
        base44.asServiceRole.entities.User.list('-created_date', 500),
        base44.asServiceRole.entities.ClientAccount.list('-created_date', 500)
      ]);
    }

    // Resolve client_account_id from email for users missing the field (display only, no write)
    const emailToClient = new Map();
    for (const c of allClients) {
      if (c.contact_email) emailToClient.set(c.contact_email.toLowerCase(), c.id);
    }
    const safe = users.map((u) => {
      const existingClientId = (u.client_account_id) || (u.data && u.data.client_account_id) || null;
      const linkedClientId = existingClientId || (u.email && emailToClient.get(u.email.toLowerCase())) || null;
      return {
        id: u.id,
        email: u.email,
        full_name: u.full_name,
        access_role: (u.access_role) || (u.data && u.data.access_role) || null,
        party_id: (u.party_id) || (u.data && u.data.party_id) || null,
        client_account_id: linkedClientId,
        is_verified: !!u.is_verified,
        created_date: u.created_date
      };
    });

    const safeClients = allClients
      .filter((c) => !c.is_house_account)
      .map((c) => ({
        id: c.id,
        client_name: c.client_name,
        contact_email: c.contact_email,
        revenue_share_pct: c.revenue_share_pct,
        party_id: c.party_id
      }));

    return Response.json({ users: safe, clients: safeClients });
  } catch (error) {
    return Response.json({ error: error.message || 'Failed to list users' }, { status: 500 });
  }
}