import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

/** Nav lives in the main shell under “Manager” (same idea as `/admin`). */
export default async function ManagerLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('status, org_id')
    .eq('id', user.id)
    .single();

  if (!profile?.org_id || profile.status !== 'active') redirect('/broadcasts');
  const { data: permissions } = await supabase.rpc('get_my_permissions', { p_org_id: profile.org_id });
  const keys = Array.isArray(permissions)
    ? (permissions as Array<{ permission_key?: string }>).map((p) => String(p.permission_key ?? ''))
    : [];
  const canAccessManagerWorkspace = keys.some(
    (k) =>
      k === 'recruitment.view' ||
      k === 'recruitment.create_request' ||
      k === 'recruitment.manage' ||
      k === 'recruitment.approve_request' ||
      k === 'departments.view' ||
      k === 'teams.view' ||
      k === 'approvals.members.review'
  );
  if (!canAccessManagerWorkspace) redirect('/broadcasts');

  return (
    <div className="mx-auto min-w-0 max-w-6xl px-5 py-7 pb-10 sm:px-[28px]">{children}</div>
  );
}
