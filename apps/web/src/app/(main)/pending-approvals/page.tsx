import { PendingApprovalsClient, type PendingRow } from '@/components/PendingApprovalsClient';
import { loadPendingApprovalRows } from '@/lib/admin/loadPendingApprovals';
import { createClient } from '@/lib/supabase/server';
import { isApproverRole } from '@campsite/types';
import { redirect } from 'next/navigation';

export default async function PendingApprovalsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: me } = await supabase
    .from('profiles')
    .select('role,org_id,id')
    .eq('id', user.id)
    .single();

  if (!me || !isApproverRole(me.role)) {
    redirect('/dashboard');
  }

  const full = await loadPendingApprovalRows(supabase, user.id, me.org_id as string, me.role as string);
  const rows: PendingRow[] = full.map((p) => ({
    id: p.id,
    full_name: p.full_name,
    email: p.email,
    created_at: p.created_at,
    departments: p.departments,
  }));

  return (
    <div>
      <h1 className="text-xl font-semibold text-[var(--campsite-text)]">Pending members</h1>
      <p className="mt-1 text-sm text-[var(--campsite-text-secondary)]">
        Approve or reject new registrations in your organisation.
      </p>
      <PendingApprovalsClient initial={rows} />
    </div>
  );
}
