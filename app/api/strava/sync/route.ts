import { syncStravaActivities } from "@/lib/sync/strava-sync";
import { type NextRequest } from "next/server";

/**
 * POST /api/strava/sync
 *
 * Called server-to-server from the OAuth callback to kick off an initial sync.
 * Authenticated via a shared secret (SYNC_SECRET env var) so it can be called
 * without forwarding user cookies.
 */
export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-sync-secret") ?? "";
  const syncSecret = process.env.SYNC_SECRET ?? "";

  if (syncSecret && secret !== syncSecret) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const userId = request.headers.get("x-sync-user-id");
  const accessToken = request.headers.get("x-sync-access-token");

  if (!userId || !accessToken) {
    return Response.json({ error: "Missing user_id or access_token" }, { status: 400 });
  }

  // Run sync in background — return immediately so the OAuth callback redirect is fast
  syncStravaActivities(userId, accessToken).catch((err) =>
    console.error(`[sync] failed for user ${userId}:`, err)
  );

  return Response.json({ status: "syncing" });
}
