-- Founder portal: real data RPCs for broadcasts, rota shifts, and profile management.

-- ---------------------------------------------------------------------------
-- platform_broadcasts_list: all broadcasts across all orgs (or one org),
-- enriched with org name, slug, and sender name.
-- ---------------------------------------------------------------------------
create or replace function public.platform_broadcasts_list(p_org_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.platform_is_founder(auth.uid()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return coalesce(
    (
      select jsonb_agg(row_data order by sort_ts desc)
      from (
        select
          coalesce(b.sent_at, b.scheduled_at, b.created_at) as sort_ts,
          jsonb_build_object(
            'id',             b.id,
            'org_id',         b.org_id,
            'org_name',       o.name,
            'org_slug',       o.slug,
            'title',          b.title,
            'body',           b.body,
            'status',         b.status,
            'sent_at',        b.sent_at,
            'scheduled_at',   b.scheduled_at,
            'created_at',     b.created_at,
            'sender_name',    p.full_name,
            'sender_email',   p.email
          ) as row_data
        from public.broadcasts b
        join public.organisations o on o.id = b.org_id
        left join public.profiles p on p.id = b.created_by
        where (p_org_id is null or b.org_id = p_org_id)
        order by coalesce(b.sent_at, b.scheduled_at, b.created_at) desc
        limit 300
      ) x
    ),
    '[]'::jsonb
  );
end;
$$;

revoke all on function public.platform_broadcasts_list(uuid) from public;
grant execute on function public.platform_broadcasts_list(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- platform_rota_shifts_list: upcoming / recent shifts across all orgs
-- (or one org), enriched with staff name and org name.
-- ---------------------------------------------------------------------------
create or replace function public.platform_rota_shifts_list(
  p_org_id uuid    default null,
  p_days   integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.platform_is_founder(auth.uid()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return coalesce(
    (
      select jsonb_agg(row_data order by sort_start asc)
      from (
        select
          s.start_time as sort_start,
          jsonb_build_object(
            'id',          s.id,
            'org_id',      s.org_id,
            'org_name',    o.name,
            'org_slug',    o.slug,
            'user_id',     s.user_id,
            'staff_name',  p.full_name,
            'role_label',  s.role_label,
            'start_time',  s.start_time,
            'end_time',    s.end_time,
            'notes',       s.notes,
            'source',      s.source
          ) as row_data
        from public.rota_shifts s
        join public.organisations o on o.id = s.org_id
        left join public.profiles p on p.id = s.user_id
        where (p_org_id is null or s.org_id = p_org_id)
          and s.start_time >= (now() - interval '1 day')
          and s.start_time <= (now() + (p_days || ' days')::interval)
        order by s.start_time asc
        limit 500
      ) x
    ),
    '[]'::jsonb
  );
end;
$$;

revoke all on function public.platform_rota_shifts_list(uuid, integer) from public;
grant execute on function public.platform_rota_shifts_list(uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- platform_founder_set_profile_status: approve or reject a pending profile.
-- Founders bypass the normal can_approve_profile org-membership check.
-- ---------------------------------------------------------------------------
create or replace function public.platform_founder_set_profile_status(
  p_profile_id uuid,
  p_new_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.platform_is_founder(auth.uid()) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_new_status not in ('active', 'inactive', 'pending') then
    raise exception 'invalid status value: %', p_new_status;
  end if;
  update public.profiles
     set status = p_new_status
   where id = p_profile_id;
  if not found then
    raise exception 'profile not found';
  end if;
  -- Write an audit event so founders can see the action in the audit log.
  insert into public.platform_audit_events (
    actor_user_id, org_id, event_type, entity_type, entity_id, before_state, after_state
  )
  select
    auth.uid(),
    pr.org_id,
    'founder.profile.status_changed',
    'profile',
    p_profile_id::text,
    jsonb_build_object('status', pr.status),
    jsonb_build_object('status', p_new_status)
  from public.profiles pr
  where pr.id = p_profile_id;
end;
$$;

revoke all on function public.platform_founder_set_profile_status(uuid, text) from public;
grant execute on function public.platform_founder_set_profile_status(uuid, text) to authenticated;
