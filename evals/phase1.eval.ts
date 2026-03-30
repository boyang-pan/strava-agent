import * as dotenv from "dotenv";
import * as path from "path";

// Load .env.local from project root (same as Next.js does)
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

import { Eval } from "braintrust";
import { createClient } from "@supabase/supabase-js";
import {
  schemaBeforeQuery,
  schemaLeadsToQuery,
  dateContextForTimeQuestions,
  unitConversionInSQL,
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
  // Replay mode: output is already known. Task is identity — returns
  // the trace data so scorers can read it from `output`.
  task: async (input) => input,
  scores: [schemaBeforeQuery, schemaLeadsToQuery, dateContextForTimeQuestions, unitConversionInSQL],
  experimentName: "phase1-deterministic",
  trialCount: 1,
});
