import { BroadcastDetailView } from '@/components/broadcasts/BroadcastDetailView';
import { createClient } from '@/lib/supabase/server';
import { notFound, redirect } from 'next/navigation';

export default async function BroadcastDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: b, error } = await supabase
    .from('broadcasts')
    .select(
      `
      id,
      org_id,
      title,
      body,
      status,
      sent_at,
      is_mandatory,
      is_pinned,
      is_org_wide,
      departments (name),
      broadcast_channels (name),
      dept_teams (name),
      sender:profiles!broadcasts_created_by_fkey (full_name)
    `
    )
    .eq('id', id)
    .single();

  if (error || !b) notFound();

  const first = <T,>(v: T | T[] | null | undefined): T | null =>
    v == null ? null : Array.isArray(v) ? (v[0] ?? null) : v;

  const dept = first(b.departments as { name: string } | { name: string }[] | null);
  const channel = first(b.broadcast_channels as { name: string } | { name: string }[] | null);
  const team = first(b.dept_teams as { name: string } | { name: string }[] | null);
  const sender = first(b.sender as { full_name: string } | { full_name: string }[] | null);

  return (
    <BroadcastDetailView
      userId={user.id}
      initial={{
        id: b.id as string,
        org_id: b.org_id as string,
        title: b.title as string,
        body: b.body as string,
        status: b.status as string,
        sent_at: b.sent_at as string | null,
        is_mandatory: Boolean(b.is_mandatory),
        is_pinned: Boolean(b.is_pinned),
        is_org_wide: Boolean(b.is_org_wide),
        departments: dept,
        broadcast_channels: channel,
        dept_teams: team,
        profiles: sender,
      }}
    />
  );
}
