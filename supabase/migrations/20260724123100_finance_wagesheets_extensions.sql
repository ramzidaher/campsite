-- Finance payroll extensions: role rate history, employee pay profiles, manual overrides.

create table if not exists public.payroll_role_hourly_rates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete cascade,
  role_code text not null check (role_code in ('csa', 'dm')),
  effective_from date not null,
  effective_to date,
  hourly_rate_gbp numeric(14, 4) not null check (hourly_rate_gbp >= 0),
  notes text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists payroll_role_hourly_rates_org_role_date_idx
  on public.payroll_role_hourly_rates (org_id, role_code, effective_from desc);

create table if not exists public.payroll_employee_pay_profiles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  pay_role text not null check (pay_role in ('csa', 'dm')),
  notes text,
  updated_by uuid references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  unique (org_id, user_id)
);

create index if not exists payroll_employee_pay_profiles_org_idx
  on public.payroll_employee_pay_profiles (org_id, pay_role);

create table if not exists public.payroll_manual_adjustments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  week_start_date date not null,
  adjustment_code text not null default 'manual_override',
  amount_gbp numeric(14, 4) not null,
  note text,
  is_override boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null,
  updated_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, user_id, week_start_date, adjustment_code)
);

create index if not exists payroll_manual_adjustments_org_week_idx
  on public.payroll_manual_adjustments (org_id, week_start_date desc);

alter table public.payroll_role_hourly_rates enable row level security;
alter table public.payroll_employee_pay_profiles enable row level security;
alter table public.payroll_manual_adjustments enable row level security;

drop policy if exists payroll_role_hourly_rates_select on public.payroll_role_hourly_rates;
create policy payroll_role_hourly_rates_select
  on public.payroll_role_hourly_rates for select to authenticated
  using (
    org_id = public.current_org_id()
    and (
      public.has_permission(auth.uid(), org_id, 'payroll.view', '{}'::jsonb)
      or public.has_permission(auth.uid(), org_id, 'payroll.manage', '{}'::jsonb)
      or public.has_permission(auth.uid(), org_id, 'leave.manage_org', '{}'::jsonb)
    )
  );

drop policy if exists payroll_role_hourly_rates_manage on public.payroll_role_hourly_rates;
create policy payroll_role_hourly_rates_manage
  on public.payroll_role_hourly_rates for all to authenticated
  using (
    org_id = public.current_org_id()
    and public.has_permission(auth.uid(), org_id, 'payroll.manage', '{}'::jsonb)
  )
  with check (
    org_id = public.current_org_id()
    and public.has_permission(auth.uid(), org_id, 'payroll.manage', '{}'::jsonb)
  );

drop policy if exists payroll_employee_pay_profiles_select on public.payroll_employee_pay_profiles;
create policy payroll_employee_pay_profiles_select
  on public.payroll_employee_pay_profiles for select to authenticated
  using (
    org_id = public.current_org_id()
    and (
      public.has_permission(auth.uid(), org_id, 'payroll.view', '{}'::jsonb)
      or public.has_permission(auth.uid(), org_id, 'payroll.manage', '{}'::jsonb)
      or public.has_permission(auth.uid(), org_id, 'leave.manage_org', '{}'::jsonb)
    )
  );

drop policy if exists payroll_employee_pay_profiles_manage on public.payroll_employee_pay_profiles;
create policy payroll_employee_pay_profiles_manage
  on public.payroll_employee_pay_profiles for all to authenticated
  using (
    org_id = public.current_org_id()
    and public.has_permission(auth.uid(), org_id, 'payroll.manage', '{}'::jsonb)
  )
  with check (
    org_id = public.current_org_id()
    and public.has_permission(auth.uid(), org_id, 'payroll.manage', '{}'::jsonb)
  );

drop policy if exists payroll_manual_adjustments_select on public.payroll_manual_adjustments;
create policy payroll_manual_adjustments_select
  on public.payroll_manual_adjustments for select to authenticated
  using (
    org_id = public.current_org_id()
    and (
      public.has_permission(auth.uid(), org_id, 'payroll.view', '{}'::jsonb)
      or public.has_permission(auth.uid(), org_id, 'payroll.manage', '{}'::jsonb)
      or public.has_permission(auth.uid(), org_id, 'leave.manage_org', '{}'::jsonb)
    )
  );

drop policy if exists payroll_manual_adjustments_manage on public.payroll_manual_adjustments;
create policy payroll_manual_adjustments_manage
  on public.payroll_manual_adjustments for all to authenticated
  using (
    org_id = public.current_org_id()
    and public.has_permission(auth.uid(), org_id, 'payroll.manage', '{}'::jsonb)
  )
  with check (
    org_id = public.current_org_id()
    and public.has_permission(auth.uid(), org_id, 'payroll.manage', '{}'::jsonb)
  );
