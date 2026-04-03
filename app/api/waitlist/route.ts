import { supabaseAdmin } from "@/lib/supabase/client";

export async function POST(req: Request) {
  const { email, strava_url, use_case } = await req.json();

  if (!email || typeof email !== "string") {
    return Response.json({ error: "Email is required" }, { status: 400 });
  }

  const { error } = await supabaseAdmin.from("waitlist").insert({
    email: email.toLowerCase().trim(),
    strava_url: strava_url || null,
    use_case: use_case || null,
  });

  if (error?.code === "23505") {
    return Response.json({ error: "Already on the waitlist" }, { status: 409 });
  }

  if (error) {
    return Response.json({ error: "Something went wrong" }, { status: 500 });
  }

  return Response.json({ ok: true });
}
