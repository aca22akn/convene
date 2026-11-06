-- Expand-only community query support. All new callable functions are restricted to service_role.

create index if not exists members_profile_fts_idx
  on public.members using gin (
    to_tsvector(
      'simple'::regconfig,
      coalesce(name, '') || ' ' || coalesce(line, '') || ' ' || coalesce(speak_on, '')
    )
  );

create index if not exists members_offers_gin_idx on public.members using gin (offers);
create index if not exists members_seeks_gin_idx on public.members using gin (seeks);
create index if not exists members_topics_gin_idx on public.members using gin (topics);
create index if not exists members_speak_topics_gin_idx on public.members using gin (speak_topics);

create or replace function public.community_people(
  p_community uuid,
  p_event_ids uuid[],
  p_limit integer,
  p_after text
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  with parameters as (
    select
      least(greatest(coalesce(p_limit, 50), 1), 50) as page_limit,
      case when p_after is null then null::timestamptz else split_part(p_after, '|', 1)::timestamptz end as after_created_at,
      case when p_after is null then null::uuid else split_part(p_after, '|', 2)::uuid end as after_person_id
  ), scoped as (
    select
      coalesce(m.person_id, m.id) as person_id,
      m.id as member_id,
      m.event_id,
      e.slug as event_slug,
      m.name,
      m.x_handle,
      m.line,
      m.speak_on,
      m.offers,
      m.seeks,
      m.speak_topics,
      m.created_at
    from public.members m
    join public.events e on e.id = m.event_id
    where e.community_id = p_community
      and (p_event_ids is null or m.event_id = any(p_event_ids))
      and m.directory_consent is true
  ), per_person as (
    select person_id, count(distinct event_id)::integer as events_count,
      array_agg(distinct event_slug order by event_slug) as event_slugs
    from scoped
    group by person_id
  ), latest_ranked as (
    select scoped.*, row_number() over (partition by person_id order by created_at desc, member_id desc) as row_num
    from scoped
  ), people as (
    select l.person_id, l.member_id, l.name, l.x_handle, l.line, l.speak_on, l.offers, l.seeks,
      l.speak_topics, l.created_at, p.events_count, p.event_slugs
    from latest_ranked l
    join per_person p using (person_id)
    where l.row_num = 1
  ), total_count as (
    select count(*)::integer as total from people
  ), page_rows as (
    select people.*, row_number() over (order by created_at desc, person_id asc) as ordinal
    from people
    cross join parameters
    where parameters.after_created_at is null
      or created_at < parameters.after_created_at
      or (created_at = parameters.after_created_at and person_id > parameters.after_person_id)
    order by created_at desc, person_id asc
    limit (select page_limit + 1 from parameters)
  )
  select jsonb_build_object(
    'total', total_count.total,
    'people', coalesce((
      select jsonb_agg(jsonb_build_object(
        'person_id', page.person_id,
        'member_id', page.member_id,
        'name', page.name,
        'x_handle', page.x_handle,
        'line', page.line,
        'speak_on', page.speak_on,
        'offers', page.offers,
        'seeks', page.seeks,
        'speak_topics', page.speak_topics,
        'events_count', page.events_count,
        'event_slugs', page.event_slugs,
        'created_at', page.created_at
      ) order by page.ordinal)
      from page_rows page
      cross join parameters
      where page.ordinal <= parameters.page_limit
    ), '[]'::jsonb),
    'next_cursor', case when exists (
      select 1 from page_rows page cross join parameters where page.ordinal > parameters.page_limit
    ) then (
      select to_char(page.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') || '|' || page.person_id::text
      from page_rows page cross join parameters where page.ordinal = parameters.page_limit
    ) else null end
  )
  from total_count;
$function$;
revoke all on function public.community_people(uuid, uuid[], integer, text) from public, anon, authenticated;
grant execute on function public.community_people(uuid, uuid[], integer, text) to service_role;

create or replace function public.community_gaps(
  p_community uuid,
  p_event_ids uuid[],
  p_ai_enabled_only boolean default false,
  p_exclude_ai_opt_out boolean default false
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  with scoped as (
    select coalesce(m.person_id, m.id) as person_id, m.id as member_id, m.event_id, m.created_at,
      m.offers, m.seeks
    from public.members m
    join public.events e on e.id = m.event_id
    where (p_community is null or e.community_id = p_community)
      and (p_event_ids is null or m.event_id = any(p_event_ids))
      and (not p_ai_enabled_only or e.ai_enabled is true)
      and (not p_exclude_ai_opt_out or m.ai_opt_out is false)
  ), latest_ranked as (
    select scoped.*, row_number() over (partition by person_id order by created_at desc, member_id desc) as row_num
    from scoped
  ), people as (
    select * from latest_ranked where row_num = 1
  ), member_count as (
    select count(*)::integer as members from people
  ), needs as (
    select tag, count(*)::integer as seekers
    from people cross join lateral unnest(coalesce(seeks, array[]::text[])) as item(tag)
    group by tag
  ), offers as (
    select tag, count(*)::integer as offerers
    from people cross join lateral unnest(coalesce(offers, array[]::text[])) as item(tag)
    group by tag
  ), deficits as (
    select needs.tag, needs.seekers, coalesce(offers.offerers, 0)::integer as offerers
    from needs left join offers using (tag)
    where coalesce(offers.offerers, 0) < needs.seekers
    order by needs.seekers - coalesce(offers.offerers, 0) desc, needs.tag asc
    limit 15
  )
  select jsonb_build_object(
    'members', member_count.members,
    'gaps', coalesce((
      select jsonb_agg(jsonb_build_object('tag', tag, 'seekers', seekers, 'offerers', offerers) order by seekers - offerers desc, tag asc)
      from deficits
    ), '[]'::jsonb)
  )
  from member_count;
$function$;
revoke all on function public.community_gaps(uuid, uuid[], boolean, boolean) from public, anon, authenticated;
grant execute on function public.community_gaps(uuid, uuid[], boolean, boolean) to service_role;

create or replace function public.search_members(
  p_community uuid,
  p_event_ids uuid[],
  p_query text,
  p_limit integer,
  p_tags text[] default array[]::text[],
  p_ai_enabled_only boolean default false,
  p_exclude_ai_opt_out boolean default false
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  with parameters as (
    select least(greatest(coalesce(p_limit, 50), 1), 50) as row_limit,
      coalesce(p_tags, array[]::text[]) as query_tags,
      websearch_to_tsquery('simple'::regconfig, coalesce(p_query, '')) as query_vector
  ), scoped as (
    select coalesce(m.person_id, m.id) as person_id, m.id as member_id, m.event_id, e.slug as event_slug,
      m.name, m.x_handle, m.line, m.speak_on, m.offers, m.seeks, m.speak_topics, m.created_at
    from public.members m
    join public.events e on e.id = m.event_id
    where (p_community is null or e.community_id = p_community)
      and (p_event_ids is null or m.event_id = any(p_event_ids))
      and (not p_ai_enabled_only or e.ai_enabled is true)
      and (not p_exclude_ai_opt_out or m.ai_opt_out is false)
  ), per_person as (
    select person_id, count(distinct event_id)::integer as events_count,
      array_agg(distinct event_slug order by event_slug) as event_slugs
    from scoped group by person_id
  ), latest_ranked as (
    select scoped.*, row_number() over (partition by person_id order by created_at desc, member_id desc) as row_num
    from scoped
  ), people as (
    select l.person_id, l.member_id, l.name, l.x_handle, l.line, l.speak_on, l.offers, l.seeks,
      l.speak_topics, l.created_at, p.events_count, p.event_slugs
    from latest_ranked l join per_person p using (person_id)
    where l.row_num = 1
  ), scored as (
    select people.*,
      (select count(*)::integer
       from regexp_split_to_table(lower(coalesce(p_query, '')), '\W+') as query_word
       where length(query_word) > 2
         and position(query_word in lower(people.name || ' ' || people.line || ' ' || coalesce(people.speak_on, ''))) > 0
      ) as text_hits,
      (select count(*)::integer
       from unnest(coalesce(people.offers, array[]::text[]) || coalesce(people.seeks, array[]::text[]) || coalesce(people.speak_topics, array[]::text[])) as member_tag(tag)
       cross join parameters
       where member_tag.tag = any(parameters.query_tags)
      ) as tag_hits,
      to_tsvector('simple'::regconfig, people.name || ' ' || people.line || ' ' || coalesce(people.speak_on, '')) as profile_vector
    from people
  ), ranked as (
    select scored.*, (text_hits * 2 + tag_hits)::integer as rank_score
    from scored
  ), matches as (
    select ranked.*
    from ranked cross join parameters
    where rank_score > 0
      and (profile_vector @@ parameters.query_vector
        or offers && parameters.query_tags
        or seeks && parameters.query_tags
        or speak_topics && parameters.query_tags
        or text_hits > 0
        or tag_hits > 0)
  ), page as (
    select matches.* from matches
    order by rank_score desc, events_count desc, person_id asc
    limit (select row_limit from parameters)
  )
  select jsonb_build_object(
    'total', (select count(*)::integer from matches),
    'people', coalesce((
      select jsonb_agg(jsonb_build_object(
        'person_id', page.person_id,
        'member_id', page.member_id,
        'name', page.name,
        'x_handle', page.x_handle,
        'line', page.line,
        'speak_on', page.speak_on,
        'offers', page.offers,
        'seeks', page.seeks,
        'speak_topics', page.speak_topics,
        'events_count', page.events_count,
        'event_slugs', page.event_slugs
      ) order by page.rank_score desc, page.events_count desc, page.person_id asc)
      from page
    ), '[]'::jsonb)
  );
$function$;
revoke all on function public.search_members(uuid, uuid[], text, integer, text[], boolean, boolean) from public, anon, authenticated;
grant execute on function public.search_members(uuid, uuid[], text, integer, text[], boolean, boolean) to service_role;

create or replace function public.suggest_intro_candidates(
  p_community uuid,
  p_event_ids uuid[],
  p_member_id uuid,
  p_limit integer,
  p_ai_enabled_only boolean default false,
  p_exclude_ai_opt_out boolean default false
)
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog, public
as $function$
  with parameters as (
    select least(greatest(coalesce(p_limit, 8), 1), 20) as row_limit
  ), scoped as (
    select coalesce(m.person_id, m.id) as person_id, m.id as member_id, m.event_id, e.slug as event_slug,
      m.name, m.x_handle, m.line, m.speak_on, m.offers, m.seeks, m.topics, m.speak_topics, m.created_at,
      m.ai_opt_out
    from public.members m
    join public.events e on e.id = m.event_id
    where (p_community is null or e.community_id = p_community)
      and (p_event_ids is null or m.event_id = any(p_event_ids))
      and (not p_ai_enabled_only or e.ai_enabled is true)
      and (not p_exclude_ai_opt_out or m.ai_opt_out is false)
  ), me as (
    select * from scoped where member_id = p_member_id
  ), existing_rows as (
    select i.created_at, other.member_id, other.name, other.line, i.score,
      coalesce((
        select jsonb_agg(reason.value ->> 'text')
        from jsonb_array_elements(i.reasons) as reason(value)
      ), '[]'::jsonb) as reasons
    from public.intros i
    join me on me.event_id = i.event_id
    join scoped other on other.event_id = i.event_id
      and other.member_id = case when i.a_id = me.member_id then i.b_id else i.a_id end
    where i.a_id = me.member_id or i.b_id = me.member_id
    order by i.created_at desc, other.member_id asc
    limit 50
  ), per_person as (
    select person_id, count(distinct event_id)::integer as events_count,
      array_agg(distinct event_slug order by event_slug) as event_slugs
    from scoped group by person_id
  ), latest_ranked as (
    select scoped.*, row_number() over (partition by person_id order by created_at desc, member_id desc) as row_num
    from scoped
  ), people as (
    select l.person_id, l.member_id, l.name, l.x_handle, l.line, l.speak_on, l.offers, l.seeks,
      l.speak_topics, l.created_at, p.events_count, p.event_slugs
    from latest_ranked l join per_person p using (person_id)
    where l.row_num = 1
  ), scored as (
    select people.*,
      (2 * (select count(distinct tag)::integer from unnest(coalesce(me.offers, array[]::text[])) as item(tag) where tag = any(people.seeks))
       + 2 * (select count(distinct tag)::integer from unnest(coalesce(me.seeks, array[]::text[])) as item(tag) where tag = any(people.offers))) as tag_score
    from people cross join me
    where people.person_id <> me.person_id
  ), candidates as (
    select * from scored where tag_score > 0
    order by tag_score desc, events_count desc, created_at desc, person_id asc
    limit (select row_limit from parameters)
  )
  select jsonb_build_object(
    'member', (select jsonb_build_object(
      'id', me.member_id, 'person_id', me.person_id, 'name', me.name, 'line', me.line,
      'offers', me.offers, 'seeks', me.seeks, 'topics', me.topics
    ) from me),
    'existing_intros', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name', existing.name, 'line', existing.line, 'score', existing.score, 'reasons', existing.reasons
      ) order by existing.created_at desc, existing.member_id asc)
      from existing_rows existing
    ), '[]'::jsonb),
    'candidates', coalesce((
      select jsonb_agg(jsonb_build_object(
        'person_id', candidate.person_id,
        'member_id', candidate.member_id,
        'name', candidate.name,
        'x_handle', candidate.x_handle,
        'line', candidate.line,
        'speak_on', candidate.speak_on,
        'offers', candidate.offers,
        'seeks', candidate.seeks,
        'speak_topics', candidate.speak_topics,
        'events_count', candidate.events_count,
        'event_slugs', candidate.event_slugs,
        'tag_score', candidate.tag_score
      ) order by candidate.tag_score desc, candidate.events_count desc, candidate.created_at desc, candidate.person_id asc)
      from candidates candidate
    ), '[]'::jsonb)
  );
$function$;
revoke all on function public.suggest_intro_candidates(uuid, uuid[], uuid, integer, boolean, boolean) from public, anon, authenticated;
grant execute on function public.suggest_intro_candidates(uuid, uuid[], uuid, integer, boolean, boolean) to service_role;
