import { anthropic } from "@ai-sdk/anthropic";
import { streamText, generateObject, stepCountIs } from "ai";
import { z } from "zod";
import { agentTools } from "@/lib/agent/tools";
import { SYSTEM_PROMPT } from "@/lib/agent/system-prompt";
import { supabaseAdmin } from "@/lib/supabase/client";

export const maxDuration = 800;

const planSchema = z.object({
  steps: z.array(z.string()).describe("Ordered list of steps the agent will take"),
});

export async function POST(request: Request) {
  try {
    const { question, history, conversation_id } = await request.json();

    // Phase 1 — produce a structured plan before any tool calls
    let plan: { steps: string[] } = { steps: [] };
    try {
      const { object } = await generateObject({
        model: anthropic("claude-opus-4-6"),
        schema: planSchema,
        system: SYSTEM_PROMPT,
        messages: [
          ...(history ?? []),
          {
            role: "user",
            content: `Before answering the following question, produce a structured JSON plan listing the steps you will take (tool calls in order). Do NOT call any tools yet — just plan.\n\nQuestion: ${question}`,
          },
        ],
      });
      plan = object;
    } catch (planErr) {
      console.error("Planning phase failed:", planErr);
    }

    const toolCalls: Array<{
      tool: string;
      input: unknown;
      output: unknown;
      duration_ms: number;
    }> = [];

    // Phase 2 config — shared across retry attempts
    // Inject the Phase 1 plan as a synthetic assistant prefill so the model
    // skips re-planning and proceeds directly to tool calls.
    const planPrefill =
      plan.steps.length > 0
        ? [
            {
              role: "assistant" as const,
              content: `My plan:\n${plan.steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}\n\nExecuting now.`,
            },
          ]
        : [];

    const phase2Config = {
      model: anthropic("claude-opus-4-6"),
      system: SYSTEM_PROMPT,
      messages: [
        ...(history ?? []),
        { role: "user" as const, content: question },
        ...planPrefill,
      ],
      tools: agentTools,
      stopWhen: stepCountIs(20),
      onStepFinish: ({ toolCalls: stepToolCalls, toolResults }: { toolCalls: Array<{ toolName: string; input: unknown }>; toolResults: Array<{ output: unknown }> }) => {
        stepToolCalls.forEach((tc, i) => {
          toolCalls.push({
            tool: tc.toolName,
            input: tc.input,
            output: toolResults[i]?.output ?? null,
            duration_ms: 0,
          });
        });
      },
      onFinish: async ({ text, finishReason, steps }: { text: string; finishReason: string; steps: unknown[] }) => {
        console.log(`[agent] finished — reason: ${finishReason}, steps: ${steps.length}, answer_length: ${text.length}`);
        if (!conversation_id) return;
        await supabaseAdmin.from("agent_traces").insert({
          conversation_id,
          question,
          plan,
          tool_calls: toolCalls,
          final_answer: text,
          turn_count: toolCalls.length,
        });
      },
    };

    // Build a custom stream that emits our protocol lines so the client
    // can parse both tool-call events and text deltas in real time.
    // Protocol:
    //   0:"text chunk"          — text delta
    //   9:{toolName, args}      — tool call start
    //   a:{result}              — tool result
    //   d:{}                    — stream done
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        // Emit plan as the first stream line so the client can show pending steps immediately
        if (plan.steps.length > 0) {
          controller.enqueue(
            encoder.encode(`p:${JSON.stringify({ steps: plan.steps })}\n`)
          );
        }

        // Retry loop — Anthropic returns overloaded_error transiently
        const maxAttempts = 3;
        let lastErr: unknown;
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          if (attempt > 0) {
            console.log(`[agent] retrying Phase 2 (attempt ${attempt + 1})...`);
            await new Promise((r) => setTimeout(r, 2000 * attempt));
          }
          try {
            const result = streamText(phase2Config);
            for await (const chunk of result.fullStream) {
              let line: string | null = null;

              if (chunk.type === "text-delta") {
                line = `0:${JSON.stringify(chunk.text)}\n`;
              } else if (chunk.type === "tool-call") {
                let parsedInput: unknown = chunk.input;
                try { parsedInput = JSON.parse(chunk.input as string); } catch {}
                line = `9:${JSON.stringify({ toolName: chunk.toolName, args: parsedInput })}\n`;
              } else if (chunk.type === "tool-result") {
                line = `a:${JSON.stringify({ result: chunk.output })}\n`;
              } else if (chunk.type === "finish") {
                line = `d:{}\n`;
              }

              if (line) controller.enqueue(encoder.encode(line));
            }
            lastErr = null;
            break; // success
          } catch (err) {
            lastErr = err;
            const msg = err instanceof Error ? err.message : String(err);
            const isOverloaded = msg.toLowerCase().includes("overload") || msg.includes("529");
            console.error(`[agent] Phase 2 attempt ${attempt + 1} failed:`, msg);
            if (!isOverloaded) break; // don't retry non-transient errors
          }
        }

        if (lastErr) {
          const errMsg =
            (lastErr instanceof Error && lastErr.message) ||
            (typeof lastErr === "object" && lastErr !== null && "responseBody" in lastErr
              ? String((lastErr as Record<string, unknown>).responseBody).slice(0, 200)
              : null) ||
            "The AI service is currently overloaded. Please try again in a moment.";
          try {
            controller.enqueue(encoder.encode(`e:${JSON.stringify({ message: errMsg })}\n`));
          } catch {}
        }

        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Agent-Plan": Buffer.from(JSON.stringify(plan)).toString("base64"),
      },
    });
  } catch (err) {
    console.error("Agent route error:", err);
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
