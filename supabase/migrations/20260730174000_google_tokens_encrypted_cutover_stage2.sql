-- Google token encryption cutover (stage 2).
-- Goals:
-- - Allow plaintext token columns to be nullable.
-- - Preserve compatibility while preferring encrypted fields.
-- - Scrub plaintext values when encrypted payloads are present.

alter table public.google_connections
  alter column access_token drop not null,
  alter column refresh_token drop not null;

-- Transitional integrity: either both encrypted are present, or both plaintext are present.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'google_connections_token_pair_presence_chk'
  ) then
    alter table public.google_connections
      add constraint google_connections_token_pair_presence_chk
      check (
        (
          access_token_encrypted is not null
          and refresh_token_encrypted is not null
        )
        or (
          access_token is not null
          and refresh_token is not null
        )
      ) not valid;
  end if;
end $$;

-- Keep metadata complete for already-encrypted rows.
update public.google_connections
set token_encrypted_at = coalesce(token_encrypted_at, updated_at, created_at, now())
where access_token_encrypted is not null
  and refresh_token_encrypted is not null
  and token_encrypted_at is null;

-- Scrub legacy plaintext where encrypted payloads are available.
update public.google_connections
set
  access_token = null,
  refresh_token = null,
  updated_at = now()
where access_token_encrypted is not null
  and refresh_token_encrypted is not null
  and (access_token is not null or refresh_token is not null);

alter table public.google_connections
  validate constraint google_connections_token_pair_presence_chk;

create index if not exists google_connections_missing_encrypted_tokens_idx
  on public.google_connections (user_id, type)
  where access_token_encrypted is null
     or refresh_token_encrypted is null;
