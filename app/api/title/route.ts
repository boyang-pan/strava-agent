import { anthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import { supabaseAdmin } from "@/lib/supabase/client";

export async function POST(request: Request) {
  const { conversation_id, question, answer } = await request.json();

  if (!conversation_id || !question) {
    return Response.json({ error: "Missing required fields" }, { status: 400 });
  }

  try {
    const { text } = await generateText({
      model: anthropic("claude-haiku-4-5-20251001"),
      prompt: `Summarise this training question in 3–5 words for a conversation title. Return only the title, no quotes or punctuation.\n\nQuestion: ${question}\nAnswer preview: ${(answer ?? "").slice(0, 200)}`,
    });

    const title = text.trim().slice(0, 60);

    await supabaseAdmin
      .from("conversations")
      .update({ title })
      .eq("id", conversation_id);

    return Response.json({ title });
  } catch {
    return Response.json({ error: "Title generation failed" }, { status: 500 });
  }
}
