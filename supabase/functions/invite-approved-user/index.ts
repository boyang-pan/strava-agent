/**
 * Invite Approved User Edge Function
 * Called by a database trigger when a waitlist row's status changes to 'approved'.
 * Sends a Supabase invite email with a redirect to /set-password.
 *
 * Deploy: supabase functions deploy invite-approved-user
 * Set secrets: supabase secrets set INVITE_WEBHOOK_SECRET=... APP_URL=...
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  // Verify webhook secret
  const auth = req.headers.get("authorization");
  const secret = Deno.env.get("INVITE_WEBHOOK_SECRET");
  if (!secret || auth !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { email } = await req.json();
  if (!email) {
    return new Response("Email is required", { status: 400 });
  }

  const appUrl = Deno.env.get("APP_URL") ?? "http://localhost:3000";
  const { error } = await supabase.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${appUrl}/set-password`,
  });

  if (error) {
    console.error("Invite error:", error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }

  console.log(`Invite sent to ${email}`);
  return Response.json({ ok: true });
});
