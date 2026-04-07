-- Migration 007: Add rate_limited status to strava_sync_jobs
ALTER TABLE strava_sync_jobs
  DROP CONSTRAINT strava_sync_jobs_status_check,
  ADD CONSTRAINT strava_sync_jobs_status_check
    CHECK (status IN ('running', 'completed', 'failed', 'rate_limited'));
