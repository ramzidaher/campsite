-- Seed explicit retention defaults per org for key data domains.
-- Idempotent: only inserts missing (org_id, domain) active policies.

insert into public.privacy_retention_policies (
  org_id,
  domain,
  retention_days,
  legal_basis,
  action,
  exceptions,
  is_active,
  created_at,
  updated_at
)
select
  o.id as org_id,
  p.domain,
  p.retention_days,
  p.legal_basis,
  p.action,
  p.exceptions,
  true as is_active,
  now(),
  now()
from public.organisations o
cross join (
  values
    -- Compliance-oriented defaults; tune per tenant policy requirements.
    ('audit_logs', 2555, 'compliance_audit_obligation', 'anonymize', '[]'::jsonb),          -- ~7 years
    ('notifications', 90, 'operational_communication', 'delete', '[]'::jsonb),              -- 90 days
    ('job_queue_rows', 30, 'operational_processing_records', 'delete', '[]'::jsonb),        -- 30 days
    ('rate_limit_events', 3, 'abuse_prevention_security', 'delete', '[]'::jsonb),           -- 72 hours
    ('public_token_attempts', 3, 'abuse_prevention_security', 'delete', '[]'::jsonb),       -- 72 hours
    ('candidate_portal_access_events', 30, 'security_monitoring', 'delete', '[]'::jsonb)    -- 30 days
) as p(domain, retention_days, legal_basis, action, exceptions)
where not exists (
  select 1
  from public.privacy_retention_policies r
  where r.org_id = o.id
    and r.domain = p.domain
    and r.is_active = true
);

-- Helpful lookup index for retention sweeper jobs.
create index if not exists privacy_retention_policies_active_domain_idx
  on public.privacy_retention_policies (is_active, domain, org_id);
