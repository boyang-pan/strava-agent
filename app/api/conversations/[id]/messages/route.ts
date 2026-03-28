import { supabaseAdmin } from "@/lib/supabase/client";

// POST /api/conversations/[id]/messages
// Body: { messages: Array<{ role: "user" | "assistant"; content: unknown }> }
// Inserts messages in order, preserving conversation turn sequence.
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const { messages } = await request.json();

  if (!Array.isArray(messages) || messages.length === 0) {
    return Response.json({ error: "messages array required" }, { status: 400 });
  }

  // Insert sequentially so created_at order matches turn order
  for (const msg of messages) {
    const { error } = await supabaseAdmin.from("messages").insert({
      conversation_id: id,
      role: msg.role,
      content: msg.content,
    });
    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }
  }

  return new Response(null, { status: 204 });
}
