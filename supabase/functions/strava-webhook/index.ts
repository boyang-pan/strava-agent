/**
 * Strava Webhook Edge Function
 * Handles new activity events from Strava's Webhook Events API.
 * Fetches the full DetailedActivity, upserts it, and recomputes PRs.
 *
 * Deploy: supabase functions deploy strava-webhook
 * Set secrets: supabase secrets set STRAVA_CLIENT_ID=... STRAVA_CLIENT_SECRET=... etc.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// Strava webhook verification token — set this as a Supabase secret
const VERIFY_TOKEN = Deno.env.get("STRAVA_WEBHOOK_VERIFY_TOKEN") ?? "strava-agent-verify";

Deno.serve(async (req) => {
  // Webhook verification (GET)
  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    if (mode === "subscribe" && token === VERIFY_TOKEN && challenge) {
      return Response.json({ "hub.challenge": challenge });
    }
    return new Response("Forbidden", { status: 403 });
  }

  // Webhook event (POST)
  if (req.method === "POST") {
    const event = await req.json();

    // Only handle activity create/update events
    if (event.object_type !== "activity" || !["create", "update"].includes(event.aspect_type)) {
      return Response.json({ ok: true });
    }

    const activityId = event.object_id;

    try {
      const accessToken = await getAccessToken();
      const activity = await fetchDetailedActivity(accessToken, activityId);
      await upsertActivity(activity);
      await recomputePersonalRecords();
    } catch (err) {
      console.error("Webhook processing error:", err);
      return Response.json({ error: String(err) }, { status: 500 });
    }

    return Response.json({ ok: true });
  }

  return new Response("Method Not Allowed", { status: 405 });
});

async function getAccessToken(): Promise<string> {
  const res = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: Deno.env.get("STRAVA_CLIENT_ID"),
      client_secret: Deno.env.get("STRAVA_CLIENT_SECRET"),
      refresh_token: Deno.env.get("STRAVA_REFRESH_TOKEN"),
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  return data.access_token;
}

async function fetchDetailedActivity(token: string, id: number) {
  const res = await fetch(`https://www.strava.com/api/v3/activities/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Strava API ${res.status}: ${await res.text()}`);
  return res.json();
}

async function upsertActivity(a: Record<string, unknown>) {
  const row = {
    id: a.id,
    name: a.name,
    type: a.type,
    workout_type: a.workout_type ?? null,
    start_date: a.start_date,
    distance_meters: a.distance,
    moving_time_seconds: a.moving_time,
    elapsed_time_seconds: a.elapsed_time,
    elevation_gain_meters: a.total_elevation_gain,
    average_heartrate: a.average_heartrate ?? null,
    max_heartrate: a.max_heartrate ?? null,
    average_speed_mps: a.average_speed,
    max_speed_mps: a.max_speed,
    suffer_score: a.suffer_score ?? null,
    perceived_exertion: a.perceived_exertion ?? null,
    average_watts: a.average_watts ?? null,
    weighted_average_watts: a.weighted_average_watts ?? null,
    max_watts: a.max_watts ?? null,
    kilojoules: a.kilojoules ?? null,
    device_watts: a.device_watts ?? null,
    calories: a.calories ?? null,
    gear_id: a.gear_id ?? null,
    description: a.description ?? null,
    sync_status: "detailed",
    synced_at: new Date().toISOString(),
  };

  const { error } = await supabase.from("activities").upsert(row);
  if (error) throw new Error(`Upsert failed: ${error.message}`);
}

async function recomputePersonalRecords() {
  const queries: Array<{ metric: string; sql: string }> = [
    {
      metric: "longest_run",
      sql: "SELECT id, distance_meters as value, start_date as achieved_at FROM activities WHERE type = 'Run' ORDER BY distance_meters DESC LIMIT 1",
    },
    {
      metric: "longest_ride",
      sql: "SELECT id, distance_meters as value, start_date as achieved_at FROM activities WHERE type = 'Ride' ORDER BY distance_meters DESC LIMIT 1",
    },
    {
      metric: "fastest_run_pace",
      sql: "SELECT id, average_speed_mps as value, start_date as achieved_at FROM activities WHERE type = 'Run' AND distance_meters > 1000 ORDER BY average_speed_mps DESC LIMIT 1",
    },
    {
      metric: "highest_suffer_score",
      sql: "SELECT id, suffer_score as value, start_date as achieved_at FROM activities WHERE suffer_score IS NOT NULL ORDER BY suffer_score DESC LIMIT 1",
    },
  ];

  for (const { metric, sql } of queries) {
    const { data } = await supabase.rpc("run_readonly_query", { query: sql });
    if (data && Array.isArray(data) && data.length > 0) {
      const row = data[0];
      await supabase.from("personal_records").upsert({
        metric,
        activity_id: row.id,
        value: row.value,
        achieved_at: row.achieved_at,
        updated_at: new Date().toISOString(),
      });
    }
  }
}
