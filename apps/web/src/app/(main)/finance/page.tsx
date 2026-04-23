import { FinanceHubClient } from '@/components/finance/FinanceHubClient';
import { getAuthUser } from '@/lib/supabase/getAuthUser';
import { getMyPermissions } from '@/lib/supabase/getMyPermissions';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export default async function FinancePage() {
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('org_id, status').eq('id', user.id).maybeSingle();
  if (!profile?.org_id || profile.status !== 'active') redirect('/broadcasts');

  const orgId = profile.org_id as string;
  const permissionKeys = await getMyPermissions(orgId);
  const permissionKeyStrings = permissionKeys as unknown as string[];
  const canView = permissionKeys.includes('payroll.view') || permissionKeys.includes('payroll.manage');
  if (!canView) redirect('/hr/records');
  const canManage = permissionKeys.includes('payroll.manage');
  const canFinanceApprove = permissionKeyStrings.includes('payroll.finance_approve') || canManage;
  const canManagePolicy = permissionKeyStrings.includes('payroll.policy.manage') || canManage;
  const canManagePayElements = permissionKeyStrings.includes('payroll.pay_elements.manage') || canManage;

  return (
    <div className="mx-auto w-full max-w-[90rem] px-5 py-8 sm:px-7">
      <h1 className="font-authSerif text-[28px] leading-tight tracking-[-0.03em] text-[#121212]">Finance</h1>
      <p className="mt-1 max-w-2xl text-[13.5px] leading-relaxed text-[#6b6b6b]">
        Wage sheets with rota, attendance, leave, SSP and manual override controls for payroll review.
      </p>
      <div className="mt-8">
        <FinanceHubClient
          orgId={orgId}
          canManage={canManage}
          canFinanceApprove={canFinanceApprove}
          canManagePolicy={canManagePolicy}
          canManagePayElements={canManagePayElements}
        />
      </div>
    </div>
  );
}
