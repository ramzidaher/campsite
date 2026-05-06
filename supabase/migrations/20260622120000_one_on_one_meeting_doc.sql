-- 1:1 meeting structured notes (check-in questions, manager/private notes, action items, sign-off).

-- ---------------------------------------------------------------------------
-- Columns
-- ---------------------------------------------------------------------------

alter table public.one_on_one_meetings
  add column if not exists session_title text not null default '';

alter table public.one_on_one_meetings
  add column if not exists doc jsonb not null default '{}'::jsonb;

alter table public.one_on_one_meetings
  add column if not exists manager_signed_at timestamptz;

alter table public.one_on_one_meetings
  add column if not exists report_signed_at timestamptz;

alter table public.one_on_one_meetings
  add column if not exists next_session_at timestamptz;

alter table public.one_on_one_note_edit_requests
  add column if not exists proposed_doc jsonb;

comment on column public.one_on_one_meetings.session_title is
  'Editable session title shown at the top of the 1:1 notes document.';

comment on column public.one_on_one_meetings.doc is
  'Structured 1:1 payload: questions (prompt, owner, answer), manager_notes_shared, private_manager_notes, action_items.';

-- ---------------------------------------------------------------------------
-- Default questions (immutable ids for stable client keys)
-- ---------------------------------------------------------------------------

create or replace function public._one_on_one_default_questions_array()
returns jsonb
language sql
immutable
as $$
  select '[
    {"id":"a0000001-0000-4000-8000-000000000001","prompt":"How are you feeling about your current workload and priorities?","owner":"employee","answer":""},
    {"id":"a0000002-0000-4000-8000-000000000002","prompt":"Is there anything blocking you that I can help remove?","owner":"employee","answer":""},
    {"id":"a0000003-0000-4000-8000-000000000003","prompt":"What progress have you made on your development goals since last session?","owner":"both","answer":""},
    {"id":"a0000004-0000-4000-8000-000000000004","prompt":"What feedback do you have for me as your manager?","owner":"manager","answer":""},
    {"id":"a0000005-0000-4000-8000-000000000005","prompt":"How are you feeling about your career progression and where you''re headed?","owner":"both","answer":""}
  ]'::jsonb;
$$;

create or replace function public._one_on_one_empty_doc()
returns jsonb
language sql
immutable
as $$
  select jsonb_build_object(
    'version', 1,
    'questions', public._one_on_one_default_questions_array(),
    'manager_notes_shared', '',
    'private_manager_notes', '',
    'action_items', '[]'::jsonb
  );
$$;

create or replace function public._one_on_one_doc_preview_text(p_session_title text, p_doc jsonb)
returns text
language plpgsql
immutable
as $$
declare
  v_notes text := coalesce(p_doc->>'manager_notes_shared', '');
  v_title text := nullif(trim(coalesce(p_session_title, '')), '');
  v_q text;
begin
  select string_agg(trim(coalesce(elem->>'answer', '')), ' ')
    into v_q
  from jsonb_array_elements(coalesce(p_doc->'questions', '[]'::jsonb)) as elem
  where length(trim(coalesce(elem->>'answer', ''))) > 0;

  return left(
    trim(
      coalesce(v_title || E'\n', '')
      || coalesce(v_notes, '')
      || coalesce(E'\n' || v_q, '')
    ),
    12000
  );
end;
$$;

create or replace function public._one_on_one_agenda_to_questions(p_agenda jsonb)
returns jsonb
language plpgsql
volatile
set search_path = public
as $$
declare
  el jsonb;
  acc jsonb := '[]'::jsonb;
  pr text;
  o text;
  nid text;
begin
  if p_agenda is null or jsonb_typeof(p_agenda) <> 'array' then
    return '[]'::jsonb;
  end if;

  for el in select value from jsonb_array_elements(p_agenda) as value
  loop
    if jsonb_typeof(el) = 'string' then
      pr := trim(el #>> '{}');
      if pr <> '' then
        acc := acc || jsonb_build_array(
          jsonb_build_object(
            'id', gen_random_uuid()::text,
            'prompt', pr,
            'owner', 'employee',
            'answer', ''
          )
        );
      end if;
    elsif jsonb_typeof(el) = 'object' then
      pr := coalesce(nullif(trim(el->>'prompt'), ''), nullif(trim(el->>'text'), ''), '');
      o := lower(coalesce(el->>'owner', 'employee'));
      if o not in ('employee', 'manager', 'both') then
        o := 'employee';
      end if;
      if pr <> '' then
        nid := nullif(trim(el->>'id'), '');
        if nid is null then
          nid := gen_random_uuid()::text;
        end if;
        acc := acc || jsonb_build_array(
          jsonb_build_object(
            'id', nid,
            'prompt', pr,
            'owner', o,
            'answer', coalesce(el->>'answer', '')
          )
        );
      end if;
    end if;
  end loop;

  return acc;
end;
$$;

create or replace function public._one_on_one_merge_report_doc(p_stored jsonb, p_incoming jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  v_out jsonb;
  sq jsonb;
  iq jsonb;
  merged jsonb := '[]'::jsonb;
  sid text;
  o text;
  sa jsonb;
  ia jsonb;
  macc jsonb := '[]'::jsonb;
  aid text;
begin
  v_out := coalesce(p_stored, public._one_on_one_empty_doc());

  for sq in select value from jsonb_array_elements(coalesce(v_out->'questions', '[]'::jsonb)) as value
  loop
    sid := sq->>'id';
    o := lower(coalesce(sq->>'owner', 'employee'));
    if sid is not null and o in ('employee', 'both') then
      select value into iq
      from jsonb_array_elements(coalesce(p_incoming->'questions', '[]'::jsonb)) as value
      where value->>'id' = sid
      limit 1;
      if iq is not null then
        merged := merged || jsonb_build_array(
          jsonb_set(sq, '{answer}', to_jsonb(coalesce(iq->>'answer', '')), true)
        );
      else
        merged := merged || jsonb_build_array(sq);
      end if;
    else
      merged := merged || jsonb_build_array(sq);
    end if;
  end loop;

  v_out := jsonb_set(v_out, '{questions}', coalesce(merged, '[]'::jsonb), true);

  for sa in select value from jsonb_array_elements(coalesce(v_out->'action_items', '[]'::jsonb)) as value
  loop
    aid := sa->>'id';
    ia := null;
    if aid is not null then
      select value into ia
      from jsonb_array_elements(coalesce(p_incoming->'action_items', '[]'::jsonb)) as value
      where value->>'id' = aid
      limit 1;
    end if;
    if ia is null then
      macc := macc || jsonb_build_array(sa);
    else
      macc := macc || jsonb_build_array(
        jsonb_set(
          jsonb_set(
            sa,
            '{done}',
            case
              when ia ? 'done' then to_jsonb(coalesce((ia->>'done')::boolean, false))
              else coalesce(sa->'done', 'false'::jsonb)
            end,
            true
          ),
          '{text}',
          to_jsonb(left(coalesce(ia->>'text', sa->>'text', ''), 4000)),
          true
        )
      );
    end if;
  end loop;

  v_out := jsonb_set(v_out, '{action_items}', coalesce(macc, '[]'::jsonb), true);

  return v_out;
end;
$$;

-- ---------------------------------------------------------------------------
-- Backfill existing meetings
-- ---------------------------------------------------------------------------

update public.one_on_one_meetings m
set
  doc = jsonb_build_object(
    'version', 1,
    'questions', public._one_on_one_default_questions_array(),
    'manager_notes_shared', coalesce(nullif(m.shared_notes, ''), ''),
    'private_manager_notes', '',
    'action_items', '[]'::jsonb
  ),
  session_title = case
    when coalesce(nullif(trim(m.shared_notes), ''), '') <> '' then coalesce(nullif(trim(session_title), ''), '1:1 check-in')
    else coalesce(nullif(trim(session_title), ''), '')
  end
where not (m.doc ? 'version');

-- Sync shared_notes preview column
update public.one_on_one_meetings m
set shared_notes = public._one_on_one_doc_preview_text(m.session_title, m.doc)
where m.doc ? 'version';

-- ---------------------------------------------------------------------------
-- meeting_get (extended + strip private notes for report)
-- ---------------------------------------------------------------------------

create or replace function public.one_on_one_meeting_get(p_meeting_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_hr boolean;
  m record;
  v_doc jsonb;
  v_session int;
  v_out jsonb;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select org_id into v_org from public.profiles where id = v_uid and status = 'active';
  if v_org is null then raise exception 'not allowed'; end if;

  v_hr := public.has_permission(v_uid, v_org, 'hr.view_records', '{}'::jsonb);

  select * into m
  from public.one_on_one_meetings om
  where om.id = p_meeting_id and om.org_id = v_org;

  if m is null then
    raise exception 'not found';
  end if;

  if not v_hr and m.manager_user_id <> v_uid and m.report_user_id <> v_uid then
    raise exception 'not allowed';
  end if;

  if not v_hr and not public.has_permission(v_uid, v_org, 'one_on_one.view_own', '{}'::jsonb) then
    raise exception 'not allowed';
  end if;

  v_doc := m.doc;
  if v_doc is null or not (v_doc ? 'version') then
    v_doc := public._one_on_one_empty_doc();
  end if;

  if not v_hr and v_uid = m.report_user_id then
    v_doc := jsonb_set(v_doc, '{private_manager_notes}', '""'::jsonb, true);
  end if;

  select count(*)::integer + 1 into v_session
  from public.one_on_one_meetings om
  where om.org_id = m.org_id
    and om.manager_user_id = m.manager_user_id
    and om.report_user_id = m.report_user_id
    and om.starts_at < m.starts_at;

  v_out := jsonb_build_object(
    'id', m.id,
    'org_id', m.org_id,
    'manager_user_id', m.manager_user_id,
    'report_user_id', m.report_user_id,
    'manager_name', (select full_name from public.profiles where id = m.manager_user_id),
    'report_name', (select full_name from public.profiles where id = m.report_user_id),
    'template_id', m.template_id,
    'starts_at', m.starts_at,
    'ends_at', m.ends_at,
    'status', m.status,
    'session_title', m.session_title,
    'doc', v_doc,
    'shared_notes', m.shared_notes,
    'notes_locked_at', m.notes_locked_at,
    'completed_at', m.completed_at,
    'manager_signed_at', m.manager_signed_at,
    'report_signed_at', m.report_signed_at,
    'next_session_at', m.next_session_at,
    'session_index', v_session,
    'created_at', m.created_at,
    'updated_at', m.updated_at
  );

  return v_out;
end;
$$;

revoke all on function public.one_on_one_meeting_get(uuid) from public;
grant execute on function public.one_on_one_meeting_get(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- meeting_list: preview uses session_title + doc
-- ---------------------------------------------------------------------------

create or replace function public.one_on_one_meeting_list(
  p_limit integer default 50,
  p_include_cancelled boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_hr boolean;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select org_id into v_org from public.profiles where id = v_uid and status = 'active';
  if v_org is null then raise exception 'not allowed'; end if;

  v_hr := public.has_permission(v_uid, v_org, 'hr.view_records', '{}'::jsonb);

  if not v_hr and not public.has_permission(v_uid, v_org, 'one_on_one.view_own', '{}'::jsonb) then
    raise exception 'not allowed';
  end if;

  return coalesce(
    (select jsonb_agg(x.obj order by x.sort_key desc)
     from (
       select
         jsonb_build_object(
           'id', m.id,
           'manager_user_id', m.manager_user_id,
           'report_user_id', m.report_user_id,
           'manager_name', pm.full_name,
           'report_name', pr.full_name,
           'template_id', m.template_id,
           'starts_at', m.starts_at,
           'ends_at', m.ends_at,
           'status', m.status,
           'completed_at', m.completed_at,
           'session_title', m.session_title,
           'notes_preview', left(
             trim(
               coalesce(nullif(trim(m.session_title), ''), '') ||
               case when nullif(trim(m.session_title), '') is not null then '  ' else '' end ||
               coalesce(public._one_on_one_doc_preview_text(m.session_title, m.doc), m.shared_notes, '')
             ),
             200
           )
         ) as obj,
         m.starts_at as sort_key
       from public.one_on_one_meetings m
       join public.profiles pm on pm.id = m.manager_user_id
       join public.profiles pr on pr.id = m.report_user_id
       where m.org_id = v_org
         and (
           v_hr
           or m.manager_user_id = v_uid
           or m.report_user_id = v_uid
         )
         and (p_include_cancelled or m.status <> 'cancelled')
       order by m.starts_at desc
       limit greatest(1, least(p_limit, 200))
     ) x
    ),
    '[]'::jsonb
  );
end;
$$;

revoke all on function public.one_on_one_meeting_list(integer, boolean) from public;
grant execute on function public.one_on_one_meeting_list(integer, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- meeting_upsert: initialize doc from template or defaults
-- ---------------------------------------------------------------------------

create or replace function public.one_on_one_meeting_upsert(
  p_report_user_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz default null,
  p_template_id uuid default null,
  p_meeting_id uuid default null,
  p_status text default 'scheduled'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_mid uuid;
  v_agenda jsonb;
  v_questions jsonb;
  v_doc jsonb;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select org_id into v_org from public.profiles where id = v_uid and status = 'active';
  if v_org is null or not public.has_permission(v_uid, v_org, 'one_on_one.manage_direct_reports', '{}'::jsonb) then
    raise exception 'not allowed';
  end if;

  if not public._one_on_one_validate_manager_report(v_org, v_uid, p_report_user_id) then
    raise exception 'not a direct report';
  end if;

  if p_status not in ('scheduled', 'in_progress', 'cancelled') then
    raise exception 'invalid status for upsert';
  end if;

  if p_meeting_id is null then
    if p_template_id is not null and not exists (
      select 1 from public.one_on_one_templates t
      where t.id = p_template_id and t.org_id = v_org and t.archived_at is null
    ) then
      raise exception 'template not found';
    end if;

    v_doc := public._one_on_one_empty_doc();
    if p_template_id is not null then
      select t.agenda_items into v_agenda
      from public.one_on_one_templates t
      where t.id = p_template_id and t.org_id = v_org;
      v_questions := public._one_on_one_agenda_to_questions(coalesce(v_agenda, '[]'::jsonb));
      if v_questions is not null and jsonb_array_length(v_questions) > 0 then
        v_doc := jsonb_set(v_doc, '{questions}', v_questions, true);
      end if;
    end if;

    insert into public.one_on_one_meetings (
      org_id, manager_user_id, report_user_id, template_id,
      starts_at, ends_at, status, created_by, doc, shared_notes
    ) values (
      v_org, v_uid, p_report_user_id, p_template_id,
      p_starts_at, p_ends_at, p_status, v_uid,
      v_doc,
      public._one_on_one_doc_preview_text('', v_doc)
    )
    returning id into v_mid;
  else
    update public.one_on_one_meetings m set
      starts_at = p_starts_at,
      ends_at = p_ends_at,
      template_id = coalesce(p_template_id, m.template_id),
      status = p_status,
      updated_at = now()
    where m.id = p_meeting_id
      and m.org_id = v_org
      and m.manager_user_id = v_uid
      and m.status <> 'completed'
    returning m.id into v_mid;

    if v_mid is null then
      raise exception 'meeting not found or not editable';
    end if;
  end if;

  return v_mid;
end;
$$;

revoke all on function public.one_on_one_meeting_upsert(uuid, timestamptz, timestamptz, uuid, uuid, text) from public;
grant execute on function public.one_on_one_meeting_upsert(uuid, timestamptz, timestamptz, uuid, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- meeting_update_doc + meeting_update_notes (legacy sync)
-- ---------------------------------------------------------------------------

create or replace function public.one_on_one_meeting_update_doc(
  p_meeting_id uuid,
  p_session_title text default null,
  p_doc jsonb default null,
  p_next_session_at timestamptz default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  m record;
  v_final jsonb;
  v_stored jsonb;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select org_id into v_org from public.profiles where id = v_uid and status = 'active';
  if v_org is null or not public.has_permission(v_uid, v_org, 'one_on_one.view_own', '{}'::jsonb) then
    raise exception 'not allowed';
  end if;

  select * into m from public.one_on_one_meetings om
  where om.id = p_meeting_id and om.org_id = v_org;

  if m is null then raise exception 'not found'; end if;

  if m.manager_user_id <> v_uid and m.report_user_id <> v_uid then
    raise exception 'not allowed';
  end if;

  if m.status = 'cancelled' then
    raise exception 'cancelled';
  end if;

  if m.notes_locked_at is not null then
    raise exception 'notes locked';
  end if;

  if m.status = 'completed' then
    raise exception 'completed';
  end if;

  v_stored := m.doc;
  if v_stored is null or not (v_stored ? 'version') then
    v_stored := public._one_on_one_empty_doc();
  end if;

  if m.manager_user_id = v_uid then
    v_final := coalesce(p_doc, v_stored);
    if v_final->>'version' is null then
      v_final := jsonb_set(v_final, '{version}', '1'::jsonb, true);
    end if;
    -- size guards
    if length(coalesce(v_final->>'manager_notes_shared', '')) > 12000 then
      raise exception 'manager notes too long';
    end if;
    if length(coalesce(v_final->>'private_manager_notes', '')) > 12000 then
      raise exception 'private notes too long';
    end if;
    if coalesce(jsonb_array_length(v_final->'questions'), 0) > 40 then
      raise exception 'too many questions';
    end if;
  else
    -- report: merge
    if p_doc is null then
      raise exception 'doc required';
    end if;
    v_final := public._one_on_one_merge_report_doc(v_stored, p_doc);
  end if;

  update public.one_on_one_meetings om
  set
    session_title = case
      when m.manager_user_id = v_uid and p_session_title is not null
        then left(trim(p_session_title), 500)
      else om.session_title
    end,
    doc = v_final,
    shared_notes = public._one_on_one_doc_preview_text(
      case
        when m.manager_user_id = v_uid and p_session_title is not null
          then left(trim(p_session_title), 500)
        else om.session_title
      end,
      v_final
    ),
    next_session_at = case
      when m.manager_user_id = v_uid then coalesce(p_next_session_at, om.next_session_at)
      else om.next_session_at
    end,
    updated_at = now()
  where om.id = p_meeting_id;
end;
$$;

revoke all on function public.one_on_one_meeting_update_doc(uuid, text, jsonb, timestamptz) from public;
grant execute on function public.one_on_one_meeting_update_doc(uuid, text, jsonb, timestamptz) to authenticated;

create or replace function public.one_on_one_meeting_update_notes(
  p_meeting_id uuid,
  p_notes text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  m record;
  v_doc jsonb;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select org_id into v_org from public.profiles where id = v_uid and status = 'active';
  if v_org is null or not public.has_permission(v_uid, v_org, 'one_on_one.view_own', '{}'::jsonb) then
    raise exception 'not allowed';
  end if;

  select * into m from public.one_on_one_meetings om
  where om.id = p_meeting_id and om.org_id = v_org;

  if m is null then raise exception 'not found'; end if;

  if m.manager_user_id <> v_uid and m.report_user_id <> v_uid then
    raise exception 'not allowed';
  end if;

  if m.status = 'cancelled' then
    raise exception 'cancelled';
  end if;

  if m.notes_locked_at is not null then
    raise exception 'notes locked';
  end if;

  if m.status = 'completed' then
    raise exception 'completed';
  end if;

  v_doc := m.doc;
  if v_doc is null or not (v_doc ? 'version') then
    v_doc := public._one_on_one_empty_doc();
  end if;

  if m.manager_user_id = v_uid then
    v_doc := jsonb_set(v_doc, '{manager_notes_shared}', to_jsonb(coalesce(p_notes, '')), true);
  else
    -- report: legacy single textarea mapped to answers is ambiguous; append to first employee question or manager_notes_shared? Use shared manager_notes_shared for both (legacy behavior)
    v_doc := jsonb_set(v_doc, '{manager_notes_shared}', to_jsonb(coalesce(p_notes, '')), true);
  end if;

  update public.one_on_one_meetings om
  set
    doc = v_doc,
    shared_notes = public._one_on_one_doc_preview_text(om.session_title, v_doc),
    updated_at = now()
  where om.id = p_meeting_id;
end;
$$;

revoke all on function public.one_on_one_meeting_update_notes(uuid, text) from public;
grant execute on function public.one_on_one_meeting_update_notes(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Sign-off
-- ---------------------------------------------------------------------------

create or replace function public.one_on_one_meeting_sign(p_meeting_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  m record;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select org_id into v_org from public.profiles where id = v_uid and status = 'active';
  if v_org is null or not public.has_permission(v_uid, v_org, 'one_on_one.view_own', '{}'::jsonb) then
    raise exception 'not allowed';
  end if;

  select * into m from public.one_on_one_meetings om
  where om.id = p_meeting_id and om.org_id = v_org;

  if m is null then raise exception 'not found'; end if;

  if m.manager_user_id <> v_uid and m.report_user_id <> v_uid then
    raise exception 'not allowed';
  end if;

  if m.status = 'cancelled' then
    raise exception 'cancelled';
  end if;

  if m.notes_locked_at is not null or m.status = 'completed' then
    raise exception 'notes locked';
  end if;

  if v_uid = m.manager_user_id then
    update public.one_on_one_meetings om
    set manager_signed_at = now(), updated_at = now()
    where om.id = p_meeting_id and om.manager_signed_at is null;
  else
    update public.one_on_one_meetings om
    set report_signed_at = now(), updated_at = now()
    where om.id = p_meeting_id and om.report_signed_at is null;
  end if;
end;
$$;

revoke all on function public.one_on_one_meeting_sign(uuid) from public;
grant execute on function public.one_on_one_meeting_sign(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Note edit requests (proposed_doc)
-- ---------------------------------------------------------------------------

create or replace function public.one_on_one_note_edit_request_create(
  p_meeting_id uuid,
  p_proposed_notes text,
  p_proposed_doc jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  m record;
  v_rid uuid;
  v_doc jsonb;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select org_id into v_org from public.profiles where id = v_uid and status = 'active';
  if v_org is null or not public.has_permission(v_uid, v_org, 'one_on_one.view_own', '{}'::jsonb) then
    raise exception 'not allowed';
  end if;

  select * into m from public.one_on_one_meetings om
  where om.id = p_meeting_id and om.org_id = v_org;

  if m is null then raise exception 'not found'; end if;

  if m.manager_user_id <> v_uid and m.report_user_id <> v_uid then
    raise exception 'not allowed';
  end if;

  if m.notes_locked_at is null then
    raise exception 'notes not locked';
  end if;

  if exists (
    select 1 from public.one_on_one_note_edit_requests r
    where r.meeting_id = p_meeting_id and r.status = 'pending'
  ) then
    raise exception 'pending request exists';
  end if;

  v_doc := p_proposed_doc;
  if v_doc is null then
    v_doc := coalesce(m.doc, public._one_on_one_empty_doc());
    v_doc := jsonb_set(v_doc, '{manager_notes_shared}', to_jsonb(coalesce(p_proposed_notes, '')), true);
  end if;

  insert into public.one_on_one_note_edit_requests (
    meeting_id, org_id, requester_id, proposed_notes, proposed_doc
  ) values (
    p_meeting_id, v_org, v_uid, coalesce(p_proposed_notes, ''), v_doc
  )
  returning id into v_rid;

  return v_rid;
end;
$$;

revoke all on function public.one_on_one_note_edit_request_create(uuid, text, jsonb) from public;
grant execute on function public.one_on_one_note_edit_request_create(uuid, text, jsonb) to authenticated;

drop function if exists public.one_on_one_note_edit_request_create(uuid, text);

create or replace function public.one_on_one_note_edit_request_resolve(
  p_request_id uuid,
  p_approved boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  r record;
  m record;
  v_doc jsonb;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select org_id into v_org from public.profiles where id = v_uid and status = 'active';
  if v_org is null then raise exception 'not allowed'; end if;

  select * into r from public.one_on_one_note_edit_requests req
  where req.id = p_request_id and req.org_id = v_org;

  if r is null then raise exception 'not found'; end if;
  if r.status <> 'pending' then raise exception 'already resolved'; end if;

  select * into m from public.one_on_one_meetings om where om.id = r.meeting_id;

  if m.org_id <> v_org then raise exception 'not allowed'; end if;

  if not (
    m.manager_user_id = v_uid
    or public.has_permission(v_uid, v_org, 'hr.manage_records', '{}'::jsonb)
  ) then
    raise exception 'not allowed';
  end if;

  update public.one_on_one_note_edit_requests req set
    status = case when p_approved then 'approved' else 'rejected' end,
    resolved_by = v_uid,
    resolved_at = now()
  where req.id = p_request_id;

  if p_approved then
    v_doc := coalesce(r.proposed_doc, m.doc, public._one_on_one_empty_doc());
    if r.proposed_doc is null then
      v_doc := jsonb_set(v_doc, '{manager_notes_shared}', to_jsonb(coalesce(r.proposed_notes, '')), true);
    end if;
    update public.one_on_one_meetings om
    set
      doc = v_doc,
      shared_notes = public._one_on_one_doc_preview_text(om.session_title, v_doc),
      updated_at = now()
    where om.id = r.meeting_id;
  end if;
end;
$$;

revoke all on function public.one_on_one_note_edit_request_resolve(uuid, boolean) from public;
grant execute on function public.one_on_one_note_edit_request_resolve(uuid, boolean) to authenticated;

create or replace function public.one_on_one_note_edit_requests_for_meeting(p_meeting_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_org uuid;
  v_hr boolean;
  m record;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;

  select org_id into v_org from public.profiles where id = v_uid and status = 'active';
  if v_org is null then raise exception 'not allowed'; end if;

  v_hr := public.has_permission(v_uid, v_org, 'hr.view_records', '{}'::jsonb);

  select * into m from public.one_on_one_meetings om
  where om.id = p_meeting_id and om.org_id = v_org;

  if m is null then raise exception 'not found'; end if;

  if not v_hr and m.manager_user_id <> v_uid and m.report_user_id <> v_uid then
    raise exception 'not allowed';
  end if;

  return coalesce(
    (select jsonb_agg(
       jsonb_build_object(
         'id', r.id,
         'requester_id', r.requester_id,
         'proposed_notes', r.proposed_notes,
         'proposed_doc', r.proposed_doc,
         'status', r.status,
         'resolved_at', r.resolved_at,
         'created_at', r.created_at
       ) order by r.created_at desc
     )
     from public.one_on_one_note_edit_requests r
     where r.meeting_id = p_meeting_id),
    '[]'::jsonb
  );
end;
$$;

revoke all on function public.one_on_one_note_edit_requests_for_meeting(uuid) from public;
grant execute on function public.one_on_one_note_edit_requests_for_meeting(uuid) to authenticated;
