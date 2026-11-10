import { createClientFromRequest } from 'npm:@base44/sdk@0.8.49';

export default async function(req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const { email } = body || {};
    if (!email) {
      return Response.json({ error: 'email is required' }, { status: 400 });
    }

    // Look up the user by email (service role — public endpoint for login flow)
    const matches = await base44.asServiceRole.entities.User.filter({ email: email.toLowerCase() }, '-created_date', 1);
    if (!matches || matches.length === 0) {
      return Response.json({ exists: false, is_verified: false });
    }

    const user = matches[0];
    if (!user.is_verified) {
      // Send a fresh OTP so the user can verify immediately
      try {
        await base44.auth.resendOtp(email.toLowerCase());
      } catch (_e) {
        // Ignore resend errors — the user can request again from the OTP page
      }
    }

    return Response.json({ exists: true, is_verified: !!user.is_verified });
  } catch (error) {
    return Response.json({ error: error.message || 'Failed to check user' }, { status: 500 });
  }
}