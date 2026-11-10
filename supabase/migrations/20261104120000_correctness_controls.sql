-- Expand-only correctness controls for atomic intro writes and Luma source identity.
alter table public.members
  add column if not exists source_guest_id text;

create unique index if not exists members_event_source_guest_unique
  on public.members(event_id, source_guest_id)
  where source_guest_id is not null;

create or replace function public.enforce_intro_capacity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_a_sample boolean;
  v_b_sample boolean;
  v_a_total integer;
  v_b_total integer;
  v_a_real integer;
  v_b_real integer;
begin
  perform public.convene_lock_event(new.event_id);
  if new.a_id >= new.b_id then
    raise exception 'intro pair must use canonical member order' using errcode = '23514';
  end if;

  select is_sample into v_a_sample from public.members where id = new.a_id and event_id = new.event_id;
  select is_sample into v_b_sample from public.members where id = new.b_id and event_id = new.event_id;
  if v_a_sample is null or v_b_sample is null then
    raise exception 'intro members must belong to event' using errcode = '23503';
  end if;

  select count(*), count(*) filter (where not (v_a_sample and other_member.is_sample))
    into v_a_total, v_a_real
    from public.intros i
    join public.members other_member on other_member.id = case when i.a_id = new.a_id then i.b_id else i.a_id end
    where i.event_id = new.event_id and (i.a_id = new.a_id or i.b_id = new.a_id);
  select count(*), count(*) filter (where not (v_b_sample and other_member.is_sample))
    into v_b_total, v_b_real
    from public.intros i
    join public.members other_member on other_member.id = case when i.a_id = new.b_id then i.b_id else i.a_id end
    where i.event_id = new.event_id and (i.a_id = new.b_id or i.b_id = new.b_id);

  if 2 - v_a_real <= 0 or 2 - v_b_real <= 0
    or (v_a_sample and v_b_sample and (2 - v_a_total <= 0 or 2 - v_b_total <= 0)) then
    raise exception 'intro capacity exceeded' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_intro_capacity() from public, anon, authenticated;

drop trigger if exists intros_enforce_capacity on public.intros;
create trigger intros_enforce_capacity
before insert on public.intros
for each row execute function public.enforce_intro_capacity();

create or replace function public.convene_commit_intros(p_event uuid, p_pairs jsonb)
returns setof public.intros
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_pair jsonb;
  v_a uuid;
  v_b uuid;
  v_swap uuid;
  v_a_sample boolean;
  v_b_sample boolean;
  v_a_total integer;
  v_b_total integer;
  v_a_real integer;
  v_b_real integer;
  v_row public.intros%rowtype;
begin
  if p_pairs is null or jsonb_typeof(p_pairs) <> 'array' then
    raise exception 'pairs must be a JSON array' using errcode = '22023';
  end if;
  perform public.convene_lock_event(p_event);

  for v_pair in select value from jsonb_array_elements(p_pairs)
  loop
    begin
      v_a := (v_pair ->> 'a_id')::uuid;
      v_b := (v_pair ->> 'b_id')::uuid;
    exception when others then
      raise exception 'pair member ids must be UUIDs' using errcode = '22023';
    end;
    if v_a = v_b then
      raise exception 'intro pair cannot contain the same member twice' using errcode = '23514';
    end if;
    if v_a > v_b then
      v_swap := v_a;
      v_a := v_b;
      v_b := v_swap;
    end if;

    select is_sample into v_a_sample from public.members where id = v_a and event_id = p_event;
    select is_sample into v_b_sample from public.members where id = v_b and event_id = p_event;
    if v_a_sample is null or v_b_sample is null then
      raise exception 'intro members must belong to event' using errcode = '23503';
    end if;

    select count(*), count(*) filter (where not (v_a_sample and other_member.is_sample))
      into v_a_total, v_a_real
      from public.intros i
      join public.members other_member on other_member.id = case when i.a_id = v_a then i.b_id else i.a_id end
      where i.event_id = p_event and (i.a_id = v_a or i.b_id = v_a);
    select count(*), count(*) filter (where not (v_b_sample and other_member.is_sample))
      into v_b_total, v_b_real
      from public.intros i
      join public.members other_member on other_member.id = case when i.a_id = v_b then i.b_id else i.a_id end
      where i.event_id = p_event and (i.a_id = v_b or i.b_id = v_b);
    if 2 - v_a_real <= 0 or 2 - v_b_real <= 0
      or (v_a_sample and v_b_sample and (2 - v_a_total <= 0 or 2 - v_b_total <= 0)) then
      continue;
    end if;

    insert into public.intros(event_id, a_id, b_id, score, reasons)
    values (p_event, v_a, v_b, coalesce((v_pair ->> 'score')::real, 0), coalesce(v_pair -> 'reasons', '[]'::jsonb))
    on conflict (event_id, a_id, b_id) do nothing
    returning * into v_row;
    if found then return next v_row; end if;
  end loop;
  return;
end;
$$;
revoke all on function public.convene_commit_intros(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.convene_commit_intros(uuid, jsonb) to service_role;
