-- Expand-only abuse controls. The shared event lock is reused by the intro commit migration.
alter table public.events
  add column if not exists member_cap integer not null default 200;

do $$ begin
  alter table public.events add constraint events_member_cap_positive check (member_cap > 0);
exception when duplicate_object then null; end $$;

create table if not exists public.rate_limits (
  key text not null,
  window_start timestamptz not null,
  count integer not null check (count > 0),
  primary key (key, window_start)
);
alter table public.rate_limits enable row level security;
revoke all on public.rate_limits from anon, authenticated;
grant all on public.rate_limits to service_role;

create or replace function public.convene_lock_event(p_event uuid)
returns void
language sql
security definer
set search_path = pg_catalog, public
as $$
  select pg_advisory_xact_lock(hashtextextended(p_event::text, 730219));
$$;
revoke all on function public.convene_lock_event(uuid) from public, anon, authenticated;
grant execute on function public.convene_lock_event(uuid) to service_role;

create or replace function public.rate_limit_hit(p_key text, p_limit integer, p_window_seconds integer)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_window_start timestamptz;
  v_count integer;
begin
  if p_key is null or length(p_key) = 0 or length(p_key) > 240
    or p_limit < 1 or p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception 'invalid rate limit arguments' using errcode = '22023';
  end if;
  v_window_start := to_timestamp(floor(extract(epoch from clock_timestamp()) / p_window_seconds) * p_window_seconds);
  insert into public.rate_limits(key, window_start, count)
  values (p_key, v_window_start, 1)
  on conflict (key, window_start) do update
    set count = public.rate_limits.count + 1
  returning count into v_count;

  -- Bound stale rows opportunistically; the retention job performs full cleanup.
  if random() < 0.01 then
    delete from public.rate_limits where window_start < clock_timestamp() - interval '2 days';
  end if;
  return v_count <= p_limit;
end;
$$;
revoke all on function public.rate_limit_hit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, integer, integer) to service_role;

create or replace function public.enforce_event_member_cap()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_cap integer;
  v_count integer;
begin
  perform public.convene_lock_event(new.event_id);
  select member_cap into v_cap from public.events where id = new.event_id;
  if v_cap is null then
    raise exception 'event not found' using errcode = '23503';
  end if;
  select count(*) into v_count from public.members where event_id = new.event_id;
  if v_count >= v_cap then
    raise exception 'room_full' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_event_member_cap() from public, anon, authenticated;
drop trigger if exists members_enforce_event_cap on public.members;
create trigger members_enforce_event_cap
before insert on public.members
for each row execute function public.enforce_event_member_cap();
