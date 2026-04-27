-- Microsoft Outlook Calendar: per-user OAuth connections + interview event ids.

-- ---------------------------------------------------------------------------
-- microsoft_connections: one row per user per connection type.
-- Mirrors google_connections. Tokens stored server-side only.
-- ---------------------------------------------------------------------------

create table public.microsoft_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  microsoft_email text,
  updated_at timestamptz not null default now(),
  unique (user_id)
);

create index microsoft_connections_user_idx on public.microsoft_connections (user_id);

-- RLS: users can only read/write their own row.
alter table public.microsoft_connections enable row level security;

create policy "Own microsoft connection" on public.microsoft_connections
  for all using (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- interview_slot_outlook_events: per-panelist Outlook event id.
-- Mirrors interview_slot_google_events.
-- ---------------------------------------------------------------------------

create table public.interview_slot_outlook_events (
  id uuid primary key default gen_random_uuid(),
  slot_id uuid not null references public.interview_slots (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  event_id text not null,
  created_at timestamptz not null default now(),
  unique (slot_id, profile_id)
);

create index interview_slot_outlook_events_slot_idx on public.interview_slot_outlook_events (slot_id);

comment on table public.microsoft_connections is
  'Per-user Microsoft OAuth tokens for Outlook Calendar sync.';
comment on table public.interview_slot_outlook_events is
  'Outlook Calendar event ids per panelist, mirroring interview_slot_google_events.';
