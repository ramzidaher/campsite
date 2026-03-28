import { ManagerNav } from '@/components/manager/ManagerNav';
import { createClient } from '@/lib/supabase/server';
import { isManagerRole } from '@campsite/types';
import { redirect } from 'next/navigation';

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
  if (!isManagerRole(profile.role)) redirect('/broadcasts');

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8 px-5 py-7 sm:px-[28px] md:flex-row md:items-start">
      <ManagerNav />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
