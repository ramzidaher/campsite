import { RotaClient } from '@/components/rota/RotaClient';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export default async function RotaPage() {
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

  const { data: orgRow } = await supabase
    .from('organisations')
    .select('timezone')
    .eq('id', profile.org_id)
    .single();

  return (
    <RotaClient
      profile={{
        id: profile.id,
        org_id: profile.org_id,
        role: profile.role,
        full_name: profile.full_name,
        org_timezone: (orgRow?.timezone as string | null) ?? null,
      }}
    />
  );
}
