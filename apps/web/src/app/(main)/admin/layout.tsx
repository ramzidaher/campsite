import { createClient } from '@/lib/supabase/server';
import { canAccessOrgAdminArea } from '@/lib/adminGates';
import { redirect } from 'next/navigation';

/** Org tenant admin routes; nav lives in the main shell under “Admin”. */
export default async function OrgAdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, status, org_id')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile?.org_id || profile.status !== 'active') redirect('/broadcasts');
  if (!canAccessOrgAdminArea(profile.role)) redirect('/broadcasts');

  return <div className="min-w-0">{children}</div>;
}
