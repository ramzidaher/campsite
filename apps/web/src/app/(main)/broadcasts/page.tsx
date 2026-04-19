import { BroadcastsClient } from '@/components/broadcasts/BroadcastsClient';
import { createClient } from '@/lib/supabase/server';
import {
  canComposeBroadcast,
  isBroadcastDraftOnlyRole,
} from '@campsite/types';
import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/supabase/getAuthUser';

const BROADCAST_TAB_KEYS = ['feed', 'drafts', 'submitted', 'scheduled'] as const;

type BroadcastUrlTab = (typeof BROADCAST_TAB_KEYS)[number];

export default async function BroadcastsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; compose?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, org_id, role, full_name, status')
    .eq('id', user.id)
    .single();

  if (!profile?.org_id) redirect('/login');
  if (profile.status !== 'active') redirect('/pending');

  const role = profile.role as string;
  const tabRaw = typeof sp.tab === 'string' ? sp.tab.trim() : '';

  if (tabRaw === 'pending') {
    redirect('/broadcasts?tab=submitted');
  }
  if (tabRaw === 'compose') {
    redirect('/broadcasts?tab=feed&compose=1');
  }

  if (tabRaw) {
    if (!BROADCAST_TAB_KEYS.includes(tabRaw as BroadcastUrlTab)) {
      redirect('/broadcasts');
    }
    const compose = canComposeBroadcast(role);
    const allowScheduled = compose && !isBroadcastDraftOnlyRole(role);
    if ((tabRaw === 'drafts' || tabRaw === 'submitted') && !compose) {
      redirect('/broadcasts');
    }
    if (tabRaw === 'scheduled' && !allowScheduled) redirect('/broadcasts');
  }

  const initialWorkspace: BroadcastUrlTab | undefined =
    tabRaw === 'feed'
      ? undefined
      : tabRaw && BROADCAST_TAB_KEYS.includes(tabRaw as BroadcastUrlTab)
        ? (tabRaw as BroadcastUrlTab)
        : undefined;

  const initialCompose = sp.compose === '1';

  return (
    <BroadcastsClient
      profile={{
        id: profile.id,
        org_id: profile.org_id,
        role: profile.role,
        full_name: profile.full_name,
      }}
      initialWorkspace={initialWorkspace}
      initialCompose={initialCompose}
    />
  );
}
