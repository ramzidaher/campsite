-- Dedupe log for pending-member approval request email fanout.
-- Prevents repeat sends when pending page refreshes/retries.

create table if not exists public.pending_profile_notification_emails (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  org_id uuid not null references public.organisations(id) on delete cascade,
  sent_at timestamptz not null default now()
);

create index if not exists pending_profile_notification_emails_org_idx
  on public.pending_profile_notification_emails (org_id, sent_at desc);

alter table public.pending_profile_notification_emails enable row level security;

drop policy if exists pending_profile_notification_emails_deny on public.pending_profile_notification_emails;
create policy pending_profile_notification_emails_deny
  on public.pending_profile_notification_emails
  for all
  to authenticated
  using (false)
  with check (false);
