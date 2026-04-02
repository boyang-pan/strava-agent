import { tool } from "ai";
import { z } from "zod";
import { supabaseAdmin } from "@/lib/supabase/client";
import type { ChartPayload } from "@/types";

/**
 * Factory that creates agent tools scoped to a specific user.
 * All DB queries are filtered by userId.
 */
export function createAgentTools(userId: string) {
  return {
    get_schema: tool({
      description:
        "Returns the database schema including all tables and column definitions. Always call this first to orient yourself.",
      inputSchema: z.object({}),
      execute: async () => {
        return {
          tables: {
            activities: {
              description: "Mirror of Strava activities (scoped to current user)",
              columns: {
                id: "bigint — Strava activity ID",
                user_id: "uuid — owner (always filter by this)",
                name: "text — Activity name",
                type: "text — Run, Ride, Swim, etc.",
                workout_type:
                  "int nullable — 0=default run, 1=race, 2=long run, 3=workout; 10=default ride, 11=race ride, 12=workout ride",
                start_date: "timestamptz",
                distance_meters: "float",
                moving_time_seconds: "int",
                elapsed_time_seconds: "int",
                elevation_gain_meters: "float",
                average_heartrate: "float nullable",
                max_heartrate: "float nullable",
                average_speed_mps: "float — convert to min/km: 1000/(speed*60)",
                max_speed_mps: "float",
                suffer_score: "int nullable",
                perceived_exertion: "int nullable — 1-10",
                average_watts: "float nullable",
                weighted_average_watts: "int nullable — normalised power",
                max_watts: "int nullable",
                kilojoules: "float nullable",
                device_watts: "boolean nullable — true=power meter",
                calories: "float nullable — DetailedActivity only",
                gear_id: "text nullable",
                description: "text nullable — DetailedActivity only",
                sync_status: "text — summary or detailed",
                synced_at: "timestamptz",
              },
            },
            activity_notes: {
              description: "User-provided subjective context, persists across sessions",
              columns: {
                id: "uuid",
                user_id: "uuid — owner",
                activity_id: "bigint nullable — FK to activities",
                note_date: "date nullable",
                content: "text",
                created_at: "timestamptz",
              },
            },
            personal_records: {
              description: "Pre-computed personal records, updated on each sync",
              columns: {
                user_id: "uuid — owner",
                metric: "text — e.g. fastest_run_pace, longest_ride",
                activity_id: "bigint — FK to activities",
                value: "float",
                achieved_at: "timestamptz",
                updated_at: "timestamptz",
              },
            },
            segment_efforts: {
              description:
                "One row per segment effort per activity. Use segment_id to group all efforts on the same " +
                "Strava segment across activities. Useful for: progression over time, PRs, most-ridden segments.",
              columns: {
                id: "bigint — Strava segment effort ID",
                user_id: "uuid — always filter by this",
                activity_id: "bigint — FK to activities.id",
                segment_id: "bigint — Strava segment ID; group by this to see all efforts on one segment",
                name: "text — segment name (consistent per segment_id, denormalised for display)",
                elapsed_time: "int — seconds on segment (wall clock)",
                moving_time: "int — seconds moving on segment",
                start_date: "timestamptz — when this effort started",
                distance: "float — meters",
                average_watts: "float nullable",
                average_heartrate: "float nullable",
                max_heartrate: "float nullable",
                average_cadence: "float nullable",
                pr_rank: "int nullable — 1/2/3 if top-3 personal best at time of activity",
                kom_rank: "int nullable — rank if top-10 KOM at time of activity",
                achievements: "jsonb nullable — [{type_id, type, rank}]; use achievements @> '[{\"type\":\"pr\"}]' to filter PRs",
              },
            },
          },
        };
      },
    }),

    get_date_context: tool({
      description:
        "Returns today's date and day of week. Always call this before any time-based queries to ensure correct period reasoning.",
      inputSchema: z.object({}),
      execute: async () => {
        const now = new Date();
        return {
          today: now.toISOString().split("T")[0],
          day_of_week: now.toLocaleDateString("en-US", { weekday: "long" }),
          iso_week_start: getWeekStart(now),
          month_start: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`,
        };
      },
    }),

    run_query: tool({
      description:
        "Executes a read-only SQL query against the activities database. Use for all data retrieval. SQL must be SELECT only — no mutations. Always include WHERE user_id = '" + userId + "' to scope results to the current user.",
      inputSchema: z.object({
        sql: z
          .string()
          .describe("The SQL query to execute. Must be a SELECT statement."),
      }),
      execute: async ({ sql }: { sql: string }) => {
        if (!isSafeQuery(sql)) {
          return { error: "Only SELECT statements are permitted." };
        }
        const start = Date.now();
        try {
          const { data, error } = await supabaseAdmin.rpc("run_readonly_query", {
            query: sql,
            p_user_id: userId,
          });
          if (error) return { error: error.message };
          return {
            rows: data,
            row_count: Array.isArray(data) ? data.length : 0,
            duration_ms: Date.now() - start,
          };
        } catch (err) {
          return { error: String(err) };
        }
      },
    }),

    get_activity_detail: tool({
      description:
        "Returns full details for a single activity by ID. Use when you need to drill into a specific activity beyond what aggregates provide.",
      inputSchema: z.object({
        activity_id: z.number().describe("The Strava activity ID"),
      }),
      execute: async ({ activity_id }: { activity_id: number }) => {
        const { data, error } = await supabaseAdmin
          .from("activities")
          .select("*")
          .eq("user_id", userId)
          .eq("id", activity_id)
          .single();
        if (error) return { error: error.message };
        return data;
      },
    }),

    get_personal_records: tool({
      description:
        "Returns all pre-computed personal records from the personal_records table. Use this instead of computing PRs from raw data.",
      inputSchema: z.object({}),
      execute: async () => {
        const { data, error } = await supabaseAdmin
          .from("personal_records")
          .select("metric, value, achieved_at, activities(name, type, start_date)")
          .eq("user_id", userId)
          .order("metric");
        if (error) return { error: error.message };
        return data;
      },
    }),

    get_notes: tool({
      description:
        "Returns activity notes (user-provided subjective context). Use to retrieve cross-session memory. Optionally filter by date range.",
      inputSchema: z.object({
        start_date: z
          .string()
          .optional()
          .describe("ISO date string (YYYY-MM-DD) — start of date range"),
        end_date: z
          .string()
          .optional()
          .describe("ISO date string (YYYY-MM-DD) — end of date range"),
      }),
      execute: async ({ start_date, end_date }: { start_date?: string; end_date?: string }) => {
        let query = supabaseAdmin
          .from("activity_notes")
          .select("*, activities(name, type, start_date)")
          .eq("user_id", userId)
          .order("created_at", { ascending: false });

        if (start_date) query = query.gte("note_date", start_date);
        if (end_date) query = query.lte("note_date", end_date);

        const { data, error } = await query;
        if (error) return { error: error.message };
        return data;
      },
    }),

    add_note: tool({
      description:
        "Writes a user-provided note to the activity_notes table. Only call this after the user has explicitly provided subjective context to save.",
      inputSchema: z.object({
        content: z.string().describe("The note content to save"),
        activity_id: z
          .number()
          .optional()
          .describe("Strava activity ID to link this note to, if applicable"),
        note_date: z
          .string()
          .optional()
          .describe("ISO date (YYYY-MM-DD) to associate this note with"),
      }),
      execute: async ({ content, activity_id, note_date }: { content: string; activity_id?: number; note_date?: string }) => {
        const { data, error } = await supabaseAdmin
          .from("activity_notes")
          .insert({
            user_id: userId,
            content,
            activity_id: activity_id ?? null,
            note_date: note_date ?? null,
          })
          .select()
          .single();
        if (error) return { error: error.message };
        return { success: true, note: data };
      },
    }),

    render_chart: tool({
      description:
        "Returns a chart payload for the frontend to render inline. Use when trends or comparisons are better expressed visually. Supported types: line, bar, scatter.",
      inputSchema: z.object({
        type: z.enum(["line", "bar", "scatter"]).describe("Chart type"),
        title: z.string().describe("Chart title"),
        subtitle: z.string().optional().describe("Optional subtitle"),
        data: z
          .array(z.record(z.string(), z.union([z.string(), z.number()])))
          .describe("Array of data point objects"),
        x_key: z.string().describe("Key in data objects to use for x-axis"),
        y_key: z.string().describe("Key in data objects to use for y-axis"),
        x_label: z.string().optional().describe("X-axis label"),
        y_label: z.string().optional().describe("Y-axis label"),
      }),
      execute: async (params) => {
        return params as ChartPayload;
      },
    }),

    ask_user: tool({
      description:
        "Asks the user a clarifying question mid-reasoning. Only use when the question is genuinely ambiguous and the answer would materially change your analysis.",
      inputSchema: z.object({
        question: z
          .string()
          .describe("The clarifying question to ask the user"),
      }),
      execute: async ({ question }: { question: string }) => {
        return { question, awaiting_response: true };
      },
    }),
  };
}

function isSafeQuery(sql: string): boolean {
  const stripped = sql.replace(/^(\s*--[^\n]*\n)+/g, "").trim();
  const normalized = stripped.toUpperCase();
  if (!normalized.startsWith("SELECT") && !normalized.startsWith("WITH")) {
    return false;
  }
  const forbidden = ["INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "CREATE", "TRUNCATE", "GRANT", "REVOKE"];
  return !forbidden.some((kw) => new RegExp(`\\b${kw}\\b`).test(normalized));
}

function getWeekStart(date: Date): string {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d.toISOString().split("T")[0];
}
