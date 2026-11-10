// Multi-tenant role helpers.
//
// The platform `role` field is the binary admin/user used by Base44's built-in
// permissions (only platform-admins manage other users). The app-level hierarchy
// lives in the custom `access_role` field:
//   SUPER_ADMIN  -> role 'admin',  sees every party
//   PARTY_ADMIN  -> role 'user',  scoped to their party_id
//   CLIENT_USER  -> role 'user',  scoped to their party_id
//
// Custom user fields may be nested under `data` (per RLS convention) or exposed
// flat depending on the SDK version, so these helpers read both locations.

function _val(user, key) {
  if (!user) return null;
  if (user.data && key in user.data) return user.data[key];
  return user[key] != null ? user[key] : null;
}

export function getAccessRole(user) {
  return _val(user, 'access_role');
}

export function getPartyId(user) {
  return _val(user, 'party_id');
}

export function isSuperAdmin(user) {
  return getAccessRole(user) === 'SUPER_ADMIN' || (!getAccessRole(user) && user?.role === 'admin');
}

export function isPartyAdmin(user) {
  return getAccessRole(user) === 'PARTY_ADMIN';
}

export function isClientUser(user) {
  return getAccessRole(user) === 'CLIENT_USER';
}

// Any admin-level user (super or party) — used to gate the admin navigation
// and the admin-only pages that Party Admins are allowed to access.
export function isAdminLevel(user) {
  const r = getAccessRole(user);
  return r === 'SUPER_ADMIN' || r === 'PARTY_ADMIN' || (!r && user?.role === 'admin');
}