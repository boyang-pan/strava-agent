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
      from: "Bo from Training Chat <noreply@trainingchat.tech>",
      replyTo: "boyangpanworks@gmail.com",
      to: normalizedEmail,
      subject: "You're on the waitlist",
      html: `<p>Hi,</p><p>Thanks for signing up — really appreciate the interest in Training Chat.</p><p>You're on the list. I'll reach out personally once your spot is ready.</p><p>If you'd like access sooner, just reply to this email and I'll do my best to get you in early.</p><p>Best,<br>Bo from Training Chat</p>`,
    })
    .catch(console.error);

  resend.emails
    .send({
      from: "Training Chat <noreply@trainingchat.tech>",
      to: "boyangpanworks@gmail.com",
      subject: `New waitlist signup: ${normalizedEmail}`,
      html: `<p><strong>${normalizedEmail}</strong> just joined the waitlist.</p>${strava_url ? `<p>Strava: ${strava_url}</p>` : ""}${use_case ? `<p>Use case: ${use_case}</p>` : ""}`,
    })
    .catch(console.error);

  return Response.json({ ok: true });
}
