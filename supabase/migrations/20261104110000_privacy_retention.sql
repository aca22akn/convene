-- Expand-only privacy controls for event AI policy and attendee opt-out.
alter table public.events
  add column if not exists ai_enabled boolean not null default false;

alter table public.members
  add column if not exists ai_opt_out boolean not null default false;

create index if not exists events_created_at_retention_idx on public.events(created_at);
create index if not exists rate_limits_window_start_idx on public.rate_limits(window_start);
