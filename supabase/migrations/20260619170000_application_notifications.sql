-- In-app notifications for recruitment applications.
--
-- Events:
--  1) new_submission  -> candidate submits a new application
--  2) stage_changed   -> team member changes application stage

create table if not exists public.application_notifications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  application_id uuid not null references public.job_applications(id) on delete cascade,
  job_listing_id uuid not null references public.job_listings(id) on delete cascade,
  kind text not null check (kind in ('new_submission', 'stage_changed')),
  old_stage text,
  new_stage text not null,
  candidate_name text not null,
  job_title text not null,
  actor_name text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists application_notifications_recipient_idx
  on public.application_notifications (recipient_id, read_at, created_at desc);

create index if not exists application_notifications_app_idx
  on public.application_notifications (application_id);

alter table public.application_notifications enable row level security;

drop policy if exists "users see own application notifications" on public.application_notifications;
create policy "users see own application notifications"
  on public.application_notifications for select
  using (recipient_id = auth.uid());

drop policy if exists "service role manages application notifications" on public.application_notifications;
create policy "service role manages application notifications"
  on public.application_notifications for all
  using (true)
  with check (true);

create or replace function public.application_notification_mark_read(p_notification_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.application_notifications
  set read_at = now()
  where id = p_notification_id
    and recipient_id = auth.uid()
    and read_at is null;
end;
$$;

revoke all on function public.application_notification_mark_read(uuid) from public;
grant execute on function public.application_notification_mark_read(uuid) to authenticated;

create or replace function public.application_notifications_mark_all_read()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.application_notifications
  set read_at = now()
  where recipient_id = auth.uid()
    and read_at is null;
end;
$$;

revoke all on function public.application_notifications_mark_all_read() from public;
grant execute on function public.application_notifications_mark_all_read() to authenticated;

create or replace function public.application_notifications_unread_count()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.application_notifications
  where recipient_id = auth.uid()
    and read_at is null;
$$;

revoke all on function public.application_notifications_unread_count() from public;
grant execute on function public.application_notifications_unread_count() to authenticated;

create or replace function public.application_notifications_for_me()
returns table (
  id uuid,
  application_id uuid,
  job_listing_id uuid,
  kind text,
  old_stage text,
  new_stage text,
  candidate_name text,
  job_title text,
  actor_name text,
  read_at timestamptz,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    n.id,
    n.application_id,
    n.job_listing_id,
    n.kind,
    n.old_stage,
    n.new_stage,
    n.candidate_name,
    n.job_title,
    n.actor_name,
    n.read_at,
    n.created_at
  from public.application_notifications n
  where n.recipient_id = auth.uid()
  order by n.created_at desc
  limit 75;
$$;

revoke all on function public.application_notifications_for_me() from public;
grant execute on function public.application_notifications_for_me() to authenticated;

create or replace function public.application_notify_new_submission(p_application_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_job_listing_id uuid;
  v_stage text;
  v_candidate_name text;
  v_job_title text;
begin
  select
    ja.org_id,
    ja.job_listing_id,
    ja.stage,
    ja.candidate_name,
    coalesce(jl.title, 'Role')
  into
    v_org_id,
    v_job_listing_id,
    v_stage,
    v_candidate_name,
    v_job_title
  from public.job_applications ja
  left join public.job_listings jl on jl.id = ja.job_listing_id
  where ja.id = p_application_id;

  if not found then return; end if;

  insert into public.application_notifications
    (org_id, recipient_id, application_id, job_listing_id, kind, new_stage, candidate_name, job_title)
  select
    v_org_id,
    ua.user_id,
    p_application_id,
    v_job_listing_id,
    'new_submission',
    v_stage,
    v_candidate_name,
    v_job_title
  from public.user_org_role_assignments ua
  join public.org_role_permissions orp on orp.role_id = ua.role_id
  join public.profiles p2 on p2.id = ua.user_id and p2.org_id = v_org_id and p2.status = 'active'
  where ua.org_id = v_org_id
    and orp.permission_key = 'applications.view'
  on conflict do nothing;
end;
$$;

revoke all on function public.application_notify_new_submission(uuid) from public;
grant execute on function public.application_notify_new_submission(uuid) to service_role;

create or replace function public.application_notify_stage_changed(
  p_application_id uuid,
  p_old_stage text,
  p_new_stage text,
  p_actor_name text default null,
  p_actor_user_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_job_listing_id uuid;
  v_candidate_name text;
  v_job_title text;
begin
  select
    ja.org_id,
    ja.job_listing_id,
    ja.candidate_name,
    coalesce(jl.title, 'Role')
  into
    v_org_id,
    v_job_listing_id,
    v_candidate_name,
    v_job_title
  from public.job_applications ja
  left join public.job_listings jl on jl.id = ja.job_listing_id
  where ja.id = p_application_id;

  if not found then return; end if;

  insert into public.application_notifications
    (
      org_id,
      recipient_id,
      application_id,
      job_listing_id,
      kind,
      old_stage,
      new_stage,
      candidate_name,
      job_title,
      actor_name
    )
  select
    v_org_id,
    ua.user_id,
    p_application_id,
    v_job_listing_id,
    'stage_changed',
    p_old_stage,
    p_new_stage,
    v_candidate_name,
    v_job_title,
    p_actor_name
  from public.user_org_role_assignments ua
  join public.org_role_permissions orp on orp.role_id = ua.role_id
  join public.profiles p2 on p2.id = ua.user_id and p2.org_id = v_org_id and p2.status = 'active'
  where ua.org_id = v_org_id
    and orp.permission_key = 'applications.view'
    and (p_actor_user_id is null or ua.user_id <> p_actor_user_id)
  on conflict do nothing;
end;
$$;

revoke all on function public.application_notify_stage_changed(uuid, text, text, text, uuid) from public;
grant execute on function public.application_notify_stage_changed(uuid, text, text, text, uuid) to service_role;

create or replace function public.application_notifications_on_submit_trg()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.application_notify_new_submission(new.id);
  return new;
end;
$$;

drop trigger if exists job_applications_notify_on_submit_trg on public.job_applications;
create trigger job_applications_notify_on_submit_trg
  after insert on public.job_applications
  for each row
  execute procedure public.application_notifications_on_submit_trg();
