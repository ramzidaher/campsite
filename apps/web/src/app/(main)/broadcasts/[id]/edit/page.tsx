import { BroadcastEditForm } from '@/components/broadcasts/BroadcastEditForm';
import { createClient } from '@/lib/supabase/server';
import { getAuthUser } from '@/lib/supabase/getAuthUser';
import { notFound, redirect } from 'next/navigation';

export default async function BroadcastEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const [{ data: b, error }, mayEditRes] = await Promise.all([
    supabase
      .from('broadcasts')
      .select('id, title, body, status, sent_at, cover_image_url, scheduled_at')
      .eq('id', id)
      .single(),
    supabase.rpc('broadcast_may_edit_content', { p_broadcast_id: id }),
  ]);

  if (error || !b) notFound();
  if (mayEditRes.data !== true) redirect(`/broadcasts/${id}`);

  return (
    <BroadcastEditForm
      broadcastId={b.id as string}
      userId={user.id}
      initialTitle={(b.title as string) ?? ''}
      initialBody={(b.body as string) ?? ''}
      initialCoverUrl={(b.cover_image_url as string | null) ?? null}
      status={b.status as string}
      initialScheduledAt={(b.scheduled_at as string | null) ?? null}
    />
  );
}
