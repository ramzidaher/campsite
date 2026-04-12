import { AttendanceSettingsClient } from '@/components/attendance/AttendanceSettingsClient';
import { createClient } from '@/lib/supabase/server';
import { getAuthUser } from '@/lib/supabase/getAuthUser';
import { redirect } from 'next/navigation';

export default async function AttendanceSettingsPage() {
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id, status')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile?.org_id || profile.status !== 'active') redirect('/broadcasts');

  const orgId = profile.org_id as string;

  const { data: ok } = await supabase.rpc('has_permission', {
    p_user_id: user.id,
    p_org_id: orgId,
    p_permission_key: 'hr.manage_records',
    p_context: {},
  });

  if (!ok) redirect('/hr/records');

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-7">
      <h1 className="font-authSerif text-[26px] tracking-[-0.03em] text-[#121212]">Attendance & work sites</h1>
      <p className="mt-1 text-[13px] text-[#6b6b6b]">Geofences for clock-in and rejection policy for weekly timesheets.</p>
      <div className="mt-8">
        <AttendanceSettingsClient orgId={orgId} />
      </div>
    </div>
  );
}
