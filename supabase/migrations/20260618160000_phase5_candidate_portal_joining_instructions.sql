-- Phase 5: candidate portal should expose interview joining instructions.

create or replace function public.get_candidate_application_portal(p_portal_token text)
returns table (
  org_name text,
  job_title text,
  stage text,
  submitted_at timestamptz,
  interview_joining_instructions text,
  messages jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_tid text := nullif(trim(p_portal_token), '');
begin
  if v_tid is null then
    return;
  end if;

  return query
  select
    o.name::text,
    jl.title::text,
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
    )
  from public.job_applications ja
  join public.job_listings jl on jl.id = ja.job_listing_id
  join public.organisations o on o.id = ja.org_id
  where ja.portal_token = v_tid;
end;
$$;

grant execute on function public.get_candidate_application_portal(text) to anon, authenticated;
