import { getAuthUser } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabase/client";

export async function DELETE() {
  const user = await getAuthUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await supabaseAdmin.auth.admin.deleteUser(user.id);
  if (error) {
    console.error("[account] delete user failed:", error);
    return Response.json({ error: "Failed to delete account" }, { status: 500 });
  }

  return Response.json({ ok: true });
}
