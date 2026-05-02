import { PendingApprovalsClient, type PendingRow } from '@/components/PendingApprovalsClient';
import { loadPendingApprovalRows } from '@/lib/admin/loadPendingApprovals';
import { getMyPermissions } from '@/lib/supabase/getMyPermissions';
import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/supabase/getAuthUser';

export default async function PendingApprovalsPage() {
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const { data: me } = await supabase.from('profiles').select('role,org_id,id,status').eq('id', user.id).single();

  if (!me || me.status !== 'active' || !me.org_id) {
    redirect('/dashboard');
  }
  const permissionKeys = await getMyPermissions(me.org_id as string);
  const canReviewApprovals      = permissionKeys.includes('approvals.members.review');
  const canViewManagerTeams     = permissionKeys.includes('teams.view');
  const canManageManagerWorkspace = permissionKeys.includes('recruitment.create_request');
  if (!canReviewApprovals) {
    redirect('/forbidden');
  }

  const full = await loadPendingApprovalRows(supabase, user.id, me.org_id as string, me.role as string);
  const rows: PendingRow[] = full.map((p) => ({
    id: p.id,
    full_name: p.full_name,
    email: p.email,
    created_at: p.created_at,
    role: p.role,
    departments: p.departments,
  }));

  const showManagerLink = Boolean(canViewManagerTeams || canManageManagerWorkspace);

  return (
    <div className="mx-auto max-w-6xl px-5 py-7 sm:px-[28px]">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-authSerif text-[22px] tracking-tight text-[#121212]">Pending members</h1>
          <p className="mt-1 text-[13px] text-[#6b6b6b]">
            Approve or reject new registrations before they can use the app.
          </p>
        </div>
        {showManagerLink ? (
          <Link
            href={canManageManagerWorkspace ? '/manager' : '/manager/teams'}
            className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg border border-[#d8d8d8] bg-white px-4 text-[13px] font-medium text-[#6b6b6b] transition-colors hover:bg-[#f5f4f1]"
          >
            {canManageManagerWorkspace ? 'Manager overview' : 'Department workspace'}
          </Link>
        ) : null}
      </div>
      <PendingApprovalsClient initial={rows} viewerRole={me.role as string} />
    </div>
  );
}
