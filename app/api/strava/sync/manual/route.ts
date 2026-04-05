import { getAuthUser } from "@/lib/supabase/server";
import { syncNewActivities } from "@/lib/sync/strava-sync";

export async function POST() {
  const user = await getAuthUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { newActivities } = await syncNewActivities(user.id);
    return Response.json({ newActivities });
  } catch (err) {
    console.error(`[sync-manual] failed for user ${user.id}:`, err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
