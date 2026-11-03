-- Remove browser access to application tables. Public views are served by scoped API routes.
alter table public.members
  add column if not exists directory_consent boolean not null default false;

revoke all privileges on table public.communities, public.events, public.people, public.members, public.intros
  from anon, authenticated;

-- The initial schema granted column-level SELECT separately; table-level REVOKE does not cover it.
do $$
declare
  granted_column record;
begin
  for granted_column in
    select table_schema, table_name, column_name, privilege_type, grantee
    from information_schema.column_privileges
    where table_schema = 'public'
      and table_name in ('communities', 'events', 'people', 'members', 'intros')
      and grantee in ('anon', 'authenticated')
  loop
    execute format(
      'revoke %s (%I) on table %I.%I from %I',
      granted_column.privilege_type,
      granted_column.column_name,
      granted_column.table_schema,
      granted_column.table_name,
      granted_column.grantee
    );
  end loop;
end $$;

drop policy if exists "public read" on public.communities;
drop policy if exists "public read" on public.events;
drop policy if exists "public read" on public.members;
drop policy if exists "public read" on public.intros;

-- Client channels are private and may receive only the empty event-change signal.
drop policy if exists "convene anon can receive event broadcasts" on realtime.messages;
create policy "convene anon can receive event broadcasts"
  on realtime.messages
  for select
  to anon
  using (
    extension = 'broadcast'
    and realtime.topic() like 'event:%'
  );

-- A restrictive policy makes event topics unsendable even if another permissive policy exists.
drop policy if exists "convene clients cannot send event broadcasts" on realtime.messages;
create policy "convene clients cannot send event broadcasts"
  on realtime.messages
  as restrictive
  for insert
  to anon, authenticated
  with check (realtime.topic() not like 'event:%');

-- These tables no longer need to be published because live clients receive server broadcasts.
do $$
begin
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'members'
  ) then
    execute 'alter publication supabase_realtime drop table public.members';
  end if;
  if exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'intros'
  ) then
    execute 'alter publication supabase_realtime drop table public.intros';
  end if;
end $$;
