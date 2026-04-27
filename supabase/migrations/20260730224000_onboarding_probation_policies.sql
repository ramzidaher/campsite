-- Add RLS policies for onboarding_probation_checkpoints and supporting FK indexes.

create index if not exists onboarding_probation_checkpoints_job_application_id_idx
  on public.onboarding_probation_checkpoints (job_application_id);

create index if not exists onboarding_probation_checkpoints_completed_by_idx
  on public.onboarding_probation_checkpoints (completed_by);

alter table public.onboarding_probation_checkpoints enable row level security;

drop policy if exists onboarding_probation_checkpoints_select on public.onboarding_probation_checkpoints;
create policy onboarding_probation_checkpoints_select
  on public.onboarding_probation_checkpoints
  for select
  to authenticated
  using (
    org_id = public.current_org_id()
    and (
      public.has_permission(auth.uid(), org_id, 'onboarding.manage_runs', '{}'::jsonb)
      or public.has_permission(auth.uid(), org_id, 'hr.manage_records', '{}'::jsonb)
      or (
        user_id = auth.uid()
        and public.has_permission(auth.uid(), org_id, 'onboarding.complete_own_tasks', '{}'::jsonb)
      )
    )
  );

drop policy if exists onboarding_probation_checkpoints_insert on public.onboarding_probation_checkpoints;
create policy onboarding_probation_checkpoints_insert
  on public.onboarding_probation_checkpoints
  for insert
  to authenticated
  with check (
    org_id = public.current_org_id()
    and (
      public.has_permission(auth.uid(), org_id, 'onboarding.manage_runs', '{}'::jsonb)
      or public.has_permission(auth.uid(), org_id, 'hr.manage_records', '{}'::jsonb)
    )
  );

drop policy if exists onboarding_probation_checkpoints_update on public.onboarding_probation_checkpoints;
create policy onboarding_probation_checkpoints_update
  on public.onboarding_probation_checkpoints
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
