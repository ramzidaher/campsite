-- Enforce single-active-row guarantees and notification dedupe guarantees.
-- Includes pre-cleanup to avoid migration failures.

-- ---------------------------------------------------------------------------
-- 1) employee_bank_details: at most one active row per (org_id, user_id)
-- ---------------------------------------------------------------------------

with active_ranked as (
  select
    id,
    row_number() over (
      partition by org_id, user_id
      order by
        coalesce(reviewed_at, updated_at, created_at) desc,
        created_at desc,
        id desc
    ) as rn
  from public.employee_bank_details
  where is_active = true
)
update public.employee_bank_details t
set is_active = false,
    updated_at = now()
from active_ranked r
where t.id = r.id
  and r.rn > 1;

create unique index if not exists employee_bank_details_active_one_per_user_uq
  on public.employee_bank_details (org_id, user_id)
  where is_active = true;

-- ---------------------------------------------------------------------------
-- 2) employee_uk_tax_details: at most one active row per (org_id, user_id)
-- ---------------------------------------------------------------------------

with active_ranked as (
  select
    id,
    row_number() over (
      partition by org_id, user_id
      order by
        coalesce(reviewed_at, updated_at, created_at) desc,
        created_at desc,
        id desc
    ) as rn
  from public.employee_uk_tax_details
  where is_active = true
)
update public.employee_uk_tax_details t
set is_active = false,
    updated_at = now()
from active_ranked r
where t.id = r.id
  and r.rn > 1;

create unique index if not exists employee_uk_tax_details_active_one_per_user_uq
  on public.employee_uk_tax_details (org_id, user_id)
  where is_active = true;

-- ---------------------------------------------------------------------------
-- 3) hr_metric_notifications dedupe key enforcement
-- ---------------------------------------------------------------------------

with ranked as (
  select
    id,
    row_number() over (
      partition by recipient_id, dedupe_key
      order by created_at desc, id desc
    ) as rn
  from public.hr_metric_notifications
  where dedupe_key is not null
)
delete from public.hr_metric_notifications n
using ranked r
where n.id = r.id
  and r.rn > 1;

create unique index if not exists hr_metric_notifications_recipient_dedupe_uq
  on public.hr_metric_notifications (recipient_id, dedupe_key);
