import { InterviewScheduleClient } from '@/app/(main)/admin/interviews/InterviewScheduleClient';
import { viewerHasPermission } from '@/lib/authz/serverGuards';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export default async function AdminInterviewsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id, role, status')
    .eq('id', user.id)
    .single();

  if (!profile?.org_id || profile.status !== 'active') redirect('/broadcasts');
  const [canViewInterviews, canBookInterviewSlot] = await Promise.all([
    viewerHasPermission('interviews.view'),
    viewerHasPermission('interviews.book_slot'),
  ]);
  if (!canViewInterviews && !canBookInterviewSlot) redirect('/broadcasts');

  const orgId = profile.org_id as string;
  const [canCreateSlot, canCompleteSlot] = await Promise.all([
    viewerHasPermission('interviews.create_slot'),
    viewerHasPermission('interviews.complete_slot'),
  ]);
  const fromPast = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [{ data: jobs }, { data: profiles }, { data: slots }] = await Promise.all([
    supabase
      .from('job_listings')
      .select('id, title, status')
      .eq('org_id', orgId)
      .order('title', { ascending: true }),
    supabase
      .from('profiles')
      .select('id, full_name, email')
      .eq('org_id', orgId)
      .eq('status', 'active')
      .order('full_name', { ascending: true }),
    supabase
      .from('interview_slots')
      .select(
        `
        id,
        title,
        starts_at,
        ends_at,
        status,
        job_listing_id,
        job_listings ( title ),
        interview_slot_panelists ( profile_id, profiles ( full_name ) )
      `
      )
      .eq('org_id', orgId)
      .gte('starts_at', fromPast)
      .order('starts_at', { ascending: true })
      .limit(80),
  ]);

  return (
    <InterviewScheduleClient
      canCreateSlot={canCreateSlot}
      canCompleteSlot={canCompleteSlot}
      jobs={(jobs ?? []) as { id: string; title: string; status: string }[]}
      profiles={(profiles ?? []) as { id: string; full_name: string | null; email: string | null }[]}
      initialSlots={(slots ?? []) as Parameters<typeof InterviewScheduleClient>[0]['initialSlots']}
    />
  );
}
