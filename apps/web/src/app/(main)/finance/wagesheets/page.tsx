import { WagesheetsClient } from '@/components/attendance/WagesheetsClient';
import { getMyPermissions } from '@/lib/supabase/getMyPermissions';
import { createClient } from '@/lib/supabase/server';
import { getAuthUser } from '@/lib/supabase/getAuthUser';
import { redirect } from 'next/navigation';

export default async function FinanceWagesheetsPage() {
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

  const permissionKeys = await getMyPermissions(orgId);
  if (!permissionKeys.includes('payroll.view') && !permissionKeys.includes('payroll.manage')) redirect('/forbidden');

  return (
    <div className="mx-auto w-full max-w-[90rem] px-5 py-8 sm:px-7">
      <h1 className="font-authSerif text-[28px] leading-tight tracking-[-0.03em] text-[#121212]">Wagesheets</h1>
      <p className="mt-1 max-w-2xl text-[13.5px] leading-relaxed text-[#6b6b6b]">
        Lines generated when weekly timesheets are approved.
      </p>
      <div className="mt-8">
        <WagesheetsClient orgId={orgId} />
      </div>
    </div>
  );
}
