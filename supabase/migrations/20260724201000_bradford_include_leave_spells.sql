-- Bradford factor should include leave spells, not just sickness spells.

create or replace function public._bradford_factor_raw(
  p_org_id uuid,
  p_user_id uuid,
  p_on date
)
returns table(spell_count integer, total_days numeric, bradford_score numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  w_days int := 365;
  w_start date;
  w_end date;
  rec record;
  cur_start date;
  cur_end date;
  r_start date;
  r_end date;
  spells int := 0;
  dsum numeric := 0;
  first_sp boolean := true;
begin
  select coalesce(max(s.bradford_window_days), 365) into w_days
  from public.org_leave_settings s
  where s.org_id = p_org_id;

  w_end := p_on;
  w_start := p_on - (w_days - 1);

  for rec in
    with source_spells as (
      -- Sickness spells
      select sa.start_date, sa.end_date
      from public.sickness_absences sa
      where sa.org_id = p_org_id
        and sa.user_id = p_user_id
        and coalesce(sa.voided_at, null) is null
      union all
      -- Leave spells (approved or currently active approval states)
      select lr.start_date, lr.end_date
      from public.leave_requests lr
      where lr.org_id = p_org_id
        and lr.requester_id = p_user_id
        and lr.status in ('approved', 'pending', 'pending_edit', 'pending_cancel')
    )
    select s.start_date, s.end_date
    from source_spells s
    where s.start_date <= w_end
      and s.end_date >= w_start
    order by s.start_date, s.end_date
  loop
    r_start := greatest(rec.start_date, w_start);
    r_end := least(rec.end_date, w_end);
    if r_start > r_end then
      continue;
    end if;
    if first_sp then
      cur_start := r_start;
      cur_end := r_end;
      first_sp := false;
    elsif r_start <= cur_end + 1 then
      if r_end > cur_end then
        cur_end := r_end;
      end if;
    else
      spells := spells + 1;
      dsum := dsum + (cur_end - cur_start + 1);
      cur_start := r_start;
      cur_end := r_end;
    end if;
  end loop;

  if first_sp then
    spell_count := 0;
    total_days := 0;
    bradford_score := 0;
    return next;
    return;
  end if;

  spells := spells + 1;
  dsum := dsum + (cur_end - cur_start + 1);

  spell_count := spells;
  total_days := dsum;
  bradford_score := (spells::numeric * spells::numeric) * dsum;
  return next;
end;
$$;

comment on function public._bradford_factor_raw is
  'Internal: Bradford S²×D for one user in an org over sickness_absences + leave_requests; overlapping or contiguous spells merge.';

comment on function public.bradford_factor_for_user is
  'Bradford score = S² × D over sickness_absences + leave_requests in rolling window; overlapping or contiguous spells merge.';

comment on function public.hr_bradford_report is
  'Bradford S²×D for active employees using sickness + leave spells: full org if hr.view_records or leave.manage_org; else direct reports only.';
