# PRD: Strava AI Agent

**Status:** Draft v6  
**Scope:** V1 — Single user, Strava activities only  
**Goal:** A personal AI agent that answers natural language questions about your Strava data, demonstrating agentic architecture for both personal use and as an interview portfolio piece.

---

## Problem

Strava surfaces some aggregate stats, but answering nuanced questions about your own training — *"Am I getting faster over time?", "Was last month my highest mileage month?", "Am I showing signs of overtraining?"* — requires manually digging through data or exporting CSVs. There's no conversational interface that reasons across your activity history, and there's no way to enrich objective metrics with subjective context.

---

## Goals

- Answer natural language questions about Strava activity data with multi-step reasoning
- Allow users to add subjective context (perceived effort, notes) that persists across sessions
- Keep architecture simple, hosted, and easy to demo
- Make the agent's reasoning process visible and inspectable
- Demonstrate understanding of agentic systems: planning, tool design, reasoning loops, memory, failure handling
- Build V1 in a way that makes adding evals straightforward later

### Non-goals (V1)
- Evals framework (designed for, not built in V1)
- Multi-user support
- Health/sleep/nutrition data
- Mobile app
- Social features (kudos, segments, leaderboards)
- Intent classification / query routing (future latency optimisation)

---

## How It Works

### Data Layer

**Supabase (Postgres)** stores a local mirror of your Strava activities plus user-provided context. Three mechanisms keep it in sync:

- **Initial sync:** A two-phase script run once on setup (see below).
- **Live sync:** Strava's Webhook Events API sends a POST to a Supabase Edge Function whenever a new activity is recorded. The function fetches the full `DetailedActivity`, upserts it with `sync_status = 'detailed'`, and recomputes personal records.
- **User notes:** Written by the agent via `add_note` when the user provides subjective context during a conversation.

#### Initial Sync — Two-Phase Approach

The Strava API enforces a read limit of **100 requests per 15 minutes, 1,000 per day**. The list endpoint returns up to 200 activities per page, but `calories`, `max_watts`, and `description` are only available on `DetailedActivity` — requiring one API call per activity. For a few years of training data that's hundreds of calls, which would exhaust the daily quota and block the app for days if done naively.

**Phase 1 — Fast sync (runs in minutes).** Fetches the activity list endpoint only (`/athlete/activities`, paginated). Returns most fields immediately — distance, time, pace, HR, average_watts, suffer_score, type, gear_id — enough to make the agent useful straight away. Activities are written with `sync_status = 'summary'`. Personal records are computed from this data.

**Phase 2 — Background enrichment (runs over 1–2 days).** A separate script calls `/activities/{id}` for each `summary` record to backfill detail fields (calories, max_watts, description). It reads the `X-RateLimit-Usage` and `X-RateLimit-Limit` response headers on every call and backs off automatically when approaching the 15-minute cap. Each enriched record is updated to `sync_status = 'detailed'`. This only ever needs to run once — all subsequent activities arrive via webhook already as `detailed`.

The app is fully usable after Phase 1. The agent acknowledges when detail fields like calories are still pending enrichment.

**Core table: `activities`**

| Column | Type | Notes |
|---|---|---|
| id | bigint | Strava activity ID |
| name | text | Activity name |
| type | text | Run, Ride, Swim, etc. |
| workout_type | int | nullable — Strava integer enum: 0 = default, 1 = race, 2 = long run, 3 = workout (run-specific); 10 = default ride, 11 = race ride, 12 = workout ride |
| start_date | timestamptz | |
| distance_meters | float | |
| moving_time_seconds | int | |
| elapsed_time_seconds | int | |
| elevation_gain_meters | float | |
| average_heartrate | float | nullable |
| max_heartrate | float | nullable |
| average_speed_mps | float | |
| max_speed_mps | float | |
| suffer_score | int | nullable — Strava's training load proxy |
| perceived_exertion | int | nullable — 1–10 if rated in Strava |
| average_watts | float | nullable — avg power incl. zeros (coasting) |
| weighted_average_watts | int | nullable — normalised power, better effort indicator |
| max_watts | int | nullable — peak power during the activity |
| kilojoules | float | nullable — total work done; ~1:1 ratio with calories |
| device_watts | boolean | nullable — true = power meter, false = Strava estimate |
| calories | float | nullable — kilocalories consumed; DetailedActivity only |
| gear_id | text | nullable |
| description | text | nullable — post-activity notes from Strava |
| sync_status | text | `summary` or `detailed` — indicates whether detail fields are populated |
| synced_at | timestamptz | |

**`activity_notes` table** — user-provided context that persists across sessions:

| Column | Type | Notes |
|---|---|---|
| id | uuid | |
| activity_id | bigint | nullable — links to a specific activity |
| note_date | date | nullable — links to a date range if no specific activity |
| content | text | The note itself |
| created_at | timestamptz | |

This is the memory layer. When a user says "that Tuesday run felt brutal, I was jet-lagged" mid-conversation, the agent writes this to `activity_notes` and it persists. Future conversations can retrieve it via `get_notes`. This enriches objective metrics with subjective experience over time.

**`personal_records` table** — pre-computed, updated on each sync:

| Column | Type | Notes |
|---|---|---|
| metric | text | e.g. `fastest_1k_run`, `longest_ride` |
| activity_id | bigint | The activity where this PR was set |
| value | float | The value |
| achieved_at | timestamptz | |
| updated_at | timestamptz | |

**`agent_traces` table** — exists from day one, used for future evals:

| Column | Type | Notes |
|---|---|---|
| id | uuid | |
| conversation_id | uuid | Foreign key to `conversations` — ties trace to a session |
| question | text | Original user question |
| plan | jsonb | Structured plan as JSON array of steps |
| tool_calls | jsonb | Array of `{ tool, input, output, duration_ms }` |
| final_answer | text | |
| turn_count | int | Number of tool calls made |
| created_at | timestamptz | |

---

### Agent Architecture

The agent has two phases per turn: **planning**, then **execution**.

#### Phase 1 — Planning

Before any tool calls, Claude produces a structured JSON plan:

```json
{
  "steps": [
    "Get today's date for period calculations",
    "Query weekly mileage aggregated by week for the past 12 weeks",
    "Query prior 12-week baseline for comparison",
    "Check activity notes for any relevant context in this period",
    "Identify peak week and trend direction"
  ]
}
```

The plan is a **flexible starting point, not a rigid script.** If a tool result reveals something unexpected mid-execution — e.g. heart rate data is sparse, a query returns an error, or a note changes the interpretation — Claude adapts its approach rather than continuing blindly. This is what makes it genuinely agentic rather than a dressed-up pipeline.

The plan serves multiple purposes:
- Steps map directly to the reasoning states shown in the UI
- Claude commits to an approach before executing, reducing wasted tool calls
- Structured JSON is assertable in evals — you can verify the agent planned correctly, not just that the final answer looks right
- Demonstrates a key agentic pattern clearly in interviews

#### Phase 2 — Execution (Tool-calling loop)

Claude executes the plan by calling tools in sequence. Each tool result is fed back into context. Claude continues until it has enough information to answer, then produces a final response.

**Failure handling:**
- SQL errors are returned to Claude as observations so it can self-correct
- A max of 10 tool calls prevents infinite loops
- If the limit is hit, Claude returns a partial answer with an explanation of what it was unable to determine

---

### Memory

Memory operates at two levels:

**Within-session:** Conversation history is passed with each API request (`{ question, history }`). The last N turns are included (default: 10). This gives Claude context within a single conversation — it knows what you've already discussed, what queries it's already run, and can build on prior answers without repeating work.

**Cross-session:** Handled via `activity_notes`. When a user provides subjective context — perceived effort, external factors, feelings about a workout — the agent writes it to the DB. This persists indefinitely and is retrieved in future conversations via `get_notes`. Over time this builds a richer training log that combines Strava's objective data with your subjective experience.

The `add_note` tool is also the first place the agent *writes* to the database, which is architecturally meaningful — the agent transitions from read-only analyst to an active collaborator in building your training log.

---

### Tools

| Tool | Purpose | Notes |
|---|---|---|
| `get_schema()` | Returns the DB schema | Always called first to orient the agent |
| `get_date_context()` | Returns today's date + day of week | Ensures correct period reasoning ("this week", "last month") |
| `run_query(sql)` | Executes a read-only SQL query | Read-only enforced at DB level via Postgres role — not just prompt |
| `get_activity_detail(id)` | Returns full detail for a single activity | Lets agent drill in when aggregates aren't enough |
| `get_personal_records()` | Returns pre-computed PRs from `personal_records` table | Avoids Claude writing complex window function SQL |
| `get_notes(date_range?)` | Returns activity notes, optionally filtered by date | Brings cross-session memory into context |
| `add_note(activity_id?, note_date?, content)` | Writes a user-provided note to `activity_notes` | The agent's write path — used when user provides subjective context |
| `render_chart(type, title, subtitle, data, x_key, y_key)` | Returns a typed chart payload for the frontend to render | Supported types: `line`, `bar`, `scatter`. Frontend renders inline using Recharts. |
| `ask_user(question)` | Asks a clarifying question mid-reasoning | Used when the question is genuinely ambiguous |

**Tool design rationale:** 9 tools, each with a clear non-overlapping purpose. `run_query` handles the long tail of arbitrary data questions. Specialised tools wrap cases where trusting Claude to write correct SQL is risky (`get_personal_records`) or structurally important (`add_note`, `get_notes`). The read/write split between `run_query` (read-only role) and `add_note` (separate write role) is enforced at the DB level.

---

### System Prompt

The system prompt is a first-class design artifact, not an afterthought. It shapes the agent's behaviour significantly and needs to cover:

- **Domain knowledge:** What key metrics mean (suffer score, ACWR, pace vs speed), how to interpret common training signals, appropriate caution around overtraining claims
- **Reasoning style:** Be specific with numbers, acknowledge data limitations honestly (e.g. sparse HR data), don't extrapolate beyond what the data supports
- **Note-writing behaviour:** When to proactively offer to save a note vs. when to just answer the question
- **Plan flexibility:** Deviate from the plan if tool results demand it; explain when you're doing so
- **Tone:** Direct and analytical, not motivational-poster energy

The system prompt should be version-controlled and iterated on — it's effectively a core part of the agent's behaviour alongside the code.

---

### Designing for Evals (Built In, Not Built Yet)

V1 doesn't ship an eval framework, but the architecture is designed so one can be added cleanly:

- **Structured agent responses** — every response has a consistent schema: `{ plan, states, final_answer }`. A judge model can evaluate each part independently.
- **`agent_traces` table** — all tool inputs, outputs, and durations are logged with structured metadata from day one. This becomes the trace data for evals.
- **Manual question bank** — keep a running `questions.json` file of real questions asked during development alongside their expected answer shapes. This becomes the eval dataset without extra effort.
- **Plan assertions** — because the plan is structured JSON, future evals can assert the agent chose the right tools in the right order for a given question type — not just that the final answer looks correct.

---

### Tech Stack

**Kept intentionally minimal.**

| Layer | Choice | Rationale |
|---|---|---|
| Frontend | React + shadcn/ui + Tailwind (zinc scale) | Clean, minimal, production-grade without overhead |
| Full-stack framework | Next.js (App Router) | Natural home for Vercel AI SDK; agent API route lives alongside the UI in one repo |
| Streaming / AI hooks | Vercel AI SDK v6 | Handles Claude tool-use streaming well; `useChat` maps naturally to the reasoning state UI. `ToolLoopAgent` and `streamText` handle the agent loop cleanly. Built-in DevTools for debugging multi-step flows. |
| Claude API | Anthropic SDK (via Vercel AI SDK provider) | Agent loop is explicit code — not hidden behind a framework. Owning the loop is the point. |
| Agent API route | Next.js API route (Vercel Fluid compute) | Purpose-built for agents: minimal cold starts, longer durations (up to 800s), background task support. Vercel AI SDK integrates natively. |
| Strava webhook handler | Supabase Edge Function | Webhook hits Supabase directly — no Vercel intermediary needed. |
| Database | Supabase Postgres | Hosted, fast, separate read-only and write roles for agent tools |
| Secrets | Vercel env vars + Supabase secrets | Strava OAuth tokens in Supabase; Anthropic API key in Vercel |

**Architecture split:** Vercel hosts the Next.js app (UI + agent loop API route). Supabase hosts the DB and the Strava webhook handler. Clean separation of concerns, each platform doing what it's best at.

**Single-user by design:** V1 has no auth layer. The app is deployed for one user (you). Strava OAuth tokens are stored as environment variables. There is no Row Level Security on the DB — it's not needed. Multi-tenant support is a clear V2 addition requiring Supabase Auth, RLS on all tables, and per-user token storage, but adds no value here.

---

### Sessions

Conversations are organised into named sessions. Each session is an isolated context window — starting a new session resets the conversational context while cross-session memory (activity notes) persists regardless.

**Session management:**
- Sidebar lists past sessions grouped by Today / This week / Earlier
- Each session shows an auto-generated title and timestamp. Titles are generated by a silent background API call fired after the first agent response completes — fire-and-forget, does not block the stream. Claude is prompted to return a 3–5 word summary of the conversation topic.
- Active session highlighted in `bg-zinc-100`
- "New conversation" button at the top of the sidebar starts a fresh session
- Sessions stored in Supabase:

  **`conversations`** table: `id uuid`, `title text`, `created_at timestamptz`

  **`messages`** table: `id uuid`, `conversation_id uuid`, `role text` (`user` | `assistant`), `content jsonb` (structured — stores plan, reasoning states, chart payloads, and prose for agent messages; plain text for user messages), `created_at timestamptz`

---

### Reasoning UI

Each agent response surfaces as a sequence of **named states** — high-level descriptions of what the agent is doing at each step. States stream in as the agent executes. Each is expandable to reveal the full tool call and result for that step.

**Example states:**
- `Checking today's date and calendar context`
- `Reading the database schema`
- `Querying weekly mileage for the past 12 weeks`
- `Checking for notes from this period`
- `Querying prior 12-week baseline`
- `Saving note about Tuesday's run`

Collapsed view gives a scannable audit trail. Expanded view gives full transparency — tool name, input parameters, raw result. Deliberate UX tradeoff: AI systems that show their work build user trust without requiring users to read every token.

---

### Charts

When the agent's answer is better expressed visually, it calls `render_chart` instead of (or alongside) prose. The tool returns a typed JSON payload; the frontend renders it inline as a chart component using Recharts.

**Tool:** `render_chart(type, title, subtitle, data, x_key, y_key, x_label?, y_label?)`

**Supported chart types in V1:** `line` (trends over time), `bar` (period comparisons), `scatter` (correlations e.g. pace vs HR).

**Rendering:** Charts appear inline within the message thread, full width of the centred chat column. `border border-zinc-200 rounded-lg p-5`. Monochrome — zinc shades only, no colour series. Hover tooltips on data points show exact values in IBM Plex Mono. The `render_chart` tool call appears in the expandable reasoning states like any other tool — showing the data payload passed to it.

**Chart type examples:**
- "Am I getting faster?" → `line` chart of average pace per month
- "What was my biggest training block?" → `bar` chart of weekly mileage
- "Does HR correlate with pace?" → `scatter` chart

---

### Frontend Design

Monochrome design system: black, white, and zinc greys only. No colour accents. Typography and spacing carry the entire visual hierarchy.

**Stack:** Next.js App Router, shadcn/ui, Tailwind (`zinc` scale), lucide-react icons, DM Sans via Google Fonts (body), IBM Plex Mono for tool output and chart values. Recharts for chart rendering.

**Layout: sidebar + centred chat column**

```
┌─────────────────────────────────────────────────────┐
│  ┌──────────┐  ┌──────────────────────────────────┐ │
│  │ [logo]   │  │  Session title              6t   │ │
│  │          │  │──────────────────────────────────│ │
│  │ + New    │  │                                  │ │
│  │──────────│  │    ┌── max-w-2xl mx-auto ──┐     │ │
│  │ Today    │  │    │                       │     │ │
│  │ ● Oct tr │  │    │  reasoning states     │     │ │
│  │          │  │    │  [chart]              │     │ │
│  │ This wk  │  │    │  agent answer         │     │ │
│  │  Overtr  │  │    │                       │     │ │
│  │  Weekly  │  │    │  ┌─ user bubble ────┐ │     │ │
│  │          │  │    │  └──────────────────┘ │     │ │
│  │ Earlier  │  │    └───────────────────────┘     │ │
│  │  Post-r  │  │                                  │ │
│  │  Marath  │  │    ┌── max-w-2xl mx-auto ──┐     │ │
│  │          │  │    │ Ask about training [→]│     │ │
│  │──────────│  │    └───────────────────────┘     │ │
│  │ [avatar] │  │                                  │ │
│  └──────────┘  └──────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

**Sidebar** (`w-60`, `border-r border-zinc-100`):
- Logo mark + "Strava Agent" wordmark at top
- "New conversation" button: `border border-zinc-200`, ghost style, `Plus` icon
- Session list: grouped Today / This week / Earlier with `text-xs text-zinc-400 uppercase tracking-wide` group labels
- Session item: title in `text-sm text-zinc-700`, timestamp in `text-xs text-zinc-400`, active state `bg-zinc-100 text-zinc-900 font-medium`
- Footer: avatar initial + name + activity count

**Chat area:**
- Header: session title + turn count, `border-b border-zinc-100`
- Messages: scrollable, content constrained to `max-w-2xl mx-auto px-6`
- User messages: right-aligned, `bg-zinc-900 text-white rounded-2xl rounded-tr-sm`
- Agent responses: left-aligned, reasoning states → optional chart → prose answer
- Input: same `max-w-2xl mx-auto px-6` constraint as messages — aligns perfectly with content above. `border border-zinc-200 rounded-lg`, focus state `border-zinc-400`. Send button `text-zinc-400 hover:text-zinc-900`
- Footer hint below input: `"Notes from past conversations are always remembered."` in `text-xs text-zinc-400`

**Empty state (new conversation):**
- Centred vertically, `ActivityIcon` in `text-zinc-200`
- Heading: "Ask about your training" — `text-base font-semibold text-zinc-900`
- Subtext: "Your training notes carry over between conversations." — `text-sm text-zinc-400`
- 4 example prompt chips in a 2×2 grid — `border border-zinc-200 rounded-md`, ghost hover

**Reasoning state rows:**
- `border border-zinc-100 rounded-md`
- Collapsed: chevron + status icon + label
- Expanded: `border-t border-zinc-100 bg-zinc-50` panel showing tool name, input, result in IBM Plex Mono
- Status icons: `Loader2` (spinning) while active, `Check` when done — both `text-zinc-400`
- No colour for status — icons only

---

## Technical Architecture

```
User (browser)
     │
     ▼
Next.js App (Vercel)
  React Chat UI  ←──  Vercel AI SDK useChat (streaming)
     │
     │  POST /api/agent  { question, history (last 10 turns) }
     ▼
Next.js API Route  (Vercel Fluid compute — agent loop)
     │
     ├─ Phase 1: Claude produces structured JSON plan
     │
     └─ Phase 2: Vercel AI SDK ToolLoopAgent (max 10 steps)
              │
              ├── get_schema()              ──► Supabase DB
              ├── get_date_context()
              ├── run_query(sql)            ──► Supabase DB (read-only role)
              ├── get_activity_detail(id)   ──► Supabase DB
              ├── get_personal_records()    ──► Supabase DB
              ├── get_notes(date_range?)    ──► Supabase DB
              ├── add_note(...)             ──► Supabase DB (write role)
              ├── render_chart(...)         ──► returns chart payload to UI
              └── ask_user(question)        ──► streams back to UI
              │
              └── logs to agent_traces table (Supabase DB)

Strava API
     │  Webhook (new activity event)
     ▼
Supabase Edge Function  (sync handler)
     │  — upserts activity
     │  — recomputes personal_records
     ▼
Supabase DB
```

---

## Example Interactions

> **"Am I getting faster at running over the past 3 months?"**
> Plan: get date context → query monthly average pace for runs → check notes for relevant context → compare months → identify trend
> Answer: specific numbers, trend direction, surfaces any relevant notes (e.g. injury period)

> **"That Tuesday run was rough — I was jet-lagged from a work trip."**
> Plan: get date context → identify Tuesday's activity → offer to save note
> Action: writes note to `activity_notes` linked to that activity
> Answer: confirms the note is saved, optionally contextualises it against the activity data

> **"Do I show any signs of overtraining?"**
> Plan: get date context → query recent activity frequency + suffer scores + HR trend → get notes for recent period → synthesise
> Answer: nuanced response across multiple signals including subjective context, not a simple yes/no

> **"How does my performance change after rest days?"**
> Plan: identify rest days → query activity immediately after each → compute avg pace/HR → compare to non-rest activities → check notes for context
> Answer: quantified difference with honest caveats about sample size

---

## V1 Scope

### In scope
- Strava OAuth + two-phase initial sync script (Phase 1 fast sync + Phase 2 background enrichment with rate-limit awareness)
- Supabase DB with `activities`, `activity_notes`, `personal_records`, `agent_traces`, `conversations`, and `messages` tables
- Supabase Edge Function for Strava webhook (live sync + personal records recompute)
- Next.js app with agent API route (Vercel Fluid compute)
- Agent loop: structured JSON planning phase + Vercel AI SDK tool-calling execution
- 9 tools as specified
- Read-only and write Postgres roles enforced at DB level
- Within-session memory via conversation history (last 10 turns)
- Cross-session memory via `activity_notes` + `get_notes` / `add_note`
- System prompt as a versioned, iterated artifact
- Chat UI with sidebar session management (session list, new conversation, auto-generated titles)
- Streaming reasoning states (expandable)
- Inline chart rendering via Recharts (`line`, `bar`, `scatter`)
- Empty state with example prompts on first load
- Structured agent response schema `{ plan, states, final_answer }`
- `questions.json` question bank maintained during development

### Out of scope (V1)
- Evals framework
- Intent classification / query routing
- Activity types beyond Run/Ride
- Natural language goal setting
- Push notifications / proactive insights
- Multi-user
- Export / sharing
