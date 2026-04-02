-- Migration 003: Segment efforts
-- Zero additional API calls — extracted from the Phase 2 detailed activity response.

CREATE TABLE segment_efforts (
  id                bigint NOT NULL,
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  activity_id       bigint NOT NULL,
  segment_id        bigint NOT NULL,
  name              text NOT NULL,
  elapsed_time      int NOT NULL,       -- seconds (wall clock)
  moving_time       int NOT NULL,       -- seconds moving
  start_date        timestamptz NOT NULL,
  distance          float NOT NULL,     -- meters
  average_watts     float,
  average_heartrate float,
  max_heartrate     float,
  average_cadence   float,
  pr_rank           int,                -- 1/2/3 if top-3 PR at time of activity; null otherwise
  kom_rank          int,                -- populated only if top-10 KOM; null otherwise
  achievements      jsonb,              -- [{type_id, type, rank}, ...]
  PRIMARY KEY (user_id, id),
  FOREIGN KEY (user_id, activity_id) REFERENCES activities(user_id, id) ON DELETE CASCADE
);

CREATE INDEX idx_segment_efforts_segment_id
  ON segment_efforts (user_id, segment_id, start_date DESC);

CREATE INDEX idx_segment_efforts_activity_id
  ON segment_efforts (user_id, activity_id);

ALTER TABLE segment_efforts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_segment_efforts" ON segment_efforts
  FOR ALL USING (auth.uid() = user_id);
