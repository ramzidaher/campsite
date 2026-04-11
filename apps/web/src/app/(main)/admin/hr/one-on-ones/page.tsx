import { HrOneOnOneComplianceClient } from '@/components/one-on-one/HrOneOnOneComplianceClient';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/supabase/getAuthUser';

export default async function HrOneOnOnesPage() {
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

  const { data: canHr } = await supabase.rpc('has_permission', {
    p_user_id: user.id,
    p_org_id: orgId,
    p_permission_key: 'hr.view_records',
    p_context: {},
  });
  if (!canHr) redirect('/broadcasts');

  const { data: rowsRaw, error } = await supabase.rpc('hr_one_on_one_compliance_list', {
    p_filter: 'all',
  });
  if (error) {
    return (
      <div className="p-8">
        <p className="text-[13px] text-[#b91c1c]">{error.message}</p>
      </div>
    );
  }

  const rows = (Array.isArray(rowsRaw) ? rowsRaw : []) as Array<{
    report_user_id: string;
    report_name: string;
    manager_user_id: string;
    manager_name: string;
    last_completed_at: string | null;
    next_due_on: string;
    cadence_days: number;
    status: string;
    days_overdue: number;
  }>;

  return <HrOneOnOneComplianceClient initialRows={rows} />;
}
