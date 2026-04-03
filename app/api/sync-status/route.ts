import { getAuthUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/client";

export async function GET() {
  const user = await getAuthUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const [{ data: jobs }, { data: latestActivity }] = await Promise.all([
    supabaseAdmin
      .from("strava_sync_jobs")
      .select("phase, status, total, synced, error, started_at, updated_at")
      .eq("user_id", user.id)
      .order("started_at", { ascending: false }),
    supabaseAdmin
      .from("activities")
      .select("synced_at")
      .eq("user_id", user.id)
      .order("synced_at", { ascending: false })
      .limit(1)
      .single(),
  ]);

  const phase1 = jobs?.find((j) => j.phase === 1) ?? null;
  const phase2 = jobs?.find((j) => j.phase === 2) ?? null;

  return Response.json({ phase1, phase2, lastActivitySyncedAt: latestActivity?.synced_at ?? null });
}
