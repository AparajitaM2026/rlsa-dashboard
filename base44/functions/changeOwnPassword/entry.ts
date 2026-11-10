import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { current_password, new_password } = body || {};
    if (!current_password || !new_password) {
      return Response.json({ error: 'current_password and new_password are required' }, { status: 400 });
    }
    if (typeof new_password !== 'string' || new_password.length < 8) {
      return Response.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
    }

    // Verify the current password by attempting a login
    try {
      await base44.auth.loginViaEmailPassword(user.email, current_password);
    } catch (_e) {
      return Response.json({ error: 'Current password is incorrect' }, { status: 401 });
    }

    // Update the password via service role
    await base44.asServiceRole.entities.User.update(user.id, { password: new_password });
    return Response.json({ ok: true, message: 'Password updated successfully' });
  } catch (error) {
    return Response.json({ error: error.message || 'Failed to change password' }, { status: 500 });
  }
}