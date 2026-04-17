-- Reusable application-question sets per organisation (for job edit UI; not shown to applicants).

create table if not exists public.org_application_question_sets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete cascade,
  name text not null
    constraint org_application_question_sets_name_nonempty check (length(trim(name)) >= 1)
    constraint org_application_question_sets_name_len check (char_length(name) <= 120),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.org_application_question_sets is
  'Named reusable question blocks for job listings; managed by HR with jobs.edit.';

create index if not exists org_application_question_sets_org_updated_idx
  on public.org_application_question_sets (org_id, updated_at desc);

create table if not exists public.org_application_question_set_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations (id) on delete cascade,
  set_id uuid not null references public.org_application_question_sets (id) on delete cascade,
  sort_order int not null default 0,
  question_type text not null
    check (question_type in ('short_text', 'paragraph', 'single_choice', 'yes_no')),
  prompt text not null,
  help_text text,
  required boolean not null default true,
  options jsonb,
  max_length int,
  created_at timestamptz not null default now(),
  constraint org_application_question_set_items_single_choice_options
    check (
      question_type <> 'single_choice'
      or (
        options is not null
        and jsonb_typeof(options) = 'array'
        and jsonb_array_length(options) >= 1
      )
    ),
  constraint org_application_question_set_items_non_choice_no_options
    check (
      question_type = 'single_choice'
      or options is null
    )
);

create index if not exists org_application_question_set_items_set_sort_idx
  on public.org_application_question_set_items (set_id, sort_order, id);

create or replace function public.org_application_question_set_items_set_org()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.org_id := (
    select s.org_id
    from public.org_application_question_sets s
    where s.id = new.set_id
  );
  return new;
end;
$$;

drop trigger if exists org_application_question_set_items_set_org_trg
  on public.org_application_question_set_items;
create trigger org_application_question_set_items_set_org_trg
  before insert or update of set_id on public.org_application_question_set_items
  for each row
  execute function public.org_application_question_set_items_set_org();

create or replace function public.org_application_question_set_items_touch_parent_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  sid uuid;
begin
  if tg_op = 'DELETE' then
    sid := old.set_id;
  else
    sid := new.set_id;
  end if;
  update public.org_application_question_sets s
  set updated_at = now()
  where s.id = sid;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists org_application_question_set_items_touch_parent_trg
  on public.org_application_question_set_items;
create trigger org_application_question_set_items_touch_parent_trg
  after insert or update or delete on public.org_application_question_set_items
  for each row
  execute function public.org_application_question_set_items_touch_parent_updated_at();

create or replace function public.org_application_question_sets_touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists org_application_question_sets_updated_at_trg
  on public.org_application_question_sets;
create trigger org_application_question_sets_updated_at_trg
  before update on public.org_application_question_sets
  for each row
  execute function public.org_application_question_sets_touch_updated_at();

alter table public.org_application_question_sets enable row level security;
alter table public.org_application_question_set_items enable row level security;

drop policy if exists org_application_question_sets_select_rbac
  on public.org_application_question_sets;
create policy org_application_question_sets_select_rbac
  on public.org_application_question_sets
  for select
  to authenticated
  using (
    org_id = public.current_org_id()
    and public.has_permission(auth.uid(), org_id, 'jobs.view', '{}'::jsonb)
  );

drop policy if exists org_application_question_sets_insert_rbac
  on public.org_application_question_sets;
create policy org_application_question_sets_insert_rbac
  on public.org_application_question_sets
  for insert
  to authenticated
  with check (
    org_id = public.current_org_id()
    and public.has_permission(auth.uid(), org_id, 'jobs.edit', '{}'::jsonb)
  );

drop policy if exists org_application_question_sets_update_rbac
  on public.org_application_question_sets;
create policy org_application_question_sets_update_rbac
  on public.org_application_question_sets
  for update
  to authenticated
  using (
    org_id = public.current_org_id()
    and public.has_permission(auth.uid(), org_id, 'jobs.edit', '{}'::jsonb)
  )
  with check (
    org_id = public.current_org_id()
    and public.has_permission(auth.uid(), org_id, 'jobs.edit', '{}'::jsonb)
  );

drop policy if exists org_application_question_sets_delete_rbac
  on public.org_application_question_sets;
create policy org_application_question_sets_delete_rbac
  on public.org_application_question_sets
  for delete
  to authenticated
  using (
    org_id = public.current_org_id()
    and public.has_permission(auth.uid(), org_id, 'jobs.edit', '{}'::jsonb)
  );

drop policy if exists org_application_question_set_items_select_rbac
  on public.org_application_question_set_items;
create policy org_application_question_set_items_select_rbac
  on public.org_application_question_set_items
  for select
  to authenticated
  using (
    org_id = public.current_org_id()
    and public.has_permission(auth.uid(), org_id, 'jobs.view', '{}'::jsonb)
  );

drop policy if exists org_application_question_set_items_insert_rbac
  on public.org_application_question_set_items;
create policy org_application_question_set_items_insert_rbac
  on public.org_application_question_set_items
  for insert
  to authenticated
  with check (
    org_id = public.current_org_id()
    and public.has_permission(auth.uid(), org_id, 'jobs.edit', '{}'::jsonb)
  );

drop policy if exists org_application_question_set_items_update_rbac
  on public.org_application_question_set_items;
create policy org_application_question_set_items_update_rbac
  on public.org_application_question_set_items
  for update
  to authenticated
  using (
    org_id = public.current_org_id()
    and public.has_permission(auth.uid(), org_id, 'jobs.edit', '{}'::jsonb)
  )
  with check (
    org_id = public.current_org_id()
    and public.has_permission(auth.uid(), org_id, 'jobs.edit', '{}'::jsonb)
  );

drop policy if exists org_application_question_set_items_delete_rbac
  on public.org_application_question_set_items;
create policy org_application_question_set_items_delete_rbac
  on public.org_application_question_set_items
  for delete
  to authenticated
  using (
    org_id = public.current_org_id()
    and public.has_permission(auth.uid(), org_id, 'jobs.edit', '{}'::jsonb)
  );
