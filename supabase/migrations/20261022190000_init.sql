-- Convene schema. One migration; run with `npx supabase db push` or paste into the SQL editor.


create table if not exists communities (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  admin_token text not null default replace(gen_random_uuid()::text, '-', ''),
  created_at timestamptz not null default now()
);

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  community_id uuid references communities(id) on delete cascade,
  admin_token text not null default replace(gen_random_uuid()::text, '-', ''),
  created_at timestamptz not null default now()
);

-- Community memory: one row per real person per community, keyed by normalised x_handle or contact.
create table if not exists people (
  id uuid primary key default gen_random_uuid(),
  community_id uuid not null references communities(id) on delete cascade,
  key text not null,
  name text not null,
  first_seen timestamptz not null default now(),
  unique (community_id, key)
);

create table if not exists members (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  person_id uuid references people(id) on delete set null,
  name text not null,
  line text not null,
  x_handle text,
  speak_on text,
  contact text,
  contact_consent boolean not null default false,
  offers text[] not null default '{}',
  seeks text[] not null default '{}',
  topics text[] not null default '{}',
  speak_topics text[] not null default '{}',
  is_sample boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists members_event_idx on members(event_id);
create index if not exists members_person_idx on members(person_id);

create table if not exists intros (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  a_id uuid not null references members(id) on delete cascade,
  b_id uuid not null references members(id) on delete cascade,
  score real not null,
  reasons jsonb not null default '[]',
  created_at timestamptz not null default now(),
  unique (event_id, a_id, b_id),
  check (a_id <> b_id)
);
create index if not exists intros_event_idx on intros(event_id);

-- RLS: anon can read non-sensitive data only; all writes go through server routes using the service role.
alter table communities enable row level security;
alter table events enable row level security;
alter table people enable row level security;
alter table members enable row level security;
alter table intros enable row level security;

-- Column-level grants keep contact and admin tokens away from the anon key.
revoke all on communities, events, people, members, intros from anon, authenticated;
grant select (id, slug, name, created_at) on communities to anon, authenticated;
grant select (id, slug, name, community_id, created_at) on events to anon, authenticated;
grant select (id, event_id, person_id, name, line, x_handle, speak_on, offers, seeks, topics, speak_topics, is_sample, created_at)
  on members to anon, authenticated;
grant select on intros to anon, authenticated;

drop policy if exists "public read" on communities;
create policy "public read" on communities for select using (true);
drop policy if exists "public read" on events;
create policy "public read" on events for select using (true);
drop policy if exists "public read" on members;
create policy "public read" on members for select using (true);
drop policy if exists "public read" on intros;
create policy "public read" on intros for select using (true);

-- Realtime
do $$ begin
  alter publication supabase_realtime add table members;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table intros;
exception when duplicate_object then null; end $$;
