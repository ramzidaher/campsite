'use server';

import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { isRecruitmentRequestStatus } from '@campsite/types';
import { revalidatePath } from 'next/cache';

export type SetRecruitmentStatusState = { ok: true } | { ok: false; error: string };

export async function setRecruitmentRequestStatusAction(
  requestId: string,
  newStatus: string,
  note?: string | null
): Promise<SetRecruitmentStatusState> {
  const id = requestId?.trim();
  if (!id) return { ok: false, error: 'Missing request.' };

  if (!isRecruitmentRequestStatus(newStatus)) {
    return { ok: false, error: 'Invalid status.' };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not signed in.' };

  const { data: profile } = await supabase.from('profiles').select('status, org_id').eq('id', user.id).maybeSingle();
  if (!profile?.org_id || profile.status !== 'active') {
    return { ok: false, error: 'Not allowed.' };
  }
  const { data: canApprove } = await supabase.rpc('has_permission', {
    p_user_id: user.id,
    p_org_id: profile.org_id,
    p_permission_key: 'recruitment.approve_request',
    p_context: {},
  });
  if (!canApprove) {
    return { ok: false, error: 'Not allowed.' };
  }

  // Fetch current status before changing it (for notification diff)
  const { data: existing } = await supabase
    .from('recruitment_requests')
    .select('status')
    .eq('id', id)
    .maybeSingle();
  const oldStatus = (existing?.status as string | null) ?? null;

  const { error } = await supabase.rpc('set_recruitment_request_status', {
    p_request_id: id,
    p_new_status: newStatus,
    p_note: note?.trim() ? note.trim() : null,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  // In-app notification to the requesting manager (best-effort)
  if (oldStatus && oldStatus !== newStatus) {
    try {
      const { data: actorProfile } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', user.id)
        .maybeSingle();
      const actorName = (actorProfile?.full_name as string | null)?.trim() ?? null;
      const admin = createServiceRoleClient();
      void admin.rpc('recruitment_notify_status_changed', {
        p_request_id: id,
        p_old_status: oldStatus,
        p_new_status: newStatus,
        p_actor_name: actorName,
      });
    } catch {
      // Non-fatal
    }
  }

  revalidatePath('/admin/recruitment');
  revalidatePath(`/admin/recruitment/${id}`);
  revalidatePath('/hr/recruitment');
  revalidatePath(`/hr/recruitment/${id}`);
  revalidatePath('/manager/recruitment');

  return { ok: true };
}
