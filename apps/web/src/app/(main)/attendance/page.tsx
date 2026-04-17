import { AttendanceClockClient } from '@/components/attendance/AttendanceClockClient';
import { createClient } from '@/lib/supabase/server';
import { getAuthUser } from '@/lib/supabase/getAuthUser';
import { redirect } from 'next/navigation';

export default async function AttendancePage() {
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

  const { data: hr } = await supabase
    .from('employee_hr_records')
    .select('timesheet_clock_enabled')
    .eq('org_id', orgId)
    .eq('user_id', user.id)
    .maybeSingle();

  const enabled = Boolean(hr?.timesheet_clock_enabled);

  return (
    <div className="mx-auto max-w-2xl px-5 py-8 sm:px-7">
      <h1 className="font-authSerif text-[26px] tracking-[-0.03em] text-[#121212]">Attendance</h1>
      <p className="mt-1 text-[13px] text-[#6b6b6b]">Clock in and out at work. Submitted weeks go to your line manager.</p>
      <div className="mt-8">
        <AttendanceClockClient orgId={orgId} userId={user.id} enabled={enabled} />
      </div>
    </div>
  );
}
