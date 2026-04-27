import { LiveOrgChartClient } from '@/components/reports/LiveOrgChartClient';
import type { OrgChartLiveNode } from '@/lib/reports/orgChart';
import { getMyPermissions } from '@/lib/supabase/getMyPermissions';
import { getAuthUser } from '@/lib/supabase/getAuthUser';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

function AccessMessage({ message }: { message: string }) {
  return (
    <div className="mx-auto w-full max-w-2xl px-5 py-10 sm:px-7">
      <div className="rounded-2xl border border-[#e8e8e8] bg-white p-6 text-center">
        <h1 className="text-[20px] font-semibold text-[#121212]">You do not have access</h1>
        <p className="mt-2 text-[14px] text-[#6b6b6b]">{message}</p>
      </div>
    </div>
  );
}

export default async function ManagerOrgChartPage() {
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id, status')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile?.org_id || profile.status !== 'active') {
    return <AccessMessage message="Your account needs an active organisation membership to view the live org chart." />;
  }

  const permissionKeys = await getMyPermissions(profile.org_id as string);
  const canView = ['org_chart.view', 'leave.approve_direct_reports', 'leave.manage_org', 'hr.view_records', 'reports.view'].some((k) =>
    permissionKeys.includes(k as (typeof permissionKeys)[number])
  );
  if (!canView) {
    return <AccessMessage message="You do not have permission to view the live org chart." />;
  }

  const { data } = await supabase.rpc('org_chart_live_nodes', { p_recent_window: '15 minutes' });
  const nodes = (data ?? []) as OrgChartLiveNode[];

  return (
    <div className="mx-auto w-full max-w-[96rem] px-5 py-8 sm:px-7 font-sans text-[#121212]">
      <h1 className="font-authSerif text-[28px] leading-tight tracking-[-0.03em] text-[#121212]">Live Team Org Chart</h1>
      <p className="mt-1 max-w-3xl text-[13.5px] leading-relaxed text-[#6b6b6b]">
        Manager-focused org graph with live working state from attendance clock-ins/outs and active rota shifts.
      </p>
      <div className="mt-6">
        <LiveOrgChartClient initialNodes={nodes} initialUiMode="interactive" />
      </div>
    </div>
  );
}
