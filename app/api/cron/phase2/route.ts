import { headers } from "next/headers";
import { supabaseAdmin } from "@/lib/supabase/client";
import { syncStravaActivitiesPhase2Batch } from "@/lib/sync/strava-sync-phase2";

const BATCH_SIZE = 80;
// Skip a user if their job was updated within the last 10 minutes —
// another invocation is likely still mid-batch.
const LOCK_WINDOW_MS = 10 * 60 * 1000;

export async function GET() {
  const authHeader = (await headers()).get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: pendingUsers, error } = await supabaseAdmin.rpc(
    "get_users_with_pending_phase2"
  );

  if (error) {
    console.error("[cron-p2] failed to get pending users:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }

  const results: unknown[] = [];

  for (const { user_id } of pendingUsers ?? []) {
    // Lock check: don't re-enter if another invocation is actively running
    const { data: activeJob } = await supabaseAdmin
      .from("strava_sync_jobs")
      .select("updated_at")
      .eq("user_id", user_id)
      .eq("phase", 2)
      .eq("status", "running")
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (activeJob) {
      const age = Date.now() - new Date(activeJob.updated_at).getTime();
      if (age < LOCK_WINDOW_MS) {
        results.push({ user_id, skipped: true, reason: "locked" });
        continue;
      }
    }

    try {
      const result = await syncStravaActivitiesPhase2Batch(user_id, BATCH_SIZE);
      results.push({ user_id, ...result });
    } catch (err) {
      console.error(`[cron-p2] batch failed for user ${user_id}:`, err);
      results.push({ user_id, error: String(err) });
    }
  }

  return Response.json({ ok: true, processed_users: results.length, results });
}
