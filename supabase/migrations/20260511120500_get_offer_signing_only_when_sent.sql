-- Only expose full letter HTML when status is still open for signing.

create or replace function public.get_application_offer_for_signing(p_portal_token text)
returns table (
  body_html text,
  status text,
  org_name text,
  candidate_name text,
  job_title text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_t text := nullif(trim(p_portal_token), '');
begin
  if v_t is null then
    return;
  end if;

  return query
  select
    case when o.status = 'sent' then o.body_html else '' end,
    o.status::text,
    org.name::text,
    ja.candidate_name::text,
    jl.title::text
  from public.application_offers o
  join public.job_applications ja on ja.id = o.job_application_id
  join public.organisations org on org.id = o.org_id
  join public.job_listings jl on jl.id = ja.job_listing_id
  where o.portal_token = v_t
    and org.is_active = true;
end;
$$;

grant execute on function public.get_application_offer_for_signing(text) to anon, authenticated;
