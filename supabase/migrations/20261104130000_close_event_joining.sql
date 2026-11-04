-- Expand-only setting: organisers can stop public attendee joins without changing existing rows.
alter table public.events
  add column if not exists joins_closed boolean not null default false;
