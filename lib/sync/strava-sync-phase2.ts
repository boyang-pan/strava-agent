/**
 * Per-user Strava Phase 2 sync — detailed activity enrichment.
 * Backfills calories, max_watts, description for all summary activities.
 * Rate-limit aware: backs off at 85% of 100 req/15-min and stops at 85% of 1000 req/day.
 * Safe to interrupt and re-trigger — only processes sync_status='summary' rows.
 */
import { supabaseAdmin } from "@/lib/supabase/client";
import { refreshStravaToken } from "./strava-sync";

const RATE_LIMIT_15MIN = 100;
const RATE_LIMIT_DAILY = 1000;
const BACKOFF_THRESHOLD = 0.85;

interface StravaSegmentEffort {
  id: number;
  segment: { id: number };
  name: string;
  elapsed_time: number;
  moving_time: number;
  start_date: string;
  distance: number;
  average_watts?: number | null;
  average_heartrate?: number | null;
  max_heartrate?: number | null;
  average_cadence?: number | null;
  pr_rank?: number | null;
  kom_rank?: number | null;
  achievements?: unknown[];
}

function parseRateLimitUsage(header: string | null): { used: number; limit: number } {
  if (!header) return { used: 0, limit: RATE_LIMIT_15MIN };
  const [used, limit] = header.split(",").map(Number);
  return { used, limit };
}

async function fetchDetailedActivity(token: string, activityId: number) {
  const res = await fetch(`https://www.strava.com/api/v3/activities/${activityId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 429) return { error: "rate_limited" as const, rateLimitUsage: null, segmentEfforts: [] };
  if (!res.ok) return { error: `${res.status}` as const, rateLimitUsage: null, segmentEfforts: [] };

  const data = await res.json();
  return {
    error: null,
    fields: {
      calories: data.calories ?? null,
      max_watts: data.max_watts ?? null,
      description: data.description ?? null,
    },
    segmentEfforts: (data.segment_efforts ?? []) as StravaSegmentEffort[],
    rateLimitUsage: res.headers.get("X-RateLimit-Usage"),
  };
}

export async function syncStravaActivitiesPhase2(userId: string): Promise<void> {
  // Create a sync job row for progress tracking
  const { data: job, error: jobError } = await supabaseAdmin
    .from("strava_sync_jobs")
    .insert({ user_id: userId, phase: 2, status: "running" })
    .select()
    .single();

  if (jobError || !job) {
    console.error(`[sync-p2] failed to create job for user ${userId}:`, jobError);
    return;
  }

  const updateJob = (fields: Record<string, unknown>) =>
    supabaseAdmin
      .from("strava_sync_jobs")
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq("id", job.id);

  try {
    // Fetch all summary (not yet enriched) activities for this user
    const [{ data: summaryActivities, error }, { count: alreadyDone }] = await Promise.all([
      supabaseAdmin
        .from("activities")
        .select("id")
        .eq("user_id", userId)
        .eq("sync_status", "summary")
        .order("start_date", { ascending: false }),
      supabaseAdmin
        .from("activities")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("sync_status", "detailed"),
    ]);

    if (error) throw new Error(`Failed to fetch summary activities: ${error.message}`);
    if (!summaryActivities || summaryActivities.length === 0) {
      await updateJob({ status: "completed", total: alreadyDone ?? 0, synced: alreadyDone ?? 0 });
      return;
    }

    // Use cumulative totals so the progress bar continues from where it left off
    const alreadySynced = alreadyDone ?? 0;
    const total = alreadySynced + summaryActivities.length;
    await updateJob({ total, synced: alreadySynced });

    let synced = alreadySynced;
    let dailyUsed = 0;
    // Refresh token once at the start; will re-refresh if it expires mid-run
    let accessToken = await refreshStravaToken(userId);

    for (const { id: activityId } of summaryActivities) {
      if (dailyUsed >= RATE_LIMIT_DAILY * BACKOFF_THRESHOLD) {
        console.log(`[sync-p2] user ${userId}: approaching daily limit, stopping. Re-trigger tomorrow.`);
        break;
      }

      const result = await fetchDetailedActivity(accessToken, activityId as number);

      if (result.error === "rate_limited") {
        console.log(`[sync-p2] user ${userId}: 15-min rate limit hit, sleeping 15m...`);
        await new Promise((r) => setTimeout(r, 15 * 60 * 1000));
        // Refresh token after long sleep
        accessToken = await refreshStravaToken(userId);
        continue;
      }

      if (result.error) {
        console.warn(`[sync-p2] user ${userId}: activity ${activityId} error ${result.error}`);
        continue;
      }

      // Check 15-min rate limit usage and back off if approaching threshold
      if (result.rateLimitUsage) {
        const { used, limit } = parseRateLimitUsage(result.rateLimitUsage);
        dailyUsed++;
        if (used >= limit * BACKOFF_THRESHOLD) {
          console.log(`[sync-p2] user ${userId}: rate limit ${used}/${limit}, sleeping 60s...`);
          await new Promise((r) => setTimeout(r, 60 * 1000));
        }
      }

      await supabaseAdmin
        .from("activities")
        .update({
          ...result.fields,
          sync_status: "detailed",
          synced_at: new Date().toISOString(),
        })
        .eq("user_id", userId)
        .eq("id", activityId);

      if (result.segmentEfforts.length > 0) {
        const rows = result.segmentEfforts.map((se) => ({
          id: se.id,
          user_id: userId,
          activity_id: activityId as number,
          segment_id: se.segment.id,
          name: se.name,
          elapsed_time: se.elapsed_time,
          moving_time: se.moving_time,
          start_date: se.start_date,
          distance: se.distance,
          average_watts: se.average_watts ?? null,
          average_heartrate: se.average_heartrate ?? null,
          max_heartrate: se.max_heartrate ?? null,
          average_cadence: se.average_cadence ?? null,
          pr_rank: se.pr_rank ?? null,
          kom_rank: se.kom_rank ?? null,
          achievements: se.achievements ? JSON.stringify(se.achievements) : null,
        }));
        const { error: seError } = await supabaseAdmin
          .from("segment_efforts")
          .upsert(rows, { onConflict: "user_id,id" });
        if (seError) console.warn(`[sync-p2] segment efforts error for activity ${activityId}:`, seError.message);
      }

      synced++;

      // Update progress every 10 activities
      if (synced % 10 === 0) {
        await updateJob({ synced });
      }

      await new Promise((r) => setTimeout(r, 300));
    }

    await updateJob({ status: "completed", synced, total });
    console.log(`[sync-p2] user ${userId}: done — ${synced}/${total} enriched`);
  } catch (err) {
    console.error(`[sync-p2] user ${userId} failed:`, err);
    await updateJob({ status: "failed", error: String(err) });
  }
}
