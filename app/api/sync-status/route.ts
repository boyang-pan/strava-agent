import { supabaseAdmin } from "@/lib/supabase/client";

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("activities")
    .select("synced_at")
    .order("synced_at", { ascending: false })
    .limit(1)
    .single();

  if (error || !data) return Response.json({ lastSyncedAt: null });
  return Response.json({ lastSyncedAt: data.synced_at });
}
