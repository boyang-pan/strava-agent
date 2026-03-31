import * as dotenv from "dotenv";
import * as path from "path";

// Load .env.local from project root (same as Next.js does)
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

import { Eval, initFunction } from "braintrust";
import { createClient } from "@supabase/supabase-js";
import {
  schemaBeforeQuery,
  schemaLeadsToQuery,
  dateContextForTimeQuestions,
} from "./scorers";

type ToolCall = { tool: string; input: unknown; output: unknown; duration_ms: number };

type TraceRow = {
  question: string;
  plan: { steps: string[] } | null;
  tool_calls: ToolCall[] | null;
  final_answer: string | null;
  turn_count: number | null;
};

async function loadDataset() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { data, error } = await supabase
    .from("agent_traces")
    .select("question, plan, tool_calls, final_answer, turn_count")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    throw new Error(`Failed to load agent_traces: ${error.message}`);
  }

  return (data as TraceRow[]).map((row) => ({
    // Pack the full trace into input — the task echoes it as output,
    // which is what scorers read. Braintrust dataset items don't have
    // an "output" field, only input/expected/metadata.
    input: {
      question: row.question,
      tool_calls: row.tool_calls ?? [],
      final_answer: row.final_answer,
      plan: row.plan,
      turn_count: row.turn_count,
    },
  }));
}

Eval("strava-agent", {
  data: loadDataset,
  // Replay mode: output is already known. Task echoes input as output so
  // scorers can read it, and logs tool error metrics on the span.
  task: async (input, { span }) => {
    const toolCalls = (input as { tool_calls: Array<{ output: unknown }> }).tool_calls ?? [];
    const errorCount = toolCalls.filter((tc) => {
      const out = tc.output as Record<string, unknown> | null;
      return out !== null && typeof out === "object" && "error" in out;
    }).length;
    if (toolCalls.length > 0) {
      span.log({
        metrics: {
          tool_error_count: errorCount,
          tool_call_count: toolCalls.length,
        },
      });
    }
    return input;
  },
  scores: [
    schemaBeforeQuery,
    schemaLeadsToQuery,
    dateContextForTimeQuestions,
    initFunction({ projectName: "strava-agent", slug: "unitconversioninsql-dfca" }),
  ],
  experimentName: "phase1-deterministic-fixed-scorer",
  trialCount: 1,
});
