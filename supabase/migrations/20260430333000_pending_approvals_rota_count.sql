-- Include rota change requests awaiting final approval in nav badge (managers, duty_managers, org admins).

create or replace function public.pending_approvals_nav_count()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select (
    select count(*)::integer
    from public.profiles pt
    where pt.status = 'pending'
      and public.can_approve_profile(auth.uid(), pt.id)
  )
  + coalesce(
    (
      select count(*)::integer
      from public.rota_change_requests r
      inner join public.profiles me on me.id = auth.uid()
      where r.org_id = me.org_id
        and r.status = 'pending_final'
        and me.status = 'active'
        and me.role in ('manager', 'duty_manager', 'org_admin', 'super_admin')
    ),
    0
  );
$$;
