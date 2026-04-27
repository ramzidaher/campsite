-- Immutable legal acceptance events for compliance/audit evidence.
-- Captures who accepted, when, which bundle, and a content fingerprint.

create extension if not exists pgcrypto;

create table if not exists public.legal_acceptance_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  profile_id uuid,
  org_id uuid references public.organisations(id) on delete set null,
  email text,
  acceptance_source text not null default 'registration',
  bundle_version text not null,
  legal_text_sha256 text not null,
  accepted_at timestamptz not null,
  request_host text,
  request_path text,
  user_agent text,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.legal_acceptance_events is
  'Immutable legal acceptance evidence events (registration and future re-consents).';
comment on column public.legal_acceptance_events.legal_text_sha256 is
  'SHA-256 fingerprint of the legal markdown bundle associated with this acceptance event.';

create index if not exists legal_acceptance_events_user_accepted_idx
  on public.legal_acceptance_events (user_id, accepted_at desc);
create index if not exists legal_acceptance_events_org_accepted_idx
  on public.legal_acceptance_events (org_id, accepted_at desc);
create index if not exists legal_acceptance_events_bundle_accepted_idx
  on public.legal_acceptance_events (bundle_version, accepted_at desc);

alter table public.legal_acceptance_events enable row level security;

drop policy if exists legal_acceptance_events_select_platform_founder on public.legal_acceptance_events;
create policy legal_acceptance_events_select_platform_founder
  on public.legal_acceptance_events
  for select
  to authenticated
  using (public.is_platform_founder(auth.uid()));

create or replace function public.compute_legal_bundle_sha256(p_bundle_version text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_terms text;
  v_privacy text;
  v_data_processing text;
begin
  select
    h.terms_markdown,
    h.privacy_markdown,
    h.data_processing_markdown
  into
    v_terms,
    v_privacy,
    v_data_processing
  from public.platform_legal_settings_history h
  where h.bundle_version = p_bundle_version
  order by h.captured_at desc
  limit 1;

  if v_terms is null and v_privacy is null and v_data_processing is null then
    select
      p.terms_markdown,
      p.privacy_markdown,
      p.data_processing_markdown
    into
      v_terms,
      v_privacy,
      v_data_processing
    from public.platform_legal_settings p
    where p.bundle_version = p_bundle_version
    limit 1;
  end if;

  if v_terms is null and v_privacy is null and v_data_processing is null then
    return encode(digest(coalesce(p_bundle_version, ''), 'sha256'), 'hex');
  end if;

  return encode(
    digest(
      coalesce(v_terms, '') || E'\n---\n' || coalesce(v_privacy, '') || E'\n---\n' || coalesce(v_data_processing, ''),
      'sha256'
    ),
    'hex'
  );
end;
$$;

create or replace function public.record_legal_acceptance_event(
  p_user_id uuid,
  p_profile_id uuid,
  p_org_id uuid,
  p_email text,
  p_bundle_version text,
  p_accepted_at timestamptz default now(),
  p_acceptance_source text default 'registration',
  p_request_host text default null,
  p_request_path text default null,
  p_user_agent text default null,
  p_evidence jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_bundle text;
  v_id uuid;
begin
  v_bundle := nullif(trim(coalesce(p_bundle_version, '')), '');
  if v_bundle is null then
    raise exception 'bundle version required';
  end if;

  insert into public.legal_acceptance_events (
    user_id,
    profile_id,
    org_id,
    email,
    acceptance_source,
    bundle_version,
    legal_text_sha256,
    accepted_at,
    request_host,
    request_path,
    user_agent,
    evidence
  )
  values (
    p_user_id,
    p_profile_id,
    p_org_id,
    nullif(trim(coalesce(p_email, '')), ''),
    coalesce(nullif(trim(p_acceptance_source), ''), 'registration'),
    v_bundle,
    public.compute_legal_bundle_sha256(v_bundle),
    coalesce(p_accepted_at, now()),
    nullif(trim(coalesce(p_request_host, '')), ''),
    nullif(trim(coalesce(p_request_path, '')), ''),
    case
      when p_user_agent is null then null
      when length(p_user_agent) > 2048 then left(p_user_agent, 2048)
      else p_user_agent
    end,
    coalesce(p_evidence, '{}'::jsonb)
  )
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.record_my_legal_acceptance(
  p_bundle_version text,
  p_accepted_at timestamptz default now(),
  p_acceptance_source text default 'registration_fallback',
  p_request_host text default null,
  p_request_path text default null,
  p_user_agent text default null,
  p_evidence jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid;
  v_org_id uuid;
  v_email text;
begin
  if auth.uid() is null then
    raise exception 'not signed in';
  end if;

  select p.id, p.org_id, p.email
  into v_profile_id, v_org_id, v_email
  from public.profiles p
  where p.id = auth.uid()
  limit 1;

  return public.record_legal_acceptance_event(
    auth.uid(),
    v_profile_id,
    v_org_id,
    v_email,
    p_bundle_version,
    p_accepted_at,
    p_acceptance_source,
    p_request_host,
    p_request_path,
    p_user_agent,
    p_evidence
  );
end;
$$;

grant execute on function public.record_my_legal_acceptance(
  text,
  timestamptz,
  text,
  text,
  text,
  text,
  jsonb
) to authenticated;

create or replace function public.platform_list_legal_acceptance_events(
  p_bundle_version text default null,
  p_limit integer default 50,
  p_offset integer default 0
)
returns table (
  id uuid,
  user_id uuid,
  org_id uuid,
  email text,
  acceptance_source text,
  bundle_version text,
  legal_text_sha256 text,
  accepted_at timestamptz,
  request_host text,
  request_path text,
  user_agent text,
  created_at timestamptz,
  total_count bigint
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_limit integer := greatest(1, least(coalesce(p_limit, 50), 200));
  v_offset integer := greatest(coalesce(p_offset, 0), 0);
  v_bundle text := nullif(trim(coalesce(p_bundle_version, '')), '');
begin
  if auth.uid() is null or not public.is_platform_founder(auth.uid()) then
    raise exception 'not allowed';
  end if;

  return query
  with filtered as (
    select e.*
    from public.legal_acceptance_events e
    where v_bundle is null or e.bundle_version = v_bundle
  )
  select
    f.id,
    f.user_id,
    f.org_id,
    f.email,
    f.acceptance_source,
    f.bundle_version,
    f.legal_text_sha256,
    f.accepted_at,
    f.request_host,
    f.request_path,
    f.user_agent,
    f.created_at,
    count(*) over () as total_count
  from filtered f
  order by f.accepted_at desc, f.created_at desc
  limit v_limit
  offset v_offset;
end;
$$;

grant execute on function public.platform_list_legal_acceptance_events(text, integer, integer) to authenticated;

drop trigger if exists legal_acceptance_events_immutable_trg on public.legal_acceptance_events;
create trigger legal_acceptance_events_immutable_trg
before update or delete on public.legal_acceptance_events
for each row execute function public.prevent_audit_mutation_trg_fn();

create or replace function public.apply_registration_from_user_meta(
  p_user_id uuid,
  p_email text,
  p_meta jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_org_text text;
  v_full text;
  v_avatar text;
  v_legal text;
  v_create_logo text;
  v_legal_host text;
  v_legal_path text;
  v_legal_ua text;
  v_depts jsonb;
  v_subs jsonb;
  dept_count int;
  valid_dept_count int;
  v_create_org_name text;
  v_create_slug_raw text;
  v_slug text;
  v_new_org_id uuid;
  v_dept_id uuid;
begin
  if exists (select 1 from public.profiles where id = p_user_id) then
    return;
  end if;

  v_avatar := nullif(trim(coalesce(p_meta->>'register_avatar_url', '')), '');
  if v_avatar is not null and length(v_avatar) > 2048 then
    v_avatar := null;
  end if;

  v_legal := nullif(trim(coalesce(p_meta->>'register_legal_bundle_version', '')), '');
  if v_legal is not null and length(v_legal) > 256 then
    v_legal := left(v_legal, 256);
  end if;
  v_legal_host := nullif(trim(coalesce(p_meta->>'register_legal_host', '')), '');
  v_legal_path := nullif(trim(coalesce(p_meta->>'register_legal_path', '')), '');
  v_legal_ua := nullif(trim(coalesce(p_meta->>'register_legal_user_agent', '')), '');
  if v_legal_ua is not null and length(v_legal_ua) > 2048 then
    v_legal_ua := left(v_legal_ua, 2048);
  end if;

  v_create_logo := nullif(trim(coalesce(p_meta->>'register_create_org_logo_url', '')), '');
  if v_create_logo is not null and length(v_create_logo) > 2048 then
    v_create_logo := null;
  end if;
  if v_create_logo is not null and v_create_logo !~* '^https?://' then
    v_create_logo := null;
  end if;

  v_org_text := nullif(trim(coalesce(p_meta->>'register_org_id', '')), '');
  v_create_org_name := nullif(trim(coalesce(
    p_meta->>'register_create_org_name',
    p_meta->>'register_founder_org_name',
    ''
  )), '');
  v_create_slug_raw := nullif(trim(coalesce(
    p_meta->>'register_create_org_slug',
    p_meta->>'register_founder_org_slug',
    ''
  )), '');

  v_org := null;
  if v_org_text is not null then
    begin
      v_org := v_org_text::uuid;
    exception
      when invalid_text_representation then
        raise exception 'Invalid organisation reference in registration';
    end;
  end if;

  if v_org is not null and v_create_org_name is not null and v_create_slug_raw is not null then
    raise exception 'Invalid registration: choose either joining an organisation or creating one, not both';
  end if;

  if v_create_org_name is not null and v_create_slug_raw is not null then
    if length(v_create_org_name) > 120 or length(v_create_org_name) < 1 then
      raise exception 'Organisation name must be between 1 and 120 characters';
    end if;

    v_slug := lower(v_create_slug_raw);
    v_slug := regexp_replace(v_slug, '[^a-z0-9-]+', '-', 'g');
    v_slug := regexp_replace(v_slug, '-+', '-', 'g');
    v_slug := trim(both '-' from v_slug);

    if length(v_slug) < 2 or length(v_slug) > 63 then
      raise exception 'Choose a URL slug between 2 and 63 characters (lowercase letters, numbers, hyphens)';
    end if;

    if v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$' then
      raise exception 'Choose a URL slug using lowercase letters, numbers, and hyphens only';
    end if;

    v_full := coalesce(nullif(trim(coalesce(p_meta->>'full_name', '')), ''), 'Member');

    select o.id into v_new_org_id
    from public.organisations o
    where o.slug = v_slug
    limit 1;

    if v_new_org_id is not null then
      if exists (
        select 1
        from public.profiles p
        where p.org_id = v_new_org_id
      ) then
        raise exception 'That organisation URL is already taken. Choose a different slug';
      end if;

      update public.organisations
      set
        name = v_create_org_name,
        logo_url = coalesce(v_create_logo, logo_url)
      where id = v_new_org_id;

      perform public.ensure_org_rbac_bootstrap(v_new_org_id);

      select d.id into v_dept_id
      from public.departments d
      where d.org_id = v_new_org_id and d.is_archived = false
      order by d.created_at asc
      limit 1;

      if v_dept_id is null then
        insert into public.departments (org_id, name, type, is_archived)
        values (v_new_org_id, 'General', 'department', false)
        returning id into v_dept_id;
      end if;

      insert into public.profiles (
        id, org_id, full_name, email, role, status, avatar_url,
        legal_bundle_version, legal_accepted_at
      )
      values (
        p_user_id, v_new_org_id, v_full, nullif(trim(p_email), ''), 'org_admin', 'active', v_avatar,
        v_legal, case when v_legal is not null then now() else null end
      );

      if v_legal is not null then
        perform public.record_legal_acceptance_event(
          p_user_id,
          p_user_id,
          v_new_org_id,
          p_email,
          v_legal,
          now(),
          'registration',
          v_legal_host,
          v_legal_path,
          v_legal_ua,
          jsonb_build_object('flow', 'create_org')
        );
      end if;

      insert into public.user_departments (user_id, dept_id)
      values (p_user_id, v_dept_id);

      return;
    end if;

    insert into public.organisations (name, slug, logo_url, is_active)
    values (v_create_org_name, v_slug, v_create_logo, true)
    returning id into v_new_org_id;

    insert into public.departments (org_id, name, type, is_archived)
    values (v_new_org_id, 'General', 'department', false)
    returning id into v_dept_id;

    insert into public.profiles (
      id, org_id, full_name, email, role, status, avatar_url,
      legal_bundle_version, legal_accepted_at
    )
    values (
      p_user_id, v_new_org_id, v_full, nullif(trim(p_email), ''), 'org_admin', 'active', v_avatar,
      v_legal, case when v_legal is not null then now() else null end
    );

    if v_legal is not null then
      perform public.record_legal_acceptance_event(
        p_user_id,
        p_user_id,
        v_new_org_id,
        p_email,
        v_legal,
        now(),
        'registration',
        v_legal_host,
        v_legal_path,
        v_legal_ua,
        jsonb_build_object('flow', 'create_org')
      );
    end if;

    insert into public.user_departments (user_id, dept_id)
    values (p_user_id, v_dept_id);

    return;
  end if;

  if v_org is null then
    return;
  end if;

  if not exists (
    select 1 from public.organisations o where o.id = v_org and o.is_active = true
  ) then
    raise exception 'Invalid organisation for registration';
  end if;

  v_full := coalesce(nullif(trim(coalesce(p_meta->>'full_name', '')), ''), 'Member');

  begin
    v_depts := (p_meta->>'register_dept_ids')::jsonb;
  exception
    when others then
      raise exception 'Invalid registration department data';
  end;

  if v_depts is null or jsonb_typeof(v_depts) <> 'array' or jsonb_array_length(v_depts) = 0 then
    raise exception 'Select at least one team';
  end if;

  select count(*)::int into dept_count from jsonb_array_elements_text(v_depts) q(did);

  select count(*)::int into valid_dept_count
  from jsonb_array_elements_text(v_depts) q(did)
  join public.departments d on d.id = q.did::uuid
  where d.org_id = v_org and d.is_archived = false;

  if valid_dept_count <> dept_count then
    raise exception 'Invalid department for registration';
  end if;

  insert into public.profiles (
    id, org_id, full_name, email, role, status, avatar_url,
    legal_bundle_version, legal_accepted_at
  )
  values (
    p_user_id, v_org, v_full, nullif(trim(p_email), ''), 'unassigned', 'pending', v_avatar,
    v_legal, case when v_legal is not null then now() else null end
  );

  if v_legal is not null then
    perform public.record_legal_acceptance_event(
      p_user_id,
      p_user_id,
      v_org,
      p_email,
      v_legal,
      now(),
      'registration',
      v_legal_host,
      v_legal_path,
      v_legal_ua,
      jsonb_build_object('flow', 'join_org')
    );
  end if;

  insert into public.user_departments (user_id, dept_id)
  select p_user_id, q.did::uuid
  from jsonb_array_elements_text(v_depts) q(did);

  begin
    v_subs := coalesce((p_meta->>'register_subscriptions')::jsonb, '[]'::jsonb);
  exception
    when others then
      v_subs := '[]'::jsonb;
  end;

  if jsonb_typeof(v_subs) = 'array' and jsonb_array_length(v_subs) > 0 then
    insert into public.user_subscriptions (user_id, channel_id, subscribed)
    select
      p_user_id,
      (nullif(trim(coalesce(s.item->>'channel_id', s.item->>'cat_id')), ''))::uuid,
      coalesce((s.item->>'subscribed')::boolean, true)
    from jsonb_array_elements(v_subs) s(item)
    where nullif(trim(coalesce(s.item->>'channel_id', s.item->>'cat_id')), '') is not null
      and exists (
        select 1
        from public.broadcast_channels c
        join public.departments d on d.id = c.dept_id
        where c.id = (nullif(trim(coalesce(s.item->>'channel_id', s.item->>'cat_id')), ''))::uuid
          and d.org_id = v_org
          and d.is_archived = false
          and d.id in (select q.did::uuid from jsonb_array_elements_text(v_depts) q(did))
      );
  end if;
end;
$$;
