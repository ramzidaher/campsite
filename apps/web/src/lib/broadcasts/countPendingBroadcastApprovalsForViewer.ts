import type { SupabaseClient } from '@supabase/supabase-js';
import { isBroadcastApproverRole } from '@campsite/types';

/**
 * Count of broadcasts in `pending_approval` the viewer may approve (org admins: org-wide;
 * managers: managed departments only). Same scope as `PendingBroadcastList` in BroadcastsClient.
 */
export async function countPendingBroadcastApprovalsForViewer(
  supabase: SupabaseClient,
  args: { userId: string; orgId: string; role: string }
): Promise<number> {
  const { userId, orgId, role } = args;
  if (!isBroadcastApproverRole(role)) return 0;

  let q = supabase
    .from('broadcasts')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending_approval')
    .eq('org_id', orgId);

  if (role === 'manager') {
    const { data: dm } = await supabase.from('dept_managers').select('dept_id').eq('user_id', userId);
    const ids = (dm ?? []).map((m) => m.dept_id as string);
    if (!ids.length) return 0;
    q = q.in('dept_id', ids);
  }

  const { count, error } = await q;
  if (error) return 0;
  return typeof count === 'number' ? count : 0;
}
