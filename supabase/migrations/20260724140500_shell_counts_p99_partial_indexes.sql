-- Targeted partial indexes for shell badge/layout p99 tails.
-- These align exactly with high-frequency badge predicates.

create index if not exists profiles_org_pending_idx
  on public.profiles (org_id)
  where status = 'pending';

create index if not exists leave_requests_org_pending_workflow_idx
  on public.leave_requests (org_id, requester_id)
  where status in ('pending', 'pending_cancel', 'pending_edit');

create index if not exists toil_credit_requests_org_pending_idx
  on public.toil_credit_requests (org_id, requester_id)
  where status = 'pending';

create index if not exists recruitment_requests_org_pending_review_active_idx
  on public.recruitment_requests (org_id)
  where archived_at is null and status = 'pending_review';

create index if not exists performance_reviews_reviewer_self_submitted_idx
  on public.performance_reviews (reviewer_id)
  where status = 'self_submitted';

create index if not exists onboarding_runs_user_active_idx
  on public.onboarding_runs (user_id)
  where status = 'active';

create index if not exists rota_change_requests_org_pending_final_idx
  on public.rota_change_requests (org_id)
  where status = 'pending_final';

create index if not exists rota_change_requests_org_counterparty_pending_peer_idx
  on public.rota_change_requests (org_id, counterparty_user_id)
  where status = 'pending_peer' and counterparty_user_id is not null;

create index if not exists broadcasts_org_pending_approval_idx
  on public.broadcasts (org_id, dept_id)
  where status = 'pending_approval';
