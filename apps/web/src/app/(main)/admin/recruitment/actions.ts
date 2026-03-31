'use server';

import { createClient } from '@/lib/supabase/server';
import { isRecruitmentRequestStatus, isOrgAdminRole } from '@campsite/types';
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

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, status, org_id')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile?.org_id || profile.status !== 'active' || !isOrgAdminRole(profile.role)) {
    return { ok: false, error: 'Not allowed.' };
  }

  const { error } = await supabase.rpc('set_recruitment_request_status', {
    p_request_id: id,
    p_new_status: newStatus,
    p_note: note?.trim() ? note.trim() : null,
  });

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath('/admin/recruitment');
  revalidatePath(`/admin/recruitment/${id}`);
  revalidatePath('/manager/recruitment');

  return { ok: true };
}
