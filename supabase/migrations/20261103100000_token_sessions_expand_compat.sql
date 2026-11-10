-- Reconcile installations that recorded the earlier token expand migration
-- before its compatibility defaults and triggers were added.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

alter table public.communities add column if not exists admin_token_hash text;
alter table public.events add column if not exists admin_token_hash text;

with candidate_communities as (
  select id,
         encode(extensions.digest(admin_token, 'sha256'), 'hex') as token_hash,
         row_number() over (partition by encode(extensions.digest(admin_token, 'sha256'), 'hex') order by id) as token_rank
  from public.communities
  where admin_token_hash is null and admin_token is not null
)
update public.communities as community
set admin_token_hash = candidate.token_hash
from candidate_communities as candidate
where candidate.id = community.id
  and candidate.token_rank = 1
  and not exists (
    select 1 from public.communities as existing
    where existing.admin_token_hash = candidate.token_hash
  );

update public.events as event
set admin_token_hash = null
where exists (
  select 1 from public.communities as community
  where community.admin_token_hash = event.admin_token_hash
);

with candidate_events as (
  select id,
         encode(extensions.digest(admin_token, 'sha256'), 'hex') as token_hash,
         row_number() over (partition by encode(extensions.digest(admin_token, 'sha256'), 'hex') order by id) as token_rank
  from public.events
  where admin_token_hash is null and admin_token is not null
)
update public.events as event
set admin_token_hash = candidate.token_hash
from candidate_events as candidate
where candidate.id = event.id
  and candidate.token_rank = 1
  and not exists (
    select 1 from public.events as existing
    where existing.admin_token_hash = candidate.token_hash
  )
  and not exists (
    select 1 from public.communities as community
    where community.admin_token_hash = candidate.token_hash
  );

with ranked_communities as (
  select id, row_number() over (partition by admin_token_hash order by id) as token_rank
  from public.communities
  where admin_token_hash is not null
)
update public.communities as community
set admin_token_hash = null
from ranked_communities as ranked
where ranked.id = community.id
  and ranked.token_rank > 1;

update public.events as event
set admin_token_hash = null
where exists (
  select 1 from public.communities as community
  where community.admin_token_hash = event.admin_token_hash
);

with ranked_events as (
  select id, row_number() over (partition by admin_token_hash order by id) as token_rank
  from public.events
  where admin_token_hash is not null
)
update public.events as event
set admin_token_hash = null
from ranked_events as ranked
where ranked.id = event.id
  and ranked.token_rank > 1;

create unique index if not exists communities_admin_token_hash_idx on public.communities(admin_token_hash) where admin_token_hash is not null;
create unique index if not exists events_admin_token_hash_idx on public.events(admin_token_hash) where admin_token_hash is not null;

alter table public.communities alter column admin_token drop not null;
alter table public.events alter column admin_token drop not null;
alter table public.communities alter column admin_token set default replace(gen_random_uuid()::text, '-', '');
alter table public.events alter column admin_token set default replace(gen_random_uuid()::text, '-', '');

create or replace function public.sync_admin_token_hash()
returns trigger
language plpgsql
set search_path = public, extensions
as $$
begin
  if tg_op = 'INSERT' then
    if new.admin_token_hash is not null then
      new.admin_token := null;
    elsif new.admin_token is not null then
      new.admin_token_hash := encode(extensions.digest(new.admin_token, 'sha256'), 'hex');
    end if;
    return new;
  end if;

  if tg_argv[0] = 'legacy' then
    if new.admin_token is null then
      new.admin_token_hash := null;
    else
      new.admin_token_hash := encode(extensions.digest(new.admin_token, 'sha256'), 'hex');
    end if;
  elsif tg_argv[0] = 'hash' then
    new.admin_token := null;
  end if;
  return new;
end;
$$;

drop trigger if exists communities_admin_token_hash_insert on public.communities;
create trigger communities_admin_token_hash_insert
before insert on public.communities
for each row execute function public.sync_admin_token_hash('insert');
drop trigger if exists communities_admin_token_hash_legacy_update on public.communities;
create trigger communities_admin_token_hash_legacy_update
before update of admin_token on public.communities
for each row execute function public.sync_admin_token_hash('legacy');
drop trigger if exists communities_admin_token_hash_new_update on public.communities;
create trigger communities_admin_token_hash_new_update
before update of admin_token_hash on public.communities
for each row execute function public.sync_admin_token_hash('hash');

drop trigger if exists events_admin_token_hash_insert on public.events;
create trigger events_admin_token_hash_insert
before insert on public.events
for each row execute function public.sync_admin_token_hash('insert');
drop trigger if exists events_admin_token_hash_legacy_update on public.events;
create trigger events_admin_token_hash_legacy_update
before update of admin_token on public.events
for each row execute function public.sync_admin_token_hash('legacy');
drop trigger if exists events_admin_token_hash_new_update on public.events;
create trigger events_admin_token_hash_new_update
before update of admin_token_hash on public.events
for each row execute function public.sync_admin_token_hash('hash');

create table if not exists public.access_tokens (
  token_hash text primary key,
  token_type text not null check (token_type in ('session', 'llm')),
  event_id uuid references public.events(id) on delete cascade,
  community_id uuid references public.communities(id) on delete cascade,
  llm boolean not null default false,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  check ((event_id is not null) <> (community_id is not null)),
  check (llm = (token_type = 'llm'))
);

create index if not exists access_tokens_expires_at_idx on public.access_tokens(expires_at);
create index if not exists access_tokens_event_idx on public.access_tokens(event_id) where event_id is not null;
create index if not exists access_tokens_community_idx on public.access_tokens(community_id) where community_id is not null;
revoke all privileges on table public.access_tokens from anon, authenticated;
alter table public.access_tokens enable row level security;
grant all privileges on table public.access_tokens to service_role;
