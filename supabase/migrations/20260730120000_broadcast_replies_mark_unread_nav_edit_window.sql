-- Broadcast replies (private to author vs org-visible thread), mark-unread RPC,
-- feed prev/next navigation, recent-sent edit window + RLS, sent metadata trigger.

-- ---------------------------------------------------------------------------
-- Replies
-- ---------------------------------------------------------------------------

create table if not exists public.broadcast_replies (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete cascade,
  broadcast_id uuid not null references public.broadcasts (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null,
  visibility text not null
    check (visibility in ('private_to_author', 'org_thread')),
  created_at timestamptz not null default now(),
  constraint broadcast_replies_body_nonempty check (length(trim(body)) > 0),
  constraint broadcast_replies_body_len check (length(body) <= 8000)
);

create index if not exists broadcast_replies_broadcast_created_idx
  on public.broadcast_replies (broadcast_id, created_at asc);

create index if not exists broadcast_replies_org_idx
  on public.broadcast_replies (org_id);

alter table public.broadcast_replies enable row level security;

create policy broadcast_replies_insert_scoped
  on public.broadcast_replies
  for insert
  to authenticated
  with check (
    author_id = auth.uid()
    and org_id = public.current_org_id()
    and exists (
      select 1
      from public.broadcasts b
      where b.id = broadcast_id
        and b.org_id = public.current_org_id()
        and b.status = 'sent'
        and public.broadcast_visible_to_reader(b)
    )
  );

create policy broadcast_replies_select_org_thread
  on public.broadcast_replies
  for select
  to authenticated
  using (
    visibility = 'org_thread'
    and org_id = public.current_org_id()
    and exists (
      select 1
      from public.broadcasts b
      where b.id = broadcast_replies.broadcast_id
        and public.broadcast_visible_to_reader(b)
    )
  );

create policy broadcast_replies_select_private
  on public.broadcast_replies
  for select
  to authenticated
  using (
    visibility = 'private_to_author'
    and org_id = public.current_org_id()
    and (
      author_id = auth.uid()
      or exists (
        select 1
        from public.broadcasts b
        where b.id = broadcast_replies.broadcast_id
          and b.created_by = auth.uid()
      )
    )
  );

-- ---------------------------------------------------------------------------
-- Mark one broadcast unread (delete read receipt)
-- ---------------------------------------------------------------------------

create or replace function public.broadcast_mark_unread(p_broadcast_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  delete from public.broadcast_reads r
  where r.broadcast_id = p_broadcast_id
    and r.user_id = auth.uid()
    and exists (
      select 1
      from public.broadcasts b
      where b.id = p_broadcast_id
        and b.status = 'sent'
        and public.broadcast_visible_to_reader(b)
    );
end;
$$;

revoke all on function public.broadcast_mark_unread(uuid) from public;
grant execute on function public.broadcast_mark_unread(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Prev / next in default feed order (pinned first, then newest sent_at)
-- ---------------------------------------------------------------------------

create or replace function public.broadcast_feed_navigation(p_broadcast_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_rn int;
  v_total int;
  v_prev uuid;
  v_next uuid;
begin
  if not exists (
    select 1
    from public.broadcasts b
    where b.id = p_broadcast_id
      and b.status = 'sent'
      and public.broadcast_visible_to_reader(b)
  ) then
    return jsonb_build_object(
      'index', null,
      'total', null,
      'prev_id', null,
      'next_id', null
    );
  end if;

  with ordered as (
    select
      b.id,
      row_number() over (
        order by
          coalesce(b.is_pinned, false) desc,
          b.sent_at desc nulls last,
          b.created_at desc
      ) as rn,
      count(*) filter (where b.status = 'sent') over () as total
    from public.broadcasts b
    where b.status = 'sent'
      and public.broadcast_visible_to_reader(b)
  )
  select o.rn, o.total::int
  into v_rn, v_total
  from ordered o
  where o.id = p_broadcast_id;

  if v_rn is null then
    return jsonb_build_object(
      'index', null,
      'total', null,
      'prev_id', null,
      'next_id', null
    );
  end if;

  select o.id
  into v_prev
  from (
    select
      b.id,
      row_number() over (
        order by
          coalesce(b.is_pinned, false) desc,
          b.sent_at desc nulls last,
          b.created_at desc
      ) as rn
    from public.broadcasts b
    where b.status = 'sent'
      and public.broadcast_visible_to_reader(b)
  ) o
  where o.rn = v_rn - 1;

  select o.id
  into v_next
  from (
    select
      b.id,
      row_number() over (
        order by
          coalesce(b.is_pinned, false) desc,
          b.sent_at desc nulls last,
          b.created_at desc
      ) as rn
    from public.broadcasts b
    where b.status = 'sent'
      and public.broadcast_visible_to_reader(b)
  ) o
  where o.rn = v_rn + 1;

  return jsonb_build_object(
    'index', v_rn,
    'total', v_total,
    'prev_id', v_prev,
    'next_id', v_next
  );
end;
$$;

revoke all on function public.broadcast_feed_navigation(uuid) from public;
grant execute on function public.broadcast_feed_navigation(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Prevent bumping sent_at on sent rows (stops “infinite edit window”)
-- ---------------------------------------------------------------------------

create or replace function public.broadcasts_prevent_sent_timestamp_change()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'UPDATE' and old.status = 'sent' and new.status = 'sent' then
    if new.sent_at is distinct from old.sent_at then
      raise exception 'sent_at cannot be changed on sent broadcasts';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists broadcasts_prevent_sent_timestamp_change_trg on public.broadcasts;

create trigger broadcasts_prevent_sent_timestamp_change_trg
before update on public.broadcasts
for each row
execute function public.broadcasts_prevent_sent_timestamp_change();

-- ---------------------------------------------------------------------------
-- Broaden creator update policy: recent sent (1 hour) + keep scheduled/draft
-- ---------------------------------------------------------------------------

drop policy if exists broadcasts_update_creator on public.broadcasts;

create policy broadcasts_update_creator
  on public.broadcasts
  for update
  to authenticated
  using (
    created_by = auth.uid()
    and (
      status in ('draft', 'scheduled', 'pending_approval')
      or (
        status = 'sent'
        and sent_at is not null
        and sent_at > now() - interval '1 hour'
      )
    )
  )
  with check (
    created_by = auth.uid()
    and org_id = public.current_org_id()
    and public.user_may_broadcast_to_dept(dept_id)
    and (
      (
        status = 'sent'
        and sent_at is not null
        and sent_at > now() - interval '1 hour'
      )
      or public.broadcast_form_allowed(
        status,
        dept_id,
        coalesce(is_org_wide, false),
        coalesce(is_mandatory, false),
        coalesce(is_pinned, false)
      )
      or status = 'cancelled'
    )
  );

-- Tighten “edit others”: sent only within same 1h window
drop policy if exists broadcasts_update_edit_others on public.broadcasts;

create policy broadcasts_update_edit_others
  on public.broadcasts
  for update
  to authenticated
  using (
    org_id = public.current_org_id()
    and created_by is distinct from auth.uid()
    and (
      status in ('draft', 'pending_approval', 'scheduled')
      or (
        status = 'sent'
        and sent_at is not null
        and sent_at > now() - interval '1 hour'
      )
    )
    and public.user_has_any_dept_broadcast_permission(auth.uid(), 'edit_others_broadcasts')
  )
  with check (
    org_id = public.current_org_id()
    and (
      (
        status = 'sent'
        and sent_at is not null
        and sent_at > now() - interval '1 hour'
      )
      or public.broadcast_form_allowed(
        status,
        dept_id,
        coalesce(is_org_wide, false),
        coalesce(is_mandatory, false),
        coalesce(is_pinned, false)
      )
      or status = 'cancelled'
    )
  );

-- ---------------------------------------------------------------------------
-- UI helper: may user open the edit form for this broadcast
-- ---------------------------------------------------------------------------

create or replace function public.broadcast_may_edit_content(p_broadcast_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  b public.broadcasts%rowtype;
begin
  select * into b from public.broadcasts where id = p_broadcast_id;
  if not found then
    return false;
  end if;

  if b.org_id is distinct from public.current_org_id() then
    return false;
  end if;

  if b.created_by = auth.uid() then
    if b.status in ('draft', 'scheduled', 'pending_approval') then
      return true;
    end if;
    if b.status = 'sent'
      and b.sent_at is not null
      and b.sent_at > now() - interval '1 hour'
    then
      return true;
    end if;
    return false;
  end if;

  if not public.user_has_any_dept_broadcast_permission(auth.uid(), 'edit_others_broadcasts') then
    return false;
  end if;

  if b.status in ('draft', 'pending_approval', 'scheduled') then
    return true;
  end if;

  if b.status = 'sent'
    and b.sent_at is not null
    and b.sent_at > now() - interval '1 hour'
  then
    return true;
  end if;

  return false;
end;
$$;

revoke all on function public.broadcast_may_edit_content(uuid) from public;
grant execute on function public.broadcast_may_edit_content(uuid) to authenticated;
