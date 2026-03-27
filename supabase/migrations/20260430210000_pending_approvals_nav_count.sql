-- Nav badge count for pending member approvals — one round-trip, same rules as `can_approve_profile`.

create or replace function public.pending_approvals_nav_count()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from public.profiles pt
  where pt.status = 'pending'
    and public.can_approve_profile(auth.uid(), pt.id);
$$;

grant execute on function public.pending_approvals_nav_count() to authenticated;
