-- Phase 2  Broadcasts: messaging, reads, search, push tokens, scheduling.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.broadcasts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete cascade,
  dept_id uuid not null references public.departments (id) on delete cascade,
  cat_id uuid not null references public.dept_categories (id) on delete cascade,
  title text not null,
  body text not null default '',
  status text not null default 'draft'
    check (status in ('draft', 'pending_approval', 'scheduled', 'sent', 'cancelled')),
  scheduled_at timestamptz,
  sent_at timestamptz,
  created_by uuid not null references public.profiles (id) on delete cascade,
  rejection_note text,
  reviewed_by uuid references public.profiles (id),
  reviewed_at timestamptz,
  notifications_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search_tsv tsvector generated always as (
    setweight(to_tsvector('english', coalesce(title, '')), 'A')
      || setweight(to_tsvector('english', coalesce(body, '')), 'B')
  ) stored
);

create index broadcasts_org_id_idx on public.broadcasts (org_id);
create index broadcasts_dept_id_idx on public.broadcasts (dept_id);
create index broadcasts_cat_id_idx on public.broadcasts (cat_id);
create index broadcasts_status_idx on public.broadcasts (status);
create index broadcasts_created_by_idx on public.broadcasts (created_by);
create index broadcasts_scheduled_at_idx on public.broadcasts (scheduled_at)
  where status = 'scheduled';
create index broadcasts_search_tsv_idx on public.broadcasts using gin (search_tsv);

create table public.broadcast_reads (
  broadcast_id uuid not null references public.broadcasts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (broadcast_id, user_id)
);

create index broadcast_reads_user_id_idx on public.broadcast_reads (user_id);

create table public.push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  token text not null,
  platform text not null check (platform in ('web', 'ios', 'android')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, token)
);

create index push_tokens_user_id_idx on public.push_tokens (user_id);

create table public.broadcast_notification_jobs (
  id uuid primary key default gen_random_uuid(),
  broadcast_id uuid not null references public.broadcasts (id) on delete cascade,
  created_at timestamptz not null default now(),
  processed_at timestamptz,
  attempts int not null default 0,
  last_error text,
  unique (broadcast_id)
);

-- ---------------------------------------------------------------------------
-- Triggers: validation + updated_at + notification job on send
-- ---------------------------------------------------------------------------

create or replace function public.broadcasts_validate_fn()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  d_org uuid;
  c_dept uuid;
  p_org uuid;
begin
  select d.org_id into d_org from public.departments d where d.id = new.dept_id;
  if d_org is null then
    raise exception 'Invalid department';
  end if;
  if new.org_id <> d_org then
    raise exception 'org_id must match department organisation';
  end if;

  select c.dept_id into c_dept from public.dept_categories c where c.id = new.cat_id;
  if c_dept is null or c_dept <> new.dept_id then
    raise exception 'Category must belong to the selected department';
  end if;

  select p.org_id into p_org from public.profiles p where p.id = new.created_by;
  if p_org is null or p_org <> new.org_id then
    raise exception 'Creator must belong to the same organisation';
  end if;

  return new;
end;
$$;

create trigger broadcasts_validate
before insert or update on public.broadcasts
for each row
execute procedure public.broadcasts_validate_fn();

create or replace function public.broadcasts_fill_sent_at()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'sent' and new.sent_at is null then
    new.sent_at := now();
  end if;
  return new;
end;
$$;

create trigger broadcasts_fill_sent_at
before insert or update on public.broadcasts
for each row
execute procedure public.broadcasts_fill_sent_at();

create or replace function public.broadcasts_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger broadcasts_updated_at
before update on public.broadcasts
for each row
execute procedure public.broadcasts_touch_updated_at();

create or replace function public.broadcasts_queue_notify_fn()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'sent' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    if new.notifications_sent_at is null then
      insert into public.broadcast_notification_jobs (broadcast_id)
      values (new.id)
      on conflict (broadcast_id) do nothing;
    end if;
  end if;
  return new;
end;
$$;

create trigger broadcasts_queue_notify
after insert or update on public.broadcasts
for each row
execute procedure public.broadcasts_queue_notify_fn();

-- ---------------------------------------------------------------------------
-- Permission helpers (security definer)
-- ---------------------------------------------------------------------------

create or replace function public.user_may_compose_broadcasts()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.status = 'active'
      and p.role in (
        'assistant',
        'coordinator',
        'manager',
        'senior_manager',
        'super_admin',
        'society_leader'
      )
  );
$$;

create or replace function public.user_may_broadcast_to_dept(p_dept_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text;
  v_org uuid;
  d record;
begin
  select p.role, p.org_id into v_role, v_org
  from public.profiles p
  where p.id = auth.uid();

  if v_org is null or v_role is null then
    return false;
  end if;

  select d.* into d
  from public.departments d
  where d.id = p_dept_id;

  if not found then
    return false;
  end if;

  if d.org_id <> v_org then
    return false;
  end if;

  case v_role
    when 'super_admin', 'senior_manager' then
      return true;
    when 'manager' then
      return exists (
        select 1 from public.dept_managers dm
        where dm.user_id = auth.uid() and dm.dept_id = p_dept_id
      );
    when 'coordinator' then
      return exists (
        select 1 from public.user_departments ud
        where ud.user_id = auth.uid() and ud.dept_id = p_dept_id
      );
    when 'assistant' then
      return exists (
        select 1 from public.user_departments ud
        where ud.user_id = auth.uid() and ud.dept_id = p_dept_id
      );
    when 'society_leader' then
      return d.type in ('society', 'club')
        and exists (
          select 1 from public.user_departments ud
          where ud.user_id = auth.uid() and ud.dept_id = p_dept_id
        );
    else
      return false;
  end case;
end;
$$;

create or replace function public.broadcast_status_allowed_for_insert(p_status text)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  select p.role into v_role from public.profiles p where p.id = auth.uid();

  if v_role = 'assistant' then
    return p_status in ('draft', 'pending_approval');
  elsif v_role in (
    'coordinator',
    'manager',
    'senior_manager',
    'super_admin',
    'society_leader'
  ) then
    return p_status in ('draft', 'pending_approval', 'scheduled', 'sent');
  end if;

  return false;
end;
$$;

create or replace function public.broadcast_visible_to_reader(b public.broadcasts)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_status text;
begin
  select p.org_id, p.status into v_org, v_status
  from public.profiles p
  where p.id = auth.uid();

  if v_org is null or v_org <> b.org_id then
    return false;
  end if;

  if v_status <> 'active' and auth.uid() <> b.created_by then
    return false;
  end if;

  if b.status = 'sent' then
    return (
      b.created_by = auth.uid()
      or exists (
        select 1 from public.user_subscriptions us
        where us.user_id = auth.uid()
          and us.cat_id = b.cat_id
          and us.subscribed = true
      )
      or exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.role in ('super_admin', 'senior_manager')
      )
    );
  end if;

  if b.status = 'draft' then
    return b.created_by = auth.uid();
  end if;

  if b.status = 'pending_approval' then
    return b.created_by = auth.uid()
      or exists (
        select 1 from public.dept_managers dm
        where dm.user_id = auth.uid()
          and dm.dept_id = b.dept_id
      )
      or exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.role in ('super_admin', 'senior_manager')
      );
  end if;

  if b.status in ('scheduled', 'cancelled') then
    return b.created_by = auth.uid()
      or exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.role in ('super_admin', 'senior_manager')
      );
  end if;

  return false;
end;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.broadcasts enable row level security;
alter table public.broadcast_reads enable row level security;
alter table public.push_tokens enable row level security;
alter table public.broadcast_notification_jobs enable row level security;

-- broadcasts  select
create policy broadcasts_select_visible
  on public.broadcasts
  for select
  to authenticated
  using (public.broadcast_visible_to_reader(broadcasts));

-- broadcasts  insert (cancelled only via update)
drop policy if exists broadcasts_insert_scoped on public.broadcasts;

create policy broadcasts_insert_scoped
  on public.broadcasts
  for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and org_id = public.current_org_id()
    and public.user_may_compose_broadcasts()
    and public.user_may_broadcast_to_dept(dept_id)
    and public.broadcast_status_allowed_for_insert(status)
    and status <> 'cancelled'
    and (
      status in ('draft', 'pending_approval')
      or (status = 'scheduled' and scheduled_at is not null)
      or (status = 'sent' and sent_at is not null)
    )
  );

-- broadcasts  update (creator)
create policy broadcasts_update_creator
  on public.broadcasts
  for update
  to authenticated
  using (
    created_by = auth.uid()
    and status in ('draft', 'scheduled', 'pending_approval')
  )
  with check (
    created_by = auth.uid()
    and org_id = public.current_org_id()
    and public.user_may_broadcast_to_dept(dept_id)
    and (
      public.broadcast_status_allowed_for_insert(status)
      or status = 'cancelled'
    )
  );

-- broadcasts  update (manager approval / senior admin)
create policy broadcasts_update_manager
  on public.broadcasts
  for update
  to authenticated
  using (
    status = 'pending_approval'
    and org_id = public.current_org_id()
    and (
      exists (
        select 1 from public.dept_managers dm
        where dm.user_id = auth.uid()
          and dm.dept_id = broadcasts.dept_id
      )
      or exists (
        select 1 from public.profiles p
        where p.id = auth.uid()
          and p.role in ('super_admin', 'senior_manager')
          and p.org_id = broadcasts.org_id
      )
    )
  )
  with check (
    org_id = public.current_org_id()
    and status in ('draft', 'scheduled', 'sent', 'cancelled')
  );

-- broadcast_reads
create policy broadcast_reads_select_own
  on public.broadcast_reads
  for select
  to authenticated
  using (
    user_id = auth.uid()
    or exists (
      select 1 from public.broadcasts b
      where b.id = broadcast_reads.broadcast_id
        and b.org_id = public.current_org_id()
        and public.broadcast_visible_to_reader(b)
    )
  );

create policy broadcast_reads_insert_self
  on public.broadcast_reads
  for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and exists (
      select 1 from public.broadcasts b
      where b.id = broadcast_id
        and b.status = 'sent'
        and public.broadcast_visible_to_reader(b)
    )
  );

create policy broadcast_reads_update_own
  on public.broadcast_reads
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- push_tokens
create policy push_tokens_all_self
  on public.push_tokens
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- notification jobs  service role only (no user access)
create policy broadcast_notification_jobs_deny
  on public.broadcast_notification_jobs
  for all
  to authenticated
  using (false)
  with check (false);

-- ---------------------------------------------------------------------------
-- Cron: send scheduled broadcasts (every minute)
-- ---------------------------------------------------------------------------

do $cron$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'send-scheduled-broadcasts',
      '* * * * *',
      $job$
        update public.broadcasts
        set
          status = 'sent',
          sent_at = coalesce(sent_at, now())
        where status = 'scheduled'
          and scheduled_at is not null
          and scheduled_at <= now();
      $job$
    );
  end if;
end;
$cron$;

-- ---------------------------------------------------------------------------
-- Search helper (full-text on title + body)
-- ---------------------------------------------------------------------------

create or replace function public.search_broadcasts(q text, limit_n int default 50)
returns setof public.broadcasts
language sql
stable
security definer
set search_path = public
as $$
  select b.*
  from public.broadcasts b
  where trim(coalesce(q, '')) <> ''
    and b.search_tsv @@ plainto_tsquery('english', trim(q))
    and public.broadcast_visible_to_reader(b)
  order by b.sent_at desc nulls last, b.created_at desc
  limit greatest(1, least(coalesce(limit_n, 50), 200));
$$;

grant execute on function public.search_broadcasts(text, int) to authenticated;

create or replace function public.broadcast_unread_count()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.broadcasts b
  where b.status = 'sent'
    and public.broadcast_visible_to_reader(b)
    and not exists (
      select 1 from public.broadcast_reads r
      where r.broadcast_id = b.id
        and r.user_id = auth.uid()
    );
$$;

grant execute on function public.broadcast_unread_count() to authenticated;

create or replace function public.broadcast_mark_all_read()
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  insert into public.broadcast_reads (broadcast_id, user_id)
  select b.id, auth.uid()
  from public.broadcasts b
  where b.status = 'sent'
    and public.broadcast_visible_to_reader(b)
  on conflict (broadcast_id, user_id) do nothing;
end;
$$;

grant execute on function public.broadcast_mark_all_read() to authenticated;
