-- Migration 002: Sync progress tracking
CREATE TABLE strava_sync_jobs (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  phase      int NOT NULL CHECK (phase IN (1, 2)),
  status     text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),
  total      int,
  synced     int NOT NULL DEFAULT 0,
  error      text,
  started_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE strava_sync_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_sync_jobs" ON strava_sync_jobs
  FOR ALL USING (auth.uid() = user_id);

CREATE INDEX idx_sync_jobs_user_id ON strava_sync_jobs (user_id, phase, started_at DESC);
