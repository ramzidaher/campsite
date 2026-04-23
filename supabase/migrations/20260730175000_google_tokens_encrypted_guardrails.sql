-- Google token encryption guardrails.
-- Keeps rollout safe while preventing regression to plaintext storage.

create or replace function public.google_connections_encrypted_guard_trg_fn()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Encrypted pair must be complete if present.
  if (new.access_token_encrypted is null) <> (new.refresh_token_encrypted is null) then
    raise exception 'Encrypted Google token payload must include both access and refresh values'
      using errcode = '23514';
  end if;

  -- If encrypted payload is present, scrub plaintext columns.
  if new.access_token_encrypted is not null and new.refresh_token_encrypted is not null then
    new.access_token := null;
    new.refresh_token := null;
    new.token_encrypted_at := coalesce(new.token_encrypted_at, now());
  end if;

  return new;
end;
$$;

drop trigger if exists google_connections_encrypted_guard_trg on public.google_connections;
create trigger google_connections_encrypted_guard_trg
before insert or update of access_token, refresh_token, access_token_encrypted, refresh_token_encrypted, token_encrypted_at
on public.google_connections
for each row
execute function public.google_connections_encrypted_guard_trg_fn();

-- Optional strict cutover auto-enable: enforce encrypted-only if legacy plaintext rows are fully migrated.
do $$
declare
  v_missing_count bigint;
begin
  select count(*) into v_missing_count
  from public.google_connections
  where access_token_encrypted is null
     or refresh_token_encrypted is null;

  if v_missing_count = 0 then
    if not exists (
      select 1 from pg_constraint where conname = 'google_connections_encrypted_only_chk'
    ) then
      alter table public.google_connections
        add constraint google_connections_encrypted_only_chk
        check (
          access_token_encrypted is not null
          and refresh_token_encrypted is not null
          and access_token is null
          and refresh_token is null
        ) not valid;
    end if;

    alter table public.google_connections
      validate constraint google_connections_encrypted_only_chk;
  else
    raise notice 'google_connections encrypted-only constraint not enabled yet (% rows still missing encrypted payloads)', v_missing_count;
  end if;
end $$;
