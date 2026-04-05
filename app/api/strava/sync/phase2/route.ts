import { getAuthUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/client";
import { syncStravaActivitiesPhase2 } from "@/lib/sync/strava-sync-phase2";

const STALE_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

export async function POST() {
  const user = await getAuthUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  // Guard: don't start a second Phase 2 if one is actively running (updated recently)
  const { data: existingJob } = await supabaseAdmin
    .from("strava_sync_jobs")
    .select("status, updated_at")
    .eq("user_id", user.id)
    .eq("phase", 2)
    .order("started_at", { ascending: false })
    .limit(1)
    .single();

  if (existingJob?.status === "running") {
    const age = Date.now() - new Date(existingJob.updated_at).getTime();
    if (age < STALE_THRESHOLD_MS) {
      return Response.json({ error: "Phase 2 sync is already running" }, { status: 409 });
    }
  }

  syncStravaActivitiesPhase2(user.id).catch((err) =>
    console.error(`[sync-p2] resume failed for user ${user.id}:`, err)
  );

  return Response.json({ status: "resuming" });
}
