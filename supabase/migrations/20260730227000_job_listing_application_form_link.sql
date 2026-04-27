-- Link job adverts to reusable application form sets.

alter table public.job_listings
  add column if not exists application_question_set_id uuid null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'job_listings_application_question_set_id_fkey'
  ) then
    alter table public.job_listings
      add constraint job_listings_application_question_set_id_fkey
      foreign key (application_question_set_id)
      references public.org_application_question_sets (id)
      on delete set null;
  end if;
end
$$;

create index if not exists job_listings_application_question_set_id_idx
  on public.job_listings (application_question_set_id);

create or replace function public.job_listings_validate_application_question_set_org()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_set_org uuid;
begin
  if new.application_question_set_id is null then
    return new;
  end if;

  select s.org_id
  into v_set_org
  from public.org_application_question_sets s
  where s.id = new.application_question_set_id;

  if v_set_org is null then
    raise exception 'application question set not found';
  end if;

  if v_set_org <> new.org_id then
    raise exception 'application question set must belong to the same organisation';
  end if;

  return new;
end;
$$;

drop trigger if exists job_listings_validate_application_question_set_org_trg
  on public.job_listings;
create trigger job_listings_validate_application_question_set_org_trg
  before insert or update of application_question_set_id, org_id
  on public.job_listings
  for each row
  execute function public.job_listings_validate_application_question_set_org();
