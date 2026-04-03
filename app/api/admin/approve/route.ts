import { supabaseAdmin } from "@/lib/supabase/client";

export async function POST(req: Request) {
  // Verify admin secret
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${process.env.ADMIN_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { email } = await req.json();
  if (!email) {
    return Response.json({ error: "Email is required" }, { status: 400 });
  }

  const normalizedEmail = email.toLowerCase().trim();

  // Check the email is on the waitlist
  const { data: entry } = await supabaseAdmin
    .from("waitlist")
    .select("status")
    .eq("email", normalizedEmail)
    .single();

  if (!entry) {
    return Response.json({ error: "Email not found on waitlist" }, { status: 404 });
  }
  if (entry.status === "approved") {
    return Response.json({ error: "Already approved" }, { status: 409 });
  }

  // Mark as approved
  await supabaseAdmin
    .from("waitlist")
    .update({ status: "approved" })
    .eq("email", normalizedEmail);

  // Send Supabase invite with redirect to /set-password
  const redirectTo = `${process.env.NEXT_PUBLIC_APP_URL}/set-password`;
  const { error } = await supabaseAdmin.auth.admin.inviteUserByEmail(normalizedEmail, { redirectTo });

  if (error) {
    return Response.json({ error: `Invite failed: ${error.message}` }, { status: 500 });
  }

  return Response.json({ ok: true });
}
