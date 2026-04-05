import { OrgLeaveAdminClient } from '@/components/admin/OrgLeaveAdminClient';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export default async function AdminLeavePage() {
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

  const orgId = profile.org_id as string;

  const { data: allowed } = await supabase.rpc('has_permission', {
    p_user_id: user.id,
    p_org_id: orgId,
    p_permission_key: 'leave.manage_org',
    p_context: {},
  });
  if (!allowed) redirect('/admin');

  const [{ data: members }, { data: settings }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, full_name, email')
      .eq('org_id', orgId)
      .eq('status', 'active')
      .order('full_name'),
    supabase
      .from('org_leave_settings')
      .select('bradford_window_days, leave_year_start_month, leave_year_start_day')
      .eq('org_id', orgId)
      .maybeSingle(),
  ]);

  return (
    <OrgLeaveAdminClient
      orgId={orgId}
      members={(members ?? []) as { id: string; full_name: string; email: string | null }[]}
      initialSettings={
        settings
          ? {
              bradford_window_days: Number(settings.bradford_window_days),
              leave_year_start_month: Number(settings.leave_year_start_month),
              leave_year_start_day: Number(settings.leave_year_start_day),
            }
          : null
      }
    />
  );
}
