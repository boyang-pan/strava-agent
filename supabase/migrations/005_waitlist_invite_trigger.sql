-- Enable pg_net for HTTP calls from the database
create extension if not exists pg_net with schema extensions;

-- Function called when a waitlist row is updated to 'approved'
-- Replace the two placeholder values below before running this migration:
--   <SUPABASE_URL>          → e.g. https://bhmsnnoiddzwojiabeto.supabase.co
--   <INVITE_WEBHOOK_SECRET> → the secret you generated with: openssl rand -hex 32
create or replace function notify_waitlist_approved()
returns trigger as $$
begin
  if NEW.status = 'approved' and OLD.status != 'approved' then
    perform net.http_post(
      url     := 'https://bhmsnnoiddzwojiabeto.supabase.co/functions/v1/invite-approved-user',
      headers := json_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer 5802af35423522d58c9358d02907a5007bb5e1a433979fe09977285fd46abbaf'
      )::jsonb,
      body    := json_build_object('email', NEW.email)::jsonb
    );
  end if;
  return NEW;
end;
$$ language plpgsql security definer;

-- Trigger fires after each waitlist row update
create trigger on_waitlist_approved
  after update on waitlist
  for each row execute function notify_waitlist_approved();
