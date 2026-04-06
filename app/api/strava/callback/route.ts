import { getAuthUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/client";
import { syncStravaActivities } from "@/lib/sync/strava-sync";
import { NextResponse, type NextRequest } from "next/server";
import { waitUntil } from "@vercel/functions";

export async function GET(request: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL!;
  const { searchParams } = request.nextUrl;
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  if (error || !code) {
    return NextResponse.redirect(`${appUrl}/connect-strava?error=${error ?? "missing_code"}`);
  }

  const user = await getAuthUser();
  if (!user) {
    return NextResponse.redirect(`${appUrl}/login`);
  }

  // Exchange code for tokens
  const tokenRes = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      code,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenRes.ok) {
    const body = await tokenRes.text();
    console.error("[strava/callback] token exchange failed:", body);
    return NextResponse.redirect(`${appUrl}/connect-strava?error=token_exchange_failed`);
  }

  const tokens = await tokenRes.json() as {
    access_token: string;
    refresh_token: string;
    expires_at: number; // unix timestamp
    athlete: { id: number };
    scope: string;
  };

  // Persist tokens
  const { error: upsertError } = await supabaseAdmin
    .from("strava_connections")
    .upsert({
      user_id: user.id,
      athlete_id: tokens.athlete.id,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_expires_at: new Date(tokens.expires_at * 1000).toISOString(),
      scope: tokens.scope,
      updated_at: new Date().toISOString(),
    });

  if (upsertError) {
    console.error("[strava/callback] upsert failed:", upsertError);
    return NextResponse.redirect(`${appUrl}/connect-strava?error=db_error`);
  }

  // Kick off sync — waitUntil keeps the serverless function alive after redirect
  waitUntil(
    syncStravaActivities(user.id, tokens.access_token).catch((err) =>
      console.error("[strava/callback] sync failed:", err)
    )
  );

  return NextResponse.redirect(`${appUrl}/chat`);
}
