import { createClient } from '@/lib/supabase/server';
import { isDepartmentWorkspaceRole } from '@campsite/types';
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
    .select('role, status, org_id')
    .eq('id', user.id)
    .single();

  if (!profile?.org_id || profile.status !== 'active') redirect('/broadcasts');
  if (!isDepartmentWorkspaceRole(profile.role)) redirect('/broadcasts');

  return (
    <div className="mx-auto min-w-0 max-w-6xl px-5 py-7 pb-10 sm:px-[28px]">{children}</div>
  );
}
