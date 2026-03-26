/**
 * Phase 2 — Background enrichment
 * Calls /activities/{id} for each summary record to backfill detail fields:
 * calories, max_watts, description. Rate-limit aware — backs off automatically.
 *
 * Run: npx tsx scripts/sync-phase2.ts
 * This runs over 1–2 days depending on activity count. Safe to interrupt and restart.
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const RATE_LIMIT_15MIN = 100;
const RATE_LIMIT_DAILY = 1000;
const BACKOFF_THRESHOLD = 0.85; // Back off when usage hits 85% of limit

async function getValidAccessToken(): Promise<string> {
  const res = await fetch("https://www.strava.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.STRAVA_CLIENT_ID,
      client_secret: process.env.STRAVA_CLIENT_SECRET,
      refresh_token: process.env.STRAVA_REFRESH_TOKEN,
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  return data.access_token ?? process.env.STRAVA_ACCESS_TOKEN!;
}

function parseRateLimit(header: string | null): { used: number; limit: number } {
  if (!header) return { used: 0, limit: RATE_LIMIT_15MIN };
  const [used, limit] = header.split(",").map(Number);
  return { used, limit };
}

async function fetchDetailedActivity(token: string, id: number): Promise<{
  data?: DetailedActivityFields;
  rateLimitUsage?: string;
  rateLimitLimit?: string;
  error?: string;
}> {
  const res = await fetch(`https://www.strava.com/api/v3/activities/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 429) return { error: "rate_limited" };
  if (!res.ok) return { error: `${res.status}` };

  const data = await res.json();
  return {
    data: {
      calories: data.calories ?? null,
      max_watts: data.max_watts ?? null,
      description: data.description ?? null,
    },
    rateLimitUsage: res.headers.get("X-RateLimit-Usage") ?? undefined,
    rateLimitLimit: res.headers.get("X-RateLimit-Limit") ?? undefined,
  };
}

async function main() {
  console.log("=== Phase 2: Background Enrichment ===\n");

  const token = await getValidAccessToken();

  // Get all summary activities
  const { data: summaryActivities, error } = await supabase
    .from("activities")
    .select("id")
    .eq("sync_status", "summary")
    .order("start_date", { ascending: false });

  if (error) {
    console.error("Failed to fetch summary activities:", error.message);
    process.exit(1);
  }

  console.log(`Found ${summaryActivities.length} activities to enrich.\n`);

  let enriched = 0;
  let dailyUsed = 0;

  for (const { id } of summaryActivities) {
    if (dailyUsed >= RATE_LIMIT_DAILY * BACKOFF_THRESHOLD) {
      console.log("Approaching daily rate limit. Stopping for today. Re-run tomorrow.");
      break;
    }

    const result = await fetchDetailedActivity(token, id);

    if (result.error === "rate_limited") {
      console.log("Hit 15-min rate limit. Sleeping 15 minutes...");
      await new Promise((r) => setTimeout(r, 15 * 60 * 1000));
      continue;
    }

    if (result.error) {
      console.warn(`  ✗ Activity ${id}: ${result.error}`);
      continue;
    }

    // Check 15-min rate limit
    if (result.rateLimitUsage) {
      const { used, limit } = parseRateLimit(result.rateLimitUsage);
      dailyUsed++;

      if (used >= limit * BACKOFF_THRESHOLD) {
        const sleepSeconds = 60;
        console.log(`  Rate limit at ${used}/${limit}. Sleeping ${sleepSeconds}s...`);
        await new Promise((r) => setTimeout(r, sleepSeconds * 1000));
      }
    }

    await supabase
      .from("activities")
      .update({
        ...result.data,
        sync_status: "detailed",
        synced_at: new Date().toISOString(),
      })
      .eq("id", id);

    enriched++;
    if (enriched % 10 === 0) {
      console.log(`  Enriched ${enriched}/${summaryActivities.length}...`);
    }

    // Polite delay between requests
    await new Promise((r) => setTimeout(r, 300));
  }

  console.log(`\nPhase 2 complete. ${enriched} activities enriched.`);
}

main().catch(console.error);

interface DetailedActivityFields {
  calories: number | null;
  max_watts: number | null;
  description: string | null;
}
