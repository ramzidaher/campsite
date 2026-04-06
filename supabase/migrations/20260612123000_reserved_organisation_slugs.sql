-- Block workspace slugs that collide with platform hosts or common infrastructure labels.
-- Tenants use *.NEXT_PUBLIC_TENANT_ROOT_DOMAIN; platform admin uses admin.<apex> by default.

create or replace function public.organisation_slug_is_reserved(p_slug text)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select lower(trim(p_slug)) in (
    'admin',
    'www',
    'api',
    'app',
    'cdn',
    'static',
    'assets',
    'mail',
    'smtp',
    'ftp',
    'webhooks',
    'webhook',
    'status',
    'health',
    'metrics',
    'staging',
    'preview',
    'deploy',
    'docs',
    'help',
    'support',
    'localhost'
  );
$$;

create or replace function public.organisations_enforce_reserved_slug()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.slug is not null and public.organisation_slug_is_reserved(new.slug) then
    raise exception 'This URL is reserved for the platform. Choose a different workspace slug';
  end if;
  return new;
end;
$$;

drop trigger if exists organisations_reserved_slug_trg on public.organisations;

create trigger organisations_reserved_slug_trg
  before insert or update of slug on public.organisations
  for each row
  execute procedure public.organisations_enforce_reserved_slug();
