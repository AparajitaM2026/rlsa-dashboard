import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';

// One-time migration to introduce multi-tenancy:
//  1. Create the default "OTT Solutions" party (idempotent).
//  2. Backfill party_id on every existing record of the core entities.
//  3. Promote existing platform-admin users to SUPER_ADMIN, regular users to
//     CLIENT_USER, and stamp party_id on every user.
//
// Super-admin only. Uses asServiceRole to bypass RLS and touch User records.

const DEFAULT_PARTY_NAME = 'OTT Solutions';
const DEFAULT_PARTY_CODE = 'OTT';

const BACKFILL_ENTITIES = [
  'ClientAccount',
  'RevenueRow',
  'Release',
  'SubLabel',
  'Payout',
  'LabelMapping',
  'ArtistMapping',
  'MonthlyAggregate',
  'CsvUploadJob',
  'CatalogSearchJob',
  'SupportTicket',
  'TicketMessage',
  'ActivityLog'
];

async function updateAll(base44, entityName, query, setOp) {
  let total = 0;
  let hasMore = true;
  let guard = 0;
  while (hasMore && guard < 200) {
    guard++;
    const res = await base44.asServiceRole.entities[entityName].updateMany(query, setOp);
    const modified = res?.modified_count ?? res?.modifiedCount ?? 0;
    total += modified;
    hasMore = res?.has_more === true && modified > 0;
  }
  return total;
}

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') {
      return Response.json({ error: 'Forbidden — super admin only' }, { status: 403 });
    }

    // 1. Find or create the default party.
    let parties = await base44.asServiceRole.entities.Party.filter(
      { name: DEFAULT_PARTY_NAME },
      '-created_date',
      10
    );
    let party = parties && parties.length > 0 ? parties[0] : null;
    if (!party) {
      party = await base44.asServiceRole.entities.Party.create({
        name: DEFAULT_PARTY_NAME,
        code: DEFAULT_PARTY_CODE,
        status: 'active'
      });
    }

    // 2. Backfill party_id on every core entity (records with no party_id yet).
    const backfilled: Record<string, number> = {};
    for (const ent of BACKFILL_ENTITIES) {
      try {
        backfilled[ent] = await updateAll(
          base44,
          ent,
          { party_id: null },
          { $set: { party_id: party.id } }
        );
      } catch (e) {
        backfilled[ent] = -1; // entity may not exist yet / no records
      }
    }

    // 3-5. The platform forbids bulk updates on the built-in User entity, so
    // we list every user and update each individually: stamp party_id, promote
    // existing admins to SUPER_ADMIN, and tag regular users as CLIENT_USER.
    let usersPartyStamped = 0;
    let promotedSuperAdmin = 0;
    let taggedClientUser = 0;
    const allUsers = await base44.asServiceRole.entities.User.list('-created_date', 500);
    for (const u of allUsers || []) {
      const update: Record<string, string> = {};
      if (!u.party_id) update.party_id = party.id;
      if (!u.access_role) {
        update.access_role = u.role === 'admin' ? 'SUPER_ADMIN' : 'CLIENT_USER';
      }
      if (Object.keys(update).length === 0) continue;
      try {
        await base44.asServiceRole.entities.User.update(u.id, update);
        if (update.party_id) usersPartyStamped++;
        if (update.access_role === 'SUPER_ADMIN') promotedSuperAdmin++;
        if (update.access_role === 'CLIENT_USER') taggedClientUser++;
      } catch (_) {
        /* skip this user */
      }
    }

    return Response.json({
      ok: true,
      party: { id: party.id, name: party.name, code: party.code },
      backfilled,
      users_party_id_set: usersPartyStamped,
      promoted_super_admin: promotedSuperAdmin,
      tagged_client_user: taggedClientUser
    });
  } catch (error) {
    return Response.json(
      { error: error.message || 'Migration failed' },
      { status: 500 }
    );
  }
}