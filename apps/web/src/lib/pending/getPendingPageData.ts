import {
  completeRegistrationProfileIfNeeded,
  syncRegistrationAvatarToProfileIfEmpty,
} from '@/lib/auth/completeRegistrationProfile';
import { sendPendingApprovalRequestEmail } from '@/lib/admin/sendPendingApprovalRequestEmail';
import { isPlatformFounder } from '@/lib/platform/requirePlatformFounder';
import { getAuthUser } from '@/lib/supabase/getAuthUser';
import { createClient } from '@/lib/supabase/server';

type PendingProfileRow = {
  id: string;
  status: string | null;
};

type PendingPageResult =
  | { kind: 'redirect'; to: string }
  | { kind: 'setup_error'; message: string; orgCreator: boolean }
  | { kind: 'profile_missing' }
  | { kind: 'awaiting_approval'; emailVerified: boolean; registrationError?: string };

type PendingSearchParams = {
  registration_error?: string;
};

async function loadProfileStatus(supabase: Awaited<ReturnType<typeof createClient>>, userId: string) {
  const { data } = await supabase.from('profiles').select('id,status').eq('id', userId).maybeSingle();
  return (data ?? null) as PendingProfileRow | null;
}

export async function getPendingPageData(searchParams: PendingSearchParams): Promise<PendingPageResult> {
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) return { kind: 'redirect', to: '/login' };

  const founder = await isPlatformFounder(supabase, user.id);
  await syncRegistrationAvatarToProfileIfEmpty(supabase, user);

  let profileRow = await loadProfileStatus(supabase, user.id);
  if (!profileRow) {
    if (founder) {
      return { kind: 'redirect', to: '/founders' };
    }

    const filled = await completeRegistrationProfileIfNeeded(supabase, user);
    if (!filled.ok) {
      return {
        kind: 'setup_error',
        message: filled.message,
        orgCreator: filled.kind === 'org_creator_pending',
      };
    }

    profileRow = await loadProfileStatus(supabase, user.id);
    if (!profileRow) {
      return { kind: 'profile_missing' };
    }
  }

  if (profileRow.status === 'inactive') {
    return { kind: 'redirect', to: '/login?error=inactive' };
  }

  if (profileRow.status === 'active') {
    if (founder) {
      const { data: activeProf } = await supabase
        .from('profiles')
        .select('org_id')
        .eq('id', user.id)
        .maybeSingle();
      if (activeProf?.org_id) return { kind: 'redirect', to: '/session-choice' };
      return { kind: 'redirect', to: '/founders' };
    }
    return { kind: 'redirect', to: '/dashboard' };
  }

  if (profileRow.status === 'pending' && profileRow.id) {
    const { data: requester } = await supabase
      .from('profiles')
      .select('full_name,email,org_id')
      .eq('id', profileRow.id)
      .maybeSingle();
    const orgId = requester?.org_id as string | null | undefined;
    if (orgId) {
      await sendPendingApprovalRequestEmail({
        profileId: profileRow.id,
        orgId,
        requesterName: (requester?.full_name as string | undefined)?.trim() || user.email || 'New member',
        requesterEmail: (requester?.email as string | null | undefined) ?? user.email ?? null,
      });
    }
  }

  return {
    kind: 'awaiting_approval',
    emailVerified: Boolean(user.email_confirmed_at),
    registrationError: searchParams.registration_error?.trim(),
  };
}
