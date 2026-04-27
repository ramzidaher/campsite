-- Hiring A-Z foundations:
-- 1) Pipeline stage expansion
-- 2) Contract assignment + pre-start readiness model
-- 3) Start confirmation and probation checkpoints
-- 4) Basic hiring KPI summary RPC

alter table public.job_applications
  drop constraint if exists job_applications_stage_check;

alter table public.job_applications
  add constraint job_applications_stage_check
  check (
    stage in (
      'applied',
      'screened',
      'assessed',
      'shortlisted',
      'interview_scheduled',
      'checks_cleared',
      'offer_approved',
      'offer_sent',
      'hired',
      'rejected'
    )
  );

create or replace function public.set_job_application_stage(
  p_application_id uuid,
  p_new_stage text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_viewer uuid := auth.uid();
  v_org uuid;
begin
  if v_viewer is null then
    raise exception 'not authenticated';
  end if;

  select p.org_id into v_org
  from public.profiles p
  where p.id = v_viewer;

  if v_org is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if not public.has_permission(v_viewer, v_org, 'applications.manage_stage', '{}'::jsonb)
     and not public.has_permission(v_viewer, v_org, 'applications.manage', '{}'::jsonb)
  then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  if p_new_stage not in (
    'applied',
    'screened',
    'assessed',
    'shortlisted',
    'interview_scheduled',
    'checks_cleared',
    'offer_approved',
    'offer_sent',
    'hired',
    'rejected'
  ) then
    raise exception 'invalid stage';
  end if;

  update public.job_applications ja
  set stage = p_new_stage
  where ja.id = p_application_id
    and ja.org_id = v_org;

  if not found then
    raise exception 'application not found' using errcode = '42501';
  end if;
end;
$$;

grant execute on function public.set_job_application_stage(uuid, text) to authenticated;

create table if not exists public.recruitment_contract_assignments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  job_application_id uuid not null references public.job_applications(id) on delete cascade,
  application_offer_id uuid not null references public.application_offers(id) on delete cascade,
  assigned_to_user_id uuid references public.profiles(id) on delete set null,
  contract_signed_on timestamptz not null,
  contract_document_url text not null,
  assigned_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_application_id)
);

create index if not exists recruitment_contract_assignments_org_idx
  on public.recruitment_contract_assignments (org_id, created_at desc);

create table if not exists public.hiring_start_readiness (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  job_application_id uuid not null references public.job_applications(id) on delete cascade,
  offer_id uuid references public.application_offers(id) on delete set null,
  contract_assigned boolean not null default false,
  rtw_required boolean not null default true,
  rtw_complete boolean not null default false,
  payroll_bank_complete boolean not null default false,
  payroll_tax_complete boolean not null default false,
  policy_ack_complete boolean not null default false,
  it_access_complete boolean not null default false,
  start_confirmed_at timestamptz,
  start_confirmed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_application_id)
);

create index if not exists hiring_start_readiness_org_idx
  on public.hiring_start_readiness (org_id, created_at desc);

alter table public.hiring_start_readiness enable row level security;
drop policy if exists hiring_start_readiness_select on public.hiring_start_readiness;
create policy hiring_start_readiness_select
  on public.hiring_start_readiness
  for select
  to authenticated
  using (
    org_id = public.current_org_id()
    and (
      public.has_permission(auth.uid(), org_id, 'recruitment.manage', '{}'::jsonb)
      or public.has_permission(auth.uid(), org_id, 'onboarding.manage_runs', '{}'::jsonb)
      or public.has_permission(auth.uid(), org_id, 'hr.manage_records', '{}'::jsonb)
    )
  );

drop policy if exists hiring_start_readiness_update on public.hiring_start_readiness;
create policy hiring_start_readiness_update
  on public.hiring_start_readiness
  for update
  to authenticated
  using (
    org_id = public.current_org_id()
    and (
      public.has_permission(auth.uid(), org_id, 'onboarding.manage_runs', '{}'::jsonb)
      or public.has_permission(auth.uid(), org_id, 'hr.manage_records', '{}'::jsonb)
    )
  )
  with check (
    org_id = public.current_org_id()
    and (
      public.has_permission(auth.uid(), org_id, 'onboarding.manage_runs', '{}'::jsonb)
      or public.has_permission(auth.uid(), org_id, 'hr.manage_records', '{}'::jsonb)
    )
  );

drop policy if exists hiring_start_readiness_insert on public.hiring_start_readiness;
create policy hiring_start_readiness_insert
  on public.hiring_start_readiness
  for insert
  to authenticated
  with check (
    org_id = public.current_org_id()
    and (
      public.has_permission(auth.uid(), org_id, 'recruitment.manage', '{}'::jsonb)
      or public.has_permission(auth.uid(), org_id, 'onboarding.manage_runs', '{}'::jsonb)
      or public.has_permission(auth.uid(), org_id, 'hr.manage_records', '{}'::jsonb)
    )
  );

create or replace function public.hiring_readiness_is_ready(p_row public.hiring_start_readiness)
returns boolean
language sql
immutable
as $$
  select
    p_row.contract_assigned
    and (not p_row.rtw_required or p_row.rtw_complete)
    and p_row.payroll_bank_complete
    and p_row.payroll_tax_complete
    and p_row.policy_ack_complete;
$$;

create or replace function public.hiring_confirm_start(
  p_job_application_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_row public.hiring_start_readiness%rowtype;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select p.org_id into v_org from public.profiles p where p.id = v_uid and p.status = 'active';
  if v_org is null then
    raise exception 'not allowed';
  end if;

  if not public.has_permission(v_uid, v_org, 'onboarding.manage_runs', '{}'::jsonb) then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  select * into v_row
  from public.hiring_start_readiness
  where job_application_id = p_job_application_id
    and org_id = v_org;

  if not found then
    raise exception 'readiness row not found';
  end if;

  if not public.hiring_readiness_is_ready(v_row) then
    raise exception 'pre-start checks incomplete';
  end if;

  update public.hiring_start_readiness
  set start_confirmed_at = now(),
      start_confirmed_by = v_uid,
      updated_at = now()
  where id = v_row.id;
end;
$$;

grant execute on function public.hiring_confirm_start(uuid) to authenticated;

create table if not exists public.onboarding_probation_checkpoints (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  job_application_id uuid references public.job_applications(id) on delete set null,
  checkpoint_day smallint not null check (checkpoint_day in (30, 60, 90)),
  due_on date not null,
  completed_at timestamptz,
  completed_by uuid references public.profiles(id) on delete set null,
  note text,
  created_at timestamptz not null default now(),
  unique (user_id, checkpoint_day, due_on)
);

create index if not exists onboarding_probation_checkpoints_org_due_idx
  on public.onboarding_probation_checkpoints (org_id, due_on);

create or replace function public.hiring_kpi_summary(p_org_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'requisitions_pending', (
      select count(*)::int
      from public.recruitment_requests r
      where r.org_id = p_org_id and r.archived_at is null and r.status = 'pending_review'
    ),
    'offers_sent', (
      select count(*)::int
      from public.application_offers o
      where o.org_id = p_org_id and o.status = 'sent'
    ),
    'offers_signed', (
      select count(*)::int
      from public.application_offers o
      where o.org_id = p_org_id and o.status = 'signed'
    ),
    'readiness_ready', (
      select count(*)::int
      from public.hiring_start_readiness hs
      where hs.org_id = p_org_id
        and hs.contract_assigned
        and (not hs.rtw_required or hs.rtw_complete)
        and hs.payroll_bank_complete
        and hs.payroll_tax_complete
        and hs.policy_ack_complete
    ),
    'starts_confirmed', (
      select count(*)::int
      from public.hiring_start_readiness hs
      where hs.org_id = p_org_id and hs.start_confirmed_at is not null
    )
  );
$$;

grant execute on function public.hiring_kpi_summary(uuid) to authenticated;
