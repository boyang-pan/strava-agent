-- ============================================================
-- Strava Agent — Database Schema
-- Run this in the Supabase SQL editor to set up all tables.
-- ============================================================

-- Activities mirror
CREATE TABLE IF NOT EXISTS activities (
  id                        bigint PRIMARY KEY,
  name                      text NOT NULL,
  type                      text NOT NULL,
  workout_type              int,
  start_date                timestamptz NOT NULL,
  distance_meters           float NOT NULL DEFAULT 0,
  moving_time_seconds       int NOT NULL DEFAULT 0,
  elapsed_time_seconds      int NOT NULL DEFAULT 0,
  elevation_gain_meters     float,
  average_heartrate         float,
  max_heartrate             float,
  average_speed_mps         float NOT NULL DEFAULT 0,
  max_speed_mps             float,
  suffer_score              int,
  perceived_exertion        int,
  average_watts             float,
  weighted_average_watts    int,
  max_watts                 int,
  kilojoules                float,
  device_watts              boolean,
  calories                  float,
  gear_id                   text,
  description               text,
  sync_status               text NOT NULL DEFAULT 'summary' CHECK (sync_status IN ('summary', 'detailed')),
  synced_at                 timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activities_start_date ON activities (start_date DESC);
CREATE INDEX IF NOT EXISTS idx_activities_type ON activities (type);

-- User-provided context (cross-session memory)
CREATE TABLE IF NOT EXISTS activity_notes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id bigint REFERENCES activities(id) ON DELETE SET NULL,
  note_date   date,
  content     text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_notes_activity_id ON activity_notes (activity_id);
CREATE INDEX IF NOT EXISTS idx_activity_notes_note_date ON activity_notes (note_date);

-- Pre-computed personal records
CREATE TABLE IF NOT EXISTS personal_records (
  metric      text PRIMARY KEY,
  activity_id bigint NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  value       float NOT NULL,
  achieved_at timestamptz NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Chat sessions
CREATE TABLE IF NOT EXISTS conversations (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title      text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Messages within sessions
CREATE TABLE IF NOT EXISTS messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role            text NOT NULL CHECK (role IN ('user', 'assistant')),
  content         jsonb NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages (conversation_id, created_at);

-- Agent traces (for future evals)
CREATE TABLE IF NOT EXISTS agent_traces (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
  question        text NOT NULL,
  plan            jsonb,
  tool_calls      jsonb,
  final_answer    text,
  turn_count      int,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- Postgres roles for read/write separation
-- NOTE: Run these as a superuser. Replace <password> with
-- strong passwords from your password manager.
-- ============================================================

-- Read-only role (used by run_query, get_activity_detail, get_personal_records, get_notes)
-- CREATE ROLE agent_readonly WITH LOGIN PASSWORD '<password>';
-- GRANT CONNECT ON DATABASE postgres TO agent_readonly;
-- GRANT USAGE ON SCHEMA public TO agent_readonly;
-- GRANT SELECT ON activities, activity_notes, personal_records TO agent_readonly;

-- Write role (used only by add_note)
-- CREATE ROLE agent_write WITH LOGIN PASSWORD '<password>';
-- GRANT CONNECT ON DATABASE postgres TO agent_write;
-- GRANT USAGE ON SCHEMA public TO agent_write;
-- GRANT SELECT ON activities, activity_notes TO agent_write;
-- GRANT INSERT ON activity_notes TO agent_write;

-- ============================================================
-- Helper function for run_query tool (service role only)
-- ============================================================
CREATE OR REPLACE FUNCTION run_readonly_query(query text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result jsonb;
BEGIN
  -- Basic safety check — only SELECT and WITH allowed
  IF NOT (
    trim(upper(query)) LIKE 'SELECT%' OR
    trim(upper(query)) LIKE 'WITH%'
  ) THEN
    RAISE EXCEPTION 'Only SELECT queries are permitted';
  END IF;

  EXECUTE 'SELECT jsonb_agg(row_to_json(t)) FROM (' || query || ') t' INTO result;
  RETURN COALESCE(result, '[]'::jsonb);
END;
$$;
