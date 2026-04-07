CREATE OR REPLACE FUNCTION get_users_with_pending_phase2()
RETURNS TABLE(user_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT DISTINCT a.user_id
  FROM activities a
  WHERE a.sync_status = 'summary'
$$;
