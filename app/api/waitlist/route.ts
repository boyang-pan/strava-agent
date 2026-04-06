import { supabaseAdmin } from "@/lib/supabase/client";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST(req: Request) {
  const { email, strava_url, use_case } = await req.json();

  if (!email || typeof email !== "string") {
    return Response.json({ error: "Email is required" }, { status: 400 });
  }

  const normalizedEmail = email.toLowerCase().trim();

  const { error } = await supabaseAdmin.from("waitlist").insert({
    email: normalizedEmail,
    strava_url: strava_url || null,
    use_case: use_case || null,
  });

  if (error?.code === "23505") {
    return Response.json({ error: "Already on the waitlist" }, { status: 409 });
  }

  if (error) {
    return Response.json({ error: "Something went wrong" }, { status: 500 });
  }

  resend.emails
    .send({
      from: "Training Chat <onboarding@resend.dev>",
      to: normalizedEmail,
      subject: "You're on the waitlist",
      html: `<p>Hey,</p><p>You're on the list. I'll reach out when your spot is ready.</p><p>— Boyang</p>`,
    })
    .catch(console.error);

  return Response.json({ ok: true });
}
