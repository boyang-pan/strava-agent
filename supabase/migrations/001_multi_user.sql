-- ============================================================
-- Migration 001: Multi-user support
--
-- Run this in the Supabase SQL editor AFTER clearing existing
-- single-user data (or on a fresh project).
--
-- Steps:
--   1. Drop old tables (clears single-user data)
--   2. Recreate tables with user_id columns
--   3. Add strava_connections table
--   4. Enable RLS + policies
--   5. Update run_readonly_query to accept p_user_id
-- ============================================================

-- ============================================================
-- 1. Drop old tables (order matters due to FKs)
-- ============================================================
DROP TABLE IF EXISTS agent_traces CASCADE;
DROP TABLE IF EXISTS messages CASCADE;
DROP TABLE IF EXISTS conversations CASCADE;
DROP TABLE IF EXISTS personal_records CASCADE;
DROP TABLE IF EXISTS activity_notes CASCADE;
DROP TABLE IF EXISTS activities CASCADE;
DROP TABLE IF EXISTS strava_connections CASCADE;

-- ============================================================
-- 2. Recreate tables with user_id
-- ============================================================

CREATE TABLE activities (
  id                        bigint NOT NULL,
  user_id                   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
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
  synced_at                 timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id)
);

CREATE INDEX idx_activities_start_date ON activities (user_id, start_date DESC);
CREATE INDEX idx_activities_type ON activities (user_id, type);

CREATE TABLE activity_notes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  activity_id bigint,
  note_date   date,
  content     text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (user_id, activity_id) REFERENCES activities(user_id, id) ON DELETE SET NULL
);

CREATE INDEX idx_activity_notes_user_id ON activity_notes (user_id);
CREATE INDEX idx_activity_notes_activity_id ON activity_notes (user_id, activity_id);
CREATE INDEX idx_activity_notes_note_date ON activity_notes (user_id, note_date);

CREATE TABLE personal_records (
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  metric      text NOT NULL,
  activity_id bigint NOT NULL,
  value       float NOT NULL,
  achieved_at timestamptz NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, metric),
  FOREIGN KEY (user_id, activity_id) REFERENCES activities(user_id, id) ON DELETE CASCADE
);

CREATE TABLE conversations (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title      text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_conversations_user_id ON conversations (user_id, created_at DESC);

CREATE TABLE messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role            text NOT NULL CHECK (role IN ('user', 'assistant')),
  content         jsonb NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_messages_conversation_id ON messages (conversation_id, created_at);

CREATE TABLE agent_traces (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  conversation_id uuid REFERENCES conversations(id) ON DELETE SET NULL,
  question        text NOT NULL,
  plan            jsonb,
  tool_calls      jsonb,
  final_answer    text,
  turn_count      int,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 3. Strava connections (OAuth tokens per user)
-- ============================================================

CREATE TABLE strava_connections (
  user_id          uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  athlete_id       bigint NOT NULL UNIQUE,
  access_token     text NOT NULL,
  refresh_token    text NOT NULL,
  token_expires_at timestamptz NOT NULL,
  scope            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- 4. Row Level Security
-- ============================================================

ALTER TABLE activities        ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_notes    ENABLE ROW LEVEL SECURITY;
ALTER TABLE personal_records  ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations     ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages          ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_traces      ENABLE ROW LEVEL SECURITY;
ALTER TABLE strava_connections ENABLE ROW LEVEL SECURITY;

-- Activities: users see only their own
CREATE POLICY "users_own_activities" ON activities
  FOR ALL USING (auth.uid() = user_id);

-- Activity notes: users see only their own
CREATE POLICY "users_own_activity_notes" ON activity_notes
  FOR ALL USING (auth.uid() = user_id);

-- Personal records: users see only their own
CREATE POLICY "users_own_personal_records" ON personal_records
  FOR ALL USING (auth.uid() = user_id);

-- Conversations: users see only their own
CREATE POLICY "users_own_conversations" ON conversations
  FOR ALL USING (auth.uid() = user_id);

-- Messages: users see messages in their own conversations
CREATE POLICY "users_own_messages" ON messages
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = conversation_id AND c.user_id = auth.uid()
    )
  );

-- Agent traces: users see only their own
CREATE POLICY "users_own_agent_traces" ON agent_traces
  FOR ALL USING (auth.uid() = user_id);

-- Strava connections: users see only their own
CREATE POLICY "users_own_strava_connections" ON strava_connections
  FOR ALL USING (auth.uid() = user_id);

-- ============================================================
-- 5. Updated run_readonly_query (accepts p_user_id for scoping)
-- ============================================================

CREATE OR REPLACE FUNCTION run_readonly_query(query text, p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result jsonb;
BEGIN
  -- Safety check — only SELECT and WITH allowed
  IF NOT (
    trim(upper(query)) LIKE 'SELECT%' OR
    trim(upper(query)) LIKE 'WITH%'
  ) THEN
    RAISE EXCEPTION 'Only SELECT queries are permitted';
  END IF;

  -- Set user context so callers can reference it if needed
  PERFORM set_config('app.current_user_id', p_user_id::text, true);

  EXECUTE 'SELECT jsonb_agg(row_to_json(t)) FROM (' || query || ') t' INTO result;
  RETURN COALESCE(result, '[]'::jsonb);
END;
$$;
