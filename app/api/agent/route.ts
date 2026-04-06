import { anthropic } from "@ai-sdk/anthropic";
import { streamText, generateObject, stepCountIs } from "ai";
import { z } from "zod";
import { createAgentTools } from "@/lib/agent/tools";
import { SYSTEM_PROMPT } from "@/lib/agent/system-prompt";
import { supabaseAdmin } from "@/lib/supabase/client";
import { getAuthUser } from "@/lib/supabase/server";
import { logger } from "@/lib/braintrust";

export const maxDuration = 300; // Vercel Pro max

const planSchema = z.object({
  steps: z.array(z.string()).describe("Ordered list of steps the agent will take"),
});

export async function POST(request: Request) {
  try {
    const user = await getAuthUser();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { question, history, conversation_id } = await request.json();

    const userId = user.id;
    const firstName = user.user_metadata?.first_name as string | undefined;
    const agentTools = createAgentTools(userId);
    const systemPrompt = `${SYSTEM_PROMPT}\n\n${firstName ? `The user's first name is ${firstName}. ` : ""}Current user ID: ${userId}. Always include WHERE user_id = '${userId}' in every SQL query.`;

    const span = logger.startSpan({ name: "agent-turn" });

    // Phase 1 — produce a structured plan before any tool calls
    let plan: { steps: string[] } = { steps: [] };
    const planSpan = span.startSpan({ name: "plan" });
    try {
      const { object } = await generateObject({
        model: anthropic("claude-sonnet-4-6"),
        schema: planSchema,
        system: systemPrompt,
        messages: [
          ...(history ?? []),
          {
            role: "user",
            content: `Before answering the following question, produce a structured JSON plan listing the steps you will take (tool calls in order). Do NOT call any tools yet — just plan.\n\nQuestion: ${question}`,
          },
        ],
      });
      plan = object;
      planSpan.log({ input: question, output: plan.steps });
    } catch (planErr) {
      console.error("Planning phase failed:", planErr);
    } finally {
      planSpan.end();
    }

    const toolCalls: Array<{
      tool: string;
      input: unknown;
      output: unknown;
      duration_ms: number;
    }> = [];

    // Phase 2 config — shared across retry attempts
    const answerSpan = span.startSpan({ name: "answer" });
    const phase2Config = {
      model: anthropic("claude-sonnet-4-6"),
      system: systemPrompt,
      messages: [
        ...(history ?? []),
        { role: "user" as const, content: question },
      ],
      tools: agentTools,
      stopWhen: stepCountIs(20),
      onStepFinish: ({ toolCalls: stepToolCalls, toolResults }: { toolCalls: Array<{ toolName: string; input: unknown }>; toolResults: Array<{ output: unknown }> }) => {
        stepToolCalls.forEach((tc, i) => {
          const toolSpan = answerSpan.startSpan({ name: `tool:${tc.toolName}` });
          toolSpan.log({
            input: tc.input,
            output: toolResults[i]?.output ?? null,
          });
          toolSpan.end();

          toolCalls.push({
            tool: tc.toolName,
            input: tc.input,
            output: toolResults[i]?.output ?? null,
            duration_ms: 0,
          });
        });
      },
      onFinish: async ({
        text,
        finishReason,
        steps,
        usage,
      }: {
        text: string;
        finishReason: string;
        steps: unknown[];
        usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
      }) => {
        console.log(`[agent] finished — reason: ${finishReason}, steps: ${steps.length}, answer_length: ${text.length}`);

        const toolErrorCount = toolCalls.filter((tc) => {
          const out = tc.output as Record<string, unknown> | null;
          return out !== null && typeof out === "object" && "error" in out;
        }).length;

        answerSpan.log({
          input: question,
          output: text,
          metrics: {
            prompt_tokens: usage?.inputTokens,
            completion_tokens: usage?.outputTokens,
            tokens: usage?.totalTokens,
            tool_error_count: toolErrorCount,
            tool_call_count: toolCalls.length,
          },
        });
        answerSpan.end();

        span.log({
          input: question,
          metadata: {
            finishReason,
            stepCount: steps.length,
            toolNames: toolCalls.map((tc) => tc.tool),
            plan: plan.steps,
          },
        });
        span.end();
        await logger.flush();

        if (!conversation_id) return;
        await supabaseAdmin.from("agent_traces").insert({
          user_id: userId,
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

        // Retry loop — Anthropic returns overloaded_error (529) and rate_limit_error (429) transiently
        const maxAttempts = 3;
        let lastErr: unknown;
        let incompleteResponse = false;
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          if (attempt > 0) {
            console.log(`[agent] retrying Phase 2 (attempt ${attempt + 1})...`);
            await new Promise((r) => setTimeout(r, 2000 * attempt));
          }
          try {
            const result = streamText(phase2Config);
            let hasToolResults = false;
            let textSinceLastToolResult = false;
            for await (const chunk of result.fullStream) {
              let line: string | null = null;

              if (chunk.type === "text-delta") {
                textSinceLastToolResult = true;
                line = `0:${JSON.stringify(chunk.text)}\n`;
              } else if (chunk.type === "tool-call") {
                let parsedInput: unknown = chunk.input;
                try { parsedInput = JSON.parse(chunk.input as string); } catch {}
                line = `9:${JSON.stringify({ toolName: chunk.toolName, args: parsedInput })}\n`;
              } else if (chunk.type === "tool-result") {
                hasToolResults = true;
                textSinceLastToolResult = false;
                line = `a:${JSON.stringify({ result: chunk.output })}\n`;
              } else if (chunk.type === "finish") {
                // If the stream ended after tool calls but without a final answer,
                // the model was likely cut off (e.g. by a silent rate limit failure).
                if (hasToolResults && !textSinceLastToolResult) {
                  incompleteResponse = true;
                } else {
                  line = `d:{}\n`;
                }
              }

              if (line) controller.enqueue(encoder.encode(line));
            }
            lastErr = null;
            break; // success
          } catch (err) {
            lastErr = err;
            const msg = err instanceof Error ? err.message : String(err);
            const isTransient =
              msg.toLowerCase().includes("overload") ||
              msg.includes("529") ||
              msg.toLowerCase().includes("rate_limit") ||
              msg.includes("429");
            console.error(`[agent] Phase 2 attempt ${attempt + 1} failed:`, msg);
            if (!isTransient) break; // don't retry non-transient errors
          }
        }

        if (lastErr || incompleteResponse) {
          const errMsg = incompleteResponse
            ? "The response was cut off before a final answer was produced (likely a rate limit). Please try again."
            : (lastErr instanceof Error && lastErr.message) ||
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
