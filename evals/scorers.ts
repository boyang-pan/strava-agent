type ToolCall = { tool: string; input: unknown; output: unknown; duration_ms: number };

type TraceOutput = {
  question: string;
  tool_calls: ToolCall[];
  final_answer: string | null;
  plan: { steps: string[] } | null;
  turn_count: number | null;
};

// In replay mode, input IS the trace (task echoes it as output).
// Scorers read from output; input.question is used for regex-gating.
type ScorerArgs = { input: TraceOutput; output: TraceOutput };

// 1. get_schema must appear before first run_query
export function schemaBeforeQuery({ output }: ScorerArgs): number | null {
  const tools = output.tool_calls.map((tc) => tc.tool);
  const firstSchema = tools.indexOf("get_schema");
  const firstQuery = tools.indexOf("run_query");
  if (firstQuery === -1) return null; // no run_query in this trace, rule doesn't apply
  if (firstSchema === -1) return 0; // queried without ever calling get_schema
  return firstSchema < firstQuery ? 1 : 0;
}

// 2. If get_schema was called, at least one data-fetching tool must follow.
// Catches the "inspects schema, never queries" silent failure.
const DATA_TOOLS = new Set(["run_query", "get_personal_records", "get_activity_detail"]);

export function schemaLeadsToQuery({ output }: ScorerArgs): number | null {
  const tools = output.tool_calls.map((tc) => tc.tool);
  if (!tools.includes("get_schema")) return null; // schema wasn't called, rule doesn't apply
  return tools.some((t) => DATA_TOOLS.has(t)) ? 1 : 0;
}

// 3. Time-scoped questions must call get_date_context.
// Matches: "last week/month/year", "this month", "past N days", "yesterday", "recently", etc.
const TIME_RE =
  /\b(last|this|past|previous)\s+(week|month|year|season)|yesterday|recent(ly)?|\d+\s+(days?|weeks?|months?)\s+ago/i;

export function dateContextForTimeQuestions({ input, output }: ScorerArgs): number | null {
  if (!TIME_RE.test(input.question)) return null;
  const tools = output.tool_calls.map((tc) => tc.tool);
  return tools.includes("get_date_context") ? 1 : 0;
}

// 4. Pace/speed questions must use the m/s → min/km conversion formula in SQL.
// Formula: 1000 / (average_speed_mps * 60)
// Regex checks for the two key numeric parts: `1000 /` and `/ 60`.
const PACE_QUESTION_RE = /\b(pace|fast|slow|speed|min\/km|split|per\s+km|per\s+mile)\b/i;
const CONVERSION_RE = /1000\s*\/|\/\s*60/;

export function unitConversionInSQL({ input, output }: ScorerArgs): number | null {
  if (!PACE_QUESTION_RE.test(input.question)) return null;

  const queries = output.tool_calls
    .filter((tc) => tc.tool === "run_query")
    .map((tc) => (tc.input as { sql: string }).sql ?? "");

  // If the agent answered a pace question without run_query (e.g. via get_personal_records), skip.
  if (queries.length === 0) return null;

  return queries.some((sql) => CONVERSION_RE.test(sql)) ? 1 : 0;
}
