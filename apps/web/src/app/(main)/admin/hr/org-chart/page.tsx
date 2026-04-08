import { OrgChartClient } from '@/components/admin/hr/OrgChartClient';
import type { HRDirectoryRow } from '@/components/admin/hr/HRDirectoryClient';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export default async function HROrgChartPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id, status')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile?.org_id || profile.status !== 'active') redirect('/broadcasts');

  const allowed = await supabase
    .rpc('has_permission', {
      p_user_id: user.id,
      p_org_id: profile.org_id,
      p_permission_key: 'hr.view_records',
      p_context: {},
    })
    .then(({ data }) => !!data);

  if (!allowed) redirect('/admin');

  const { data: rows } = await supabase.rpc('hr_directory_list');

  return (
    <div style={{ height: 'calc(100dvh - 60px)', background: '#0a0a0c' }}>
      <OrgChartClient rows={(rows ?? []) as HRDirectoryRow[]} />
    </div>
  );
}
