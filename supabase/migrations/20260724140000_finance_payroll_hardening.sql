-- Finance payroll hardening:
-- - manager -> finance approval lifecycle
-- - frequency + policy controls
-- - configurable pay elements
-- - SSP org overrides
-- - audit metadata for manual overrides and payments

create table if not exists public.payroll_policy_settings (
  org_id uuid primary key references public.organisations (id) on delete cascade,
  hourly_holiday_pay_percent numeric(8, 4) not null default 0 check (hourly_holiday_pay_percent >= 0),
  allow_bi_weekly boolean not null default true,
  realtime_enabled boolean not null default true,
  require_manager_approval boolean not null default true,
  require_finance_approval boolean not null default true,
  ssp_override_enabled boolean not null default false,
  ssp_override_weekly_rate_gbp numeric(14, 4),
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.payroll_pay_elements (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete cascade,
  code text not null,
  name text not null,
  emoji text,
  element_type text not null default 'hourly' check (element_type in ('hourly', 'fixed', 'multiplier')),
  applies_to_role text check (applies_to_role in ('csa', 'dm', 'all', 'custom')),
  applies_to_contract text check (applies_to_contract in ('zero_hours', 'part_time', 'full_time', 'all')),
  hourly_rate_gbp numeric(14, 4),
  fixed_amount_gbp numeric(14, 4),
  holiday_inclusive boolean not null default false,
  holiday_percent numeric(8, 4),
  effective_from date not null,
  effective_to date,
  is_active boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (org_id, code, effective_from)
);

create index if not exists payroll_pay_elements_org_effective_idx
  on public.payroll_pay_elements (org_id, effective_from desc);

create table if not exists public.payroll_wagesheet_reviews (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  week_start_date date not null,
  review_status text not null default 'pending_manager'
    check (review_status in ('pending_manager', 'manager_approved', 'pending_finance', 'finance_approved', 'paid')),
  manager_approved_by uuid references public.profiles (id) on delete set null,
  manager_approved_at timestamptz,
  manager_note text,
  finance_approved_by uuid references public.profiles (id) on delete set null,
  finance_approved_at timestamptz,
  finance_note text,
  paid_by uuid references public.profiles (id) on delete set null,
  paid_at timestamptz,
  payment_reference text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, user_id, week_start_date)
);

create index if not exists payroll_wagesheet_reviews_org_week_idx
  on public.payroll_wagesheet_reviews (org_id, week_start_date desc, review_status);

alter table public.payroll_manual_adjustments
  add column if not exists source_type text not null default 'manual_override'
    check (source_type in ('manual_override', 'rota_fallback', 'clock_missed', 'holiday_overrun', 'ssp_override', 'custom')),
  add column if not exists request_status text not null default 'pending_finance'
    check (request_status in ('pending_finance', 'approved', 'rejected')),
  add column if not exists requested_by uuid references public.profiles (id) on delete set null,
  add column if not exists requested_at timestamptz not null default now(),
  add column if not exists approved_by uuid references public.profiles (id) on delete set null,
  add column if not exists approved_at timestamptz,
  add column if not exists approval_note text;

insert into public.permission_catalog (key, label, description, is_founder_only)
values
  ('payroll.finance_approve', 'Finance approve payroll', 'Final approval for wagesheets, overrides, and payment release.', false),
  ('payroll.pay_elements.manage', 'Manage pay elements', 'Create and maintain configurable payroll pay elements.', false),
  ('payroll.policy.manage', 'Manage payroll policy', 'Manage payroll policy settings including holiday uplift and SSP overrides.', false)
on conflict (key) do update
set
  label = excluded.label,
  description = excluded.description;

insert into public.org_role_permissions (role_id, permission_key)
select r.id, p.permission_key
from public.org_roles r
join (
  values
    ('org_admin', 'payroll.finance_approve'),
    ('org_admin', 'payroll.pay_elements.manage'),
    ('org_admin', 'payroll.policy.manage'),
    ('manager', 'payroll.view')
) as p(role_key, permission_key)
  on p.role_key = r.key
  and r.is_archived = false
on conflict do nothing;

alter table public.payroll_policy_settings enable row level security;
alter table public.payroll_pay_elements enable row level security;
alter table public.payroll_wagesheet_reviews enable row level security;

drop policy if exists payroll_policy_settings_select on public.payroll_policy_settings;
create policy payroll_policy_settings_select
  on public.payroll_policy_settings for select to authenticated
  using (
    org_id = public.current_org_id()
    and (
      public.has_permission(auth.uid(), org_id, 'payroll.view', '{}'::jsonb)
      or public.has_permission(auth.uid(), org_id, 'payroll.manage', '{}'::jsonb)
      or public.has_permission(auth.uid(), org_id, 'hr.view_records', '{}'::jsonb)
    )
  );

drop policy if exists payroll_policy_settings_manage on public.payroll_policy_settings;
create policy payroll_policy_settings_manage
  on public.payroll_policy_settings for all to authenticated
  using (
    org_id = public.current_org_id()
    and (
      public.has_permission(auth.uid(), org_id, 'payroll.policy.manage', '{}'::jsonb)
      or public.has_permission(auth.uid(), org_id, 'payroll.manage', '{}'::jsonb)
    )
  )
  with check (
    org_id = public.current_org_id()
    and (
      public.has_permission(auth.uid(), org_id, 'payroll.policy.manage', '{}'::jsonb)
      or public.has_permission(auth.uid(), org_id, 'payroll.manage', '{}'::jsonb)
    )
  );

drop policy if exists payroll_pay_elements_select on public.payroll_pay_elements;
create policy payroll_pay_elements_select
  on public.payroll_pay_elements for select to authenticated
  using (
    org_id = public.current_org_id()
    and (
      public.has_permission(auth.uid(), org_id, 'payroll.view', '{}'::jsonb)
      or public.has_permission(auth.uid(), org_id, 'payroll.manage', '{}'::jsonb)
      or public.has_permission(auth.uid(), org_id, 'hr.view_records', '{}'::jsonb)
    )
  );

drop policy if exists payroll_pay_elements_manage on public.payroll_pay_elements;
create policy payroll_pay_elements_manage
  on public.payroll_pay_elements for all to authenticated
  using (
    org_id = public.current_org_id()
    and (
      public.has_permission(auth.uid(), org_id, 'payroll.pay_elements.manage', '{}'::jsonb)
      or public.has_permission(auth.uid(), org_id, 'payroll.manage', '{}'::jsonb)
    )
  )
  with check (
    org_id = public.current_org_id()
    and (
      public.has_permission(auth.uid(), org_id, 'payroll.pay_elements.manage', '{}'::jsonb)
      or public.has_permission(auth.uid(), org_id, 'payroll.manage', '{}'::jsonb)
    )
  );

drop policy if exists payroll_wagesheet_reviews_select on public.payroll_wagesheet_reviews;
create policy payroll_wagesheet_reviews_select
  on public.payroll_wagesheet_reviews for select to authenticated
  using (
    org_id = public.current_org_id()
    and (
      public.has_permission(auth.uid(), org_id, 'payroll.view', '{}'::jsonb)
      or public.has_permission(auth.uid(), org_id, 'payroll.manage', '{}'::jsonb)
      or public.has_permission(auth.uid(), org_id, 'leave.manage_org', '{}'::jsonb)
      or (
        public.has_permission(auth.uid(), org_id, 'leave.approve_direct_reports', '{}'::jsonb)
        and exists (
          select 1 from public.profiles s
          where s.id = payroll_wagesheet_reviews.user_id
            and s.reports_to_user_id = auth.uid()
        )
      )
    )
  );

drop policy if exists payroll_wagesheet_reviews_manage on public.payroll_wagesheet_reviews;
create policy payroll_wagesheet_reviews_manage
  on public.payroll_wagesheet_reviews for all to authenticated
  using (
    org_id = public.current_org_id()
    and (
      public.has_permission(auth.uid(), org_id, 'leave.manage_org', '{}'::jsonb)
      or public.has_permission(auth.uid(), org_id, 'payroll.finance_approve', '{}'::jsonb)
      or public.has_permission(auth.uid(), org_id, 'payroll.manage', '{}'::jsonb)
      or (
        public.has_permission(auth.uid(), org_id, 'leave.approve_direct_reports', '{}'::jsonb)
        and exists (
          select 1 from public.profiles s
          where s.id = payroll_wagesheet_reviews.user_id
            and s.reports_to_user_id = auth.uid()
        )
      )
    )
  )
  with check (
    org_id = public.current_org_id()
    and (
      public.has_permission(auth.uid(), org_id, 'leave.manage_org', '{}'::jsonb)
      or public.has_permission(auth.uid(), org_id, 'payroll.finance_approve', '{}'::jsonb)
      or public.has_permission(auth.uid(), org_id, 'payroll.manage', '{}'::jsonb)
      or (
        public.has_permission(auth.uid(), org_id, 'leave.approve_direct_reports', '{}'::jsonb)
        and exists (
          select 1 from public.profiles s
          where s.id = payroll_wagesheet_reviews.user_id
            and s.reports_to_user_id = auth.uid()
        )
      )
    )
  );

create or replace function public.payroll_policy_settings_upsert(
  p_hourly_holiday_pay_percent numeric default null,
  p_allow_bi_weekly boolean default null,
  p_realtime_enabled boolean default null,
  p_require_manager_approval boolean default null,
  p_require_finance_approval boolean default null,
  p_ssp_override_enabled boolean default null,
  p_ssp_override_weekly_rate_gbp numeric default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;

  select org_id into v_org from public.profiles where id = v_uid and status = 'active';
  if v_org is null then
    raise exception 'no active org';
  end if;

  if not (
    public.has_permission(v_uid, v_org, 'payroll.policy.manage', '{}'::jsonb)
    or public.has_permission(v_uid, v_org, 'payroll.manage', '{}'::jsonb)
  ) then
    raise exception 'not allowed';
  end if;

  insert into public.payroll_policy_settings (
    org_id,
    hourly_holiday_pay_percent,
    allow_bi_weekly,
    realtime_enabled,
    require_manager_approval,
    require_finance_approval,
    ssp_override_enabled,
    ssp_override_weekly_rate_gbp,
    updated_by,
    updated_at
  )
  values (
    v_org,
    coalesce(p_hourly_holiday_pay_percent, 0),
    coalesce(p_allow_bi_weekly, true),
    coalesce(p_realtime_enabled, true),
    coalesce(p_require_manager_approval, true),
    coalesce(p_require_finance_approval, true),
    coalesce(p_ssp_override_enabled, false),
    p_ssp_override_weekly_rate_gbp,
    v_uid,
    now()
  )
  on conflict (org_id) do update set
    hourly_holiday_pay_percent = coalesce(p_hourly_holiday_pay_percent, payroll_policy_settings.hourly_holiday_pay_percent),
    allow_bi_weekly = coalesce(p_allow_bi_weekly, payroll_policy_settings.allow_bi_weekly),
    realtime_enabled = coalesce(p_realtime_enabled, payroll_policy_settings.realtime_enabled),
    require_manager_approval = coalesce(p_require_manager_approval, payroll_policy_settings.require_manager_approval),
    require_finance_approval = coalesce(p_require_finance_approval, payroll_policy_settings.require_finance_approval),
    ssp_override_enabled = coalesce(p_ssp_override_enabled, payroll_policy_settings.ssp_override_enabled),
    ssp_override_weekly_rate_gbp = coalesce(p_ssp_override_weekly_rate_gbp, payroll_policy_settings.ssp_override_weekly_rate_gbp),
    updated_by = v_uid,
    updated_at = now();
end;
$$;

revoke all on function public.payroll_policy_settings_upsert(numeric, boolean, boolean, boolean, boolean, boolean, numeric) from public;
grant execute on function public.payroll_policy_settings_upsert(numeric, boolean, boolean, boolean, boolean, boolean, numeric) to authenticated;

create or replace function public.payroll_wagesheet_review_decide(
  p_user_id uuid,
  p_week_start date,
  p_decision text,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_current_status text;
  v_has_finance boolean := false;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if p_decision not in ('manager_approve', 'finance_approve', 'reject', 'mark_paid') then
    raise exception 'invalid decision';
  end if;

  select org_id into v_org from public.profiles where id = v_uid and status = 'active';
  if v_org is null then
    raise exception 'no active org';
  end if;

  v_has_finance := public.has_permission(v_uid, v_org, 'payroll.finance_approve', '{}'::jsonb)
    or public.has_permission(v_uid, v_org, 'payroll.manage', '{}'::jsonb);

  insert into public.payroll_wagesheet_reviews (org_id, user_id, week_start_date)
  values (v_org, p_user_id, p_week_start)
  on conflict (org_id, user_id, week_start_date) do nothing;

  select review_status into v_current_status
  from public.payroll_wagesheet_reviews
  where org_id = v_org and user_id = p_user_id and week_start_date = p_week_start
  for update;

  if p_decision = 'manager_approve' then
    if not (
      public.has_permission(v_uid, v_org, 'leave.manage_org', '{}'::jsonb)
      or (
        public.has_permission(v_uid, v_org, 'leave.approve_direct_reports', '{}'::jsonb)
        and exists (select 1 from public.profiles s where s.id = p_user_id and s.reports_to_user_id = v_uid)
      )
    ) then
      raise exception 'not allowed';
    end if;
    update public.payroll_wagesheet_reviews
    set
      review_status = 'pending_finance',
      manager_approved_by = v_uid,
      manager_approved_at = now(),
      manager_note = nullif(trim(coalesce(p_note, '')), ''),
      updated_at = now()
    where org_id = v_org and user_id = p_user_id and week_start_date = p_week_start;
    return;
  end if;

  if p_decision = 'finance_approve' then
    if not v_has_finance then
      raise exception 'not allowed';
    end if;
    if v_current_status not in ('pending_finance', 'manager_approved') then
      raise exception 'manager approval required first';
    end if;
    update public.payroll_wagesheet_reviews
    set
      review_status = 'finance_approved',
      finance_approved_by = v_uid,
      finance_approved_at = now(),
      finance_note = nullif(trim(coalesce(p_note, '')), ''),
      updated_at = now()
    where org_id = v_org and user_id = p_user_id and week_start_date = p_week_start;
    return;
  end if;

  if p_decision = 'mark_paid' then
    if not v_has_finance then
      raise exception 'not allowed';
    end if;
    if v_current_status <> 'finance_approved' then
      raise exception 'finance approval required first';
    end if;
    update public.payroll_wagesheet_reviews
    set
      review_status = 'paid',
      paid_by = v_uid,
      paid_at = now(),
      payment_reference = nullif(trim(coalesce(p_note, '')), ''),
      updated_at = now()
    where org_id = v_org and user_id = p_user_id and week_start_date = p_week_start;
    return;
  end if;

  if p_decision = 'reject' then
    if not (
      public.has_permission(v_uid, v_org, 'leave.manage_org', '{}'::jsonb)
      or public.has_permission(v_uid, v_org, 'leave.approve_direct_reports', '{}'::jsonb)
      or v_has_finance
    ) then
      raise exception 'not allowed';
    end if;
    update public.payroll_wagesheet_reviews
    set
      review_status = 'pending_manager',
      finance_note = nullif(trim(coalesce(p_note, '')), ''),
      updated_at = now()
    where org_id = v_org and user_id = p_user_id and week_start_date = p_week_start;
    return;
  end if;
end;
$$;

revoke all on function public.payroll_wagesheet_review_decide(uuid, date, text, text) from public;
grant execute on function public.payroll_wagesheet_review_decide(uuid, date, text, text) to authenticated;

create or replace function public.weekly_timesheet_manager_decide(
  p_user_id uuid,
  p_week_start date,
  p_decision text,
  p_approved_minutes integer default null,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  tid uuid;
  st text;
  rep int;
  appr int;
  v_hr public.employee_hr_records;
  v_rate numeric;
  v_hours numeric;
  v_gross numeric;
  v_ssp jsonb;
  v_ssp_amt numeric;
  v_ssp_override_enabled boolean := false;
  v_ssp_override_rate numeric;
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if p_decision not in ('approve', 'reject') then
    raise exception 'invalid decision';
  end if;

  select org_id into v_org from public.profiles where id = v_uid and status = 'active';
  if v_org is null then
    raise exception 'no active org';
  end if;

  if not (
    public.has_permission(v_uid, v_org, 'leave.manage_org', '{}'::jsonb)
    or (
      public.has_permission(v_uid, v_org, 'leave.approve_direct_reports', '{}'::jsonb)
      and exists (select 1 from public.profiles s where s.id = p_user_id and s.reports_to_user_id = v_uid)
    )
  ) then
    raise exception 'not allowed';
  end if;

  select id, status, reported_total_minutes into tid, st, rep
  from public.weekly_timesheets
  where org_id = v_org and user_id = p_user_id and week_start_date = p_week_start;
  if tid is null then
    raise exception 'timesheet not found';
  end if;
  if st <> 'submitted' then
    raise exception 'timesheet must be submitted';
  end if;

  if p_decision = 'reject' then
    update public.weekly_timesheets
    set status = 'rejected',
        decided_at = now(),
        decided_by = v_uid,
        decision_note = nullif(trim(coalesce(p_note, '')), ''),
        updated_at = now()
    where id = tid;
    return;
  end if;

  appr := coalesce(p_approved_minutes, rep);
  if appr is null or appr < 0 then
    raise exception 'invalid approved minutes';
  end if;

  update public.weekly_timesheets
  set status = 'approved',
      approved_total_minutes = appr,
      decided_at = now(),
      decided_by = v_uid,
      decision_note = nullif(trim(coalesce(p_note, '')), ''),
      updated_at = now()
  where id = tid;

  select * into v_hr from public.employee_hr_records
  where org_id = v_org and user_id = p_user_id;

  v_rate := v_hr.hourly_pay_gbp;
  v_hours := round((appr::numeric / 60.0)::numeric, 4);
  v_gross := case when v_rate is not null then round(v_hours * v_rate, 2) else 0 end;

  delete from public.wagesheet_lines
  where org_id = v_org and user_id = p_user_id and week_start_date = p_week_start;

  insert into public.wagesheet_lines (
    org_id, user_id, week_start_date, line_type, description, hours, hourly_rate_gbp, amount_gbp, meta
  )
  values (
    v_org, p_user_id, p_week_start, 'basic_pay', 'Approved hours × hourly rate',
    v_hours, v_rate, coalesce(v_gross, 0),
    jsonb_build_object('approved_minutes', appr, 'reported_minutes', rep)
  );

  select ssp_override_enabled, ssp_override_weekly_rate_gbp
  into v_ssp_override_enabled, v_ssp_override_rate
  from public.payroll_policy_settings
  where org_id = v_org;

  if coalesce(v_ssp_override_enabled, false) and v_ssp_override_rate is not null then
    v_ssp_amt := v_ssp_override_rate;
    v_ssp := jsonb_build_object('scheme', 'org_override', 'total_ssp_gbp', v_ssp_override_rate);
  else
    v_ssp := public.ssp_calculation_summary(p_user_id, p_week_start, p_week_start + 6);
    v_ssp_amt := coalesce((v_ssp->>'total_ssp_gbp')::numeric, 0);
  end if;

  if v_ssp_amt > 0 then
    insert into public.wagesheet_lines (
      org_id, user_id, week_start_date, line_type, description, hours, hourly_rate_gbp, amount_gbp, meta
    )
    values (
      v_org, p_user_id, p_week_start, 'ssp', 'Statutory Sick Pay', null, null, v_ssp_amt,
      coalesce(v_ssp, '{}'::jsonb)
    );
  end if;

  insert into public.payroll_wagesheet_reviews (
    org_id, user_id, week_start_date, review_status, manager_approved_by, manager_approved_at, manager_note, updated_at
  )
  values (
    v_org, p_user_id, p_week_start, 'pending_finance', v_uid, now(), nullif(trim(coalesce(p_note, '')), ''), now()
  )
  on conflict (org_id, user_id, week_start_date) do update
    set review_status = 'pending_finance',
        manager_approved_by = v_uid,
        manager_approved_at = now(),
        manager_note = excluded.manager_note,
        updated_at = now();
end;
$$;

revoke all on function public.weekly_timesheet_manager_decide(uuid, date, text, integer, text) from public;
grant execute on function public.weekly_timesheet_manager_decide(uuid, date, text, integer, text) to authenticated;
