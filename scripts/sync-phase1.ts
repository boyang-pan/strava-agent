/**
 * Phase 1 — Fast sync
 * Fetches the activity list endpoint only (/athlete/activities, paginated).
 * Writes all activities with sync_status = 'summary' and computes personal records.
 *
 * Run: npx tsx scripts/sync-phase1.ts
 * Prerequisites: SUPABASE_SERVICE_ROLE_KEY, NEXT_PUBLIC_SUPABASE_URL, STRAVA_ACCESS_TOKEN in .env.local
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getValidAccessToken(): Promise<string> {
  // If you have a refresh token, exchange it for a fresh access token
  return process.env.STRAVA_ACCESS_TOKEN!;
}

async function fetchActivitiesPage(
  token: string,
  page: number,
  perPage = 200
): Promise<StravaActivitySummary[]> {
  const url = `https://www.strava.com/api/v3/athlete/activities?page=${page}&per_page=${perPage}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Strava API error: ${res.status} ${res.statusText}`);
  const remaining = res.headers.get("X-RateLimit-Usage");
  if (remaining) console.log(`Rate limit usage: ${remaining}`);
  return res.json();
}

function mapActivity(a: StravaActivitySummary) {
  return {
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
    kilojoules: a.kilojoules ?? null,
    device_watts: a.device_watts ?? null,
    gear_id: a.gear_id ?? null,
    sync_status: "summary" as const,
    synced_at: new Date().toISOString(),
  };
}

async function computePersonalRecords() {
  console.log("Computing personal records...");

  const records: Array<{ metric: string; sql: string }> = [
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
      metric: "highest_elevation_run",
      sql: "SELECT id, elevation_gain_meters as value, start_date as achieved_at FROM activities WHERE type = 'Run' ORDER BY elevation_gain_meters DESC LIMIT 1",
    },
    {
      metric: "highest_suffer_score",
      sql: "SELECT id, suffer_score as value, start_date as achieved_at FROM activities WHERE suffer_score IS NOT NULL ORDER BY suffer_score DESC LIMIT 1",
    },
  ];

  for (const { metric, sql } of records) {
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
      console.log(`  ✓ ${metric}`);
    }
  }
}

async function main() {
  console.log("=== Phase 1: Fast Sync ===\n");

  const token = await getValidAccessToken();
  console.log("Got access token\n");

  let page = 1;
  let totalSynced = 0;

  while (true) {
    console.log(`Fetching page ${page}...`);
    const activities = await fetchActivitiesPage(token, page);

    if (activities.length === 0) {
      console.log("No more activities.");
      break;
    }

    const rows = activities.map(mapActivity);
    const { error } = await supabase.from("activities").upsert(rows);
    if (error) {
      console.error(`Upsert error on page ${page}:`, error.message);
      break;
    }

    totalSynced += activities.length;
    console.log(`  Synced ${activities.length} activities (total: ${totalSynced})`);

    if (activities.length < 200) break;
    page++;

    // Small delay to be polite to the API
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log(`\nPhase 1 complete. ${totalSynced} activities synced.`);
  await computePersonalRecords();
  console.log("\nDone. Run sync-phase2.ts to backfill detail fields.");
}

main().catch(console.error);

// ---- Types ----

interface StravaActivitySummary {
  id: number;
  name: string;
  type: string;
  workout_type?: number;
  start_date: string;
  distance: number;
  moving_time: number;
  elapsed_time: number;
  total_elevation_gain: number;
  average_heartrate?: number;
  max_heartrate?: number;
  average_speed: number;
  max_speed: number;
  suffer_score?: number;
  perceived_exertion?: number;
  average_watts?: number;
  weighted_average_watts?: number;
  kilojoules?: number;
  device_watts?: boolean;
  gear_id?: string;
}
