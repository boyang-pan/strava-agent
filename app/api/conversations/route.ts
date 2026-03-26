import { supabaseAdmin } from "@/lib/supabase/client";

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("conversations")
    .select("id, title, created_at")
    .order("created_at", { ascending: false });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json(data);
}

export async function POST() {
  const { data, error } = await supabaseAdmin
    .from("conversations")
    .insert({ title: null })
    .select()
    .single();

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json(data, { status: 201 });
}
