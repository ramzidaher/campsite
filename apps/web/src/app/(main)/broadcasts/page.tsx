import { BroadcastsClient } from '@/components/broadcasts/BroadcastsClient';
import { createClient } from '@/lib/supabase/server';
import {
  canComposeBroadcast,
  isBroadcastApproverRole,
  isBroadcastDraftOnlyRole,
} from '@campsite/types';
import { redirect } from 'next/navigation';

const BROADCAST_TAB_KEYS = [
  'feed',
  'compose',
  'drafts',
  'submitted',
  'scheduled',
  'pending',
] as const;

type BroadcastUrlTab = (typeof BROADCAST_TAB_KEYS)[number];

export default async function BroadcastsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
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
  if (tabRaw) {
    if (!BROADCAST_TAB_KEYS.includes(tabRaw as BroadcastUrlTab)) {
      redirect('/broadcasts');
    }
    const compose = canComposeBroadcast(role);
    const allowScheduled = compose && !isBroadcastDraftOnlyRole(role);
    const approver = isBroadcastApproverRole(role);
    if (
      (tabRaw === 'compose' || tabRaw === 'drafts' || tabRaw === 'submitted') &&
      !compose
    ) {
      redirect('/broadcasts');
    }
    if (tabRaw === 'scheduled' && !allowScheduled) redirect('/broadcasts');
    if (tabRaw === 'pending' && !approver) redirect('/broadcasts');
  }

  const initialTab: BroadcastUrlTab | undefined =
    tabRaw === 'feed'
      ? undefined
      : tabRaw && BROADCAST_TAB_KEYS.includes(tabRaw as BroadcastUrlTab)
        ? (tabRaw as BroadcastUrlTab)
        : undefined;

  return (
    <BroadcastsClient
      profile={{
        id: profile.id,
        org_id: profile.org_id,
        role: profile.role,
        full_name: profile.full_name,
      }}
      initialTab={initialTab}
    />
  );
}
