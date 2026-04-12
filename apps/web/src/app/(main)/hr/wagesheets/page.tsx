import { WagesheetsClient } from '@/components/attendance/WagesheetsClient';
import { createClient } from '@/lib/supabase/server';
import { getAuthUser } from '@/lib/supabase/getAuthUser';
import { redirect } from 'next/navigation';

export default async function HrWagesheetsPage() {
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id, status')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile?.org_id || profile.status !== 'active') redirect('/broadcasts');

  const orgId = profile.org_id as string;

  const [{ data: view }, { data: manage }] = await Promise.all([
    supabase.rpc('has_permission', {
      p_user_id: user.id,
      p_org_id: orgId,
      p_permission_key: 'payroll.view',
      p_context: {},
    }),
    supabase.rpc('has_permission', {
      p_user_id: user.id,
      p_org_id: orgId,
      p_permission_key: 'payroll.manage',
      p_context: {},
    }),
  ]);

  if (!view && !manage) redirect('/hr/records');

  return (
    <div className="mx-auto max-w-4xl px-5 py-8 sm:px-7">
      <h1 className="font-authSerif text-[26px] tracking-[-0.03em] text-[#121212]">Wagesheets</h1>
      <p className="mt-1 text-[13px] text-[#6b6b6b]">Lines generated when weekly timesheets are approved.</p>
      <div className="mt-8">
        <WagesheetsClient orgId={orgId} />
      </div>
    </div>
  );
}
