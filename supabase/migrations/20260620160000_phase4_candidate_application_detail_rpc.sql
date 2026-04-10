-- Phase 4: authenticated candidate can load full tracker payload for their own application by id
-- (same shape as token-based portal, plus org/job slugs for deep links).

drop function if exists public.get_my_candidate_application_detail(uuid);

create or replace function public.get_my_candidate_application_detail(p_application_id uuid)
returns table (
  org_name text,
  org_slug text,
  job_title text,
  job_slug text,
  stage text,
  submitted_at timestamptz,
  interview_joining_instructions text,
  messages jsonb,
  portal_token text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_application_id is null then
    return;
  end if;

  return query
  select
    o.name::text,
    o.slug::text,
    jl.title::text,
    jl.slug::text,
    ja.stage::text,
    ja.submitted_at,
    ja.interview_joining_instructions::text,
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'body', m.body,
            'created_at', m.created_at
          )
          order by m.created_at nulls last
        )
        from public.job_application_messages m
        where m.job_application_id = ja.id
      ),
      '[]'::jsonb
    ),
    ja.portal_token::text
  from public.job_applications ja
  join public.job_listings jl on jl.id = ja.job_listing_id
  join public.organisations o on o.id = ja.org_id
  where ja.id = p_application_id
    and ja.candidate_user_id is not null
    and ja.candidate_user_id = auth.uid();
end;
$$;

grant execute on function public.get_my_candidate_application_detail(uuid) to authenticated;
