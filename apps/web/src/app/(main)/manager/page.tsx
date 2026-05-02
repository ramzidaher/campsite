import { ManagerDashboardClient } from '@/components/admin/ManagerDashboardClient';
import { endOfWeekExclusive, startOfWeekMonday } from '@/lib/datetime';
import { getMyPermissions } from '@/lib/supabase/getMyPermissions';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/supabase/getAuthUser';
import { warnIfSlowServerPath, withServerPerf } from '@/lib/perf/serverPerf';

type StaffTimelineItem = {
  id: string;
  title: string;
  date: string;
  category:
    | 'new_starter'
    | 'right_to_work'
    | 'contract'
    | 'induction'
    | 'probation'
    | 'check_in'
    | 'offer'
    | 'other';
  source: string;
  editable: boolean;
  editHref: string | null;
  completed: boolean;
  recurring: boolean;
  details: string;
};

type StaffTimelineRow = {
  userId: string;
  fullName: string;
  departmentName: string | null;
  items: StaffTimelineItem[];
};

export default async function ManagerDashboardPage() {
  const pathStartedAtMs = Date.now();
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, org_id, role, status, full_name')
    .eq('id', user.id)
    .single();

  if (!profile?.org_id || profile.status !== 'active') {
    redirect('/broadcasts');
  }
  const permissionKeys = await withServerPerf('/manager', 'get_my_permissions', getMyPermissions(profile.org_id as string), 300);
  const canViewDepartments   = permissionKeys.includes('departments.view');
  const canCreateRecruitment = permissionKeys.includes('recruitment.create_request');
  if (!canViewDepartments && !canCreateRecruitment) redirect('/broadcasts');

  if (!canCreateRecruitment) {
    redirect('/manager/teams');
  }

  const { data: managed } = await supabase.from('dept_managers').select('dept_id').eq('user_id', user.id);
  const deptIds = (managed ?? []).map((m) => m.dept_id as string);

  let pendingUsers = 0;
  let activeUsers = 0;
  let totalMembers = 0;
  let pendingBroadcasts = 0;
  let broadcastsThisWeek = 0;
  let shiftsWeek = 0;
  let shiftsToday = 0;
  let teamsCount = 0;
  let departmentNames: string[] = [];
  let upcomingItems: Array<{ id: string; title: string; start_time: string; kind: 'event' | 'shift' }> = [];
  let departmentBreakdown: Array<{ id: string; name: string; members: number; shiftsWeek: number }> = [];
  let staffTimelineRows: StaffTimelineRow[] = [];

  if (deptIds.length) {
    const now = new Date();
    const weekStart = startOfWeekMonday(now);
    const weekEnd = endOfWeekExclusive(weekStart);
    const dayStart = new Date(now);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const [
      { data: departments },
      { data: udRows },
      { data: teamRows },
      { count: bcPending },
      { count: bcWeek },
      { count: shWeek },
      { count: shToday },
      { data: eventRows },
      { data: upcomingShiftRows },
    ] = await Promise.all([
      withServerPerf('/manager', 'departments_for_manager', supabase.from('departments').select('id,name').in('id', deptIds), 350),
      withServerPerf('/manager', 'user_departments_for_manager', supabase.from('user_departments').select('user_id,dept_id').in('dept_id', deptIds), 350),
      withServerPerf('/manager', 'team_rows_for_manager', supabase.from('department_teams').select('id').in('dept_id', deptIds), 350),
      supabase
        .from('broadcasts')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', profile.org_id)
        .eq('status', 'pending_approval')
        .in('dept_id', deptIds),
      supabase
        .from('broadcasts')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', profile.org_id)
        .eq('status', 'sent')
        .in('dept_id', deptIds)
        .gte('sent_at', weekStart.toISOString())
        .lt('sent_at', weekEnd.toISOString()),
      supabase
        .from('rota_shifts')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', profile.org_id)
        .in('dept_id', deptIds)
        .gte('start_time', weekStart.toISOString())
        .lt('start_time', weekEnd.toISOString()),
      supabase
        .from('rota_shifts')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', profile.org_id)
        .in('dept_id', deptIds)
        .gte('start_time', dayStart.toISOString())
        .lt('start_time', dayEnd.toISOString()),
      supabase
        .from('calendar_events')
        .select('id,title,start_time')
        .eq('org_id', profile.org_id)
        .in('dept_id', deptIds)
        .gte('start_time', now.toISOString())
        .order('start_time', { ascending: true })
        .limit(4),
      supabase
        .from('rota_shifts')
        .select('id,start_time,role_label')
        .eq('org_id', profile.org_id)
        .in('dept_id', deptIds)
        .gte('start_time', now.toISOString())
        .order('start_time', { ascending: true })
        .limit(4),
    ]);

    departmentNames = (departments ?? [])
      .map((d) => (typeof d.name === 'string' ? d.name.trim() : ''))
      .filter(Boolean);
    const deptNameById = new Map(
      (departments ?? []).map((d) => [String(d.id), typeof d.name === 'string' ? d.name : 'Department'])
    );

    pendingBroadcasts = bcPending ?? 0;
    broadcastsThisWeek = bcWeek ?? 0;
    shiftsWeek = shWeek ?? 0;
    shiftsToday = shToday ?? 0;
    teamsCount = teamRows?.length ?? 0;

    const memberIds = [...new Set((udRows ?? []).map((r) => String(r.user_id)).filter(Boolean))];
    totalMembers = memberIds.length;
    if (memberIds.length) {
      const { data: profileRows } = await supabase
        .from('profiles')
        .select('id,status')
        .eq('org_id', profile.org_id)
        .in('id', memberIds);
      const rows = profileRows ?? [];
      pendingUsers = rows.filter((r) => r.status === 'pending').length;
      activeUsers = rows.filter((r) => r.status === 'active').length;
    }

    const membersByDept = new Map<string, Set<string>>();
    for (const row of udRows ?? []) {
      const deptId = String(row.dept_id ?? '');
      const userId = String(row.user_id ?? '');
      if (!deptId || !userId) continue;
      if (!membersByDept.has(deptId)) membersByDept.set(deptId, new Set());
      membersByDept.get(deptId)?.add(userId);
    }

    const { data: shiftsByDeptRaw } = await withServerPerf(
      '/manager',
      'shifts_by_dept_week',
      supabase
        .from('rota_shifts')
        .select('id,dept_id')
        .eq('org_id', profile.org_id)
        .in('dept_id', deptIds)
        .gte('start_time', weekStart.toISOString())
        .lt('start_time', weekEnd.toISOString()),
      400
    );
    const shiftsByDept = new Map<string, number>();
    for (const row of shiftsByDeptRaw ?? []) {
      const deptId = String(row.dept_id ?? '');
      if (!deptId) continue;
      shiftsByDept.set(deptId, (shiftsByDept.get(deptId) ?? 0) + 1);
    }

    departmentBreakdown = deptIds.map((deptId) => ({
      id: deptId,
      name: deptNameById.get(deptId) ?? 'Department',
      members: membersByDept.get(deptId)?.size ?? 0,
      shiftsWeek: shiftsByDept.get(deptId) ?? 0,
    }));

    const upcomingEvents = (eventRows ?? []).map((e) => ({
      id: String(e.id),
      title: String(e.title ?? 'Upcoming event'),
      start_time: String(e.start_time),
      kind: 'event' as const,
    }));
    const upcomingShifts = (upcomingShiftRows ?? []).map((s) => ({
      id: `shift-${String(s.id)}`,
      title: String((s.role_label as string | null)?.trim() || 'Upcoming shift'),
      start_time: String(s.start_time),
      kind: 'shift' as const,
    }));
    upcomingItems = [...upcomingEvents, ...upcomingShifts]
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())
      .slice(0, 6);

    const managedUsersByDept = new Map<string, string[]>();
    for (const deptId of deptIds) managedUsersByDept.set(deptId, []);
    for (const row of udRows ?? []) {
      const deptId = String(row.dept_id ?? '');
      const userId = String(row.user_id ?? '');
      if (!deptId || !userId || !managedUsersByDept.has(deptId)) continue;
      managedUsersByDept.get(deptId)?.push(userId);
    }

    if (memberIds.length) {
      const { data: hrRecords } = await supabase
        .from('employee_hr_records')
        .select(
          'user_id,employment_start_date,contract_start_date,probation_end_date,rtw_checked_on,rtw_expiry_date,hired_from_application_id'
        )
        .eq('org_id', profile.org_id)
        .in('user_id', memberIds);
      const hiredFromApplicationIds = [
        ...new Set((hrRecords ?? []).map((r) => String(r.hired_from_application_id ?? '')).filter(Boolean)),
      ];

      const [
        { data: memberProfiles },
        { data: onboardingRuns },
        { data: onboardingTasks },
        { data: probationCheckpoints },
        { data: oneOnOneMeetingsRaw },
        { data: jobApplications },
        { data: applicationOffers },
      ] = await Promise.all([
        supabase.from('profiles').select('id,full_name').in('id', memberIds).eq('org_id', profile.org_id),
        supabase
          .from('onboarding_runs')
          .select('id,user_id,employment_start_date,status')
          .eq('org_id', profile.org_id)
          .in('user_id', memberIds)
          .in('status', ['active', 'completed']),
        supabase
          .from('onboarding_run_tasks')
          .select('run_id,title,due_date,status')
          .eq('org_id', profile.org_id)
          .in('status', ['pending', 'completed']),
        supabase
          .from('onboarding_probation_checkpoints')
          .select('user_id,checkpoint_day,due_on,completed_at')
          .eq('org_id', profile.org_id)
          .in('user_id', memberIds),
        supabase.rpc('one_on_one_meeting_list', { p_limit: 400, p_include_cancelled: false }),
        hiredFromApplicationIds.length
          ? supabase.from('job_applications').select('id,org_id').in('id', hiredFromApplicationIds)
          : Promise.resolve({ data: [] as Array<{ id: string; org_id: string }> }),
        supabase
          .from('application_offers')
          .select('application_id,sent_at,status')
          .eq('org_id', profile.org_id)
          .eq('status', 'sent')
          .order('sent_at', { ascending: false }),
      ]);

      const oneOnOneMeetings = Array.isArray(oneOnOneMeetingsRaw)
        ? oneOnOneMeetingsRaw
            .map((row) => ({
              report_user_id: String((row as { report_user_id?: string }).report_user_id ?? ''),
              starts_at: String((row as { starts_at?: string }).starts_at ?? ''),
              status: String((row as { status?: string }).status ?? ''),
            }))
            .filter((m) => memberIds.includes(m.report_user_id))
        : [];

      const nameByUserId = new Map((memberProfiles ?? []).map((m) => [String(m.id), String(m.full_name ?? 'Team member')]));
      const deptByUserId = new Map<string, string>();
      for (const [deptId, users] of managedUsersByDept.entries()) {
        const deptName = deptNameById.get(deptId) ?? 'Department';
        for (const uid of users) {
          if (!deptByUserId.has(uid)) deptByUserId.set(uid, deptName);
        }
      }

      const hrByUserId = new Map((hrRecords ?? []).map((r) => [String(r.user_id), r]));
      const activeRunIds = new Set(
        (onboardingRuns ?? []).filter((r) => r.status === 'active').map((r) => String(r.id))
      );
      const runByUserId = new Map<string, { id: string; employment_start_date: string | null; status: string }>();
      for (const run of onboardingRuns ?? []) {
        const uid = String(run.user_id ?? '');
        if (!uid) continue;
        const existing = runByUserId.get(uid);
        if (!existing || run.status === 'active') {
          runByUserId.set(uid, {
            id: String(run.id),
            employment_start_date: run.employment_start_date ? String(run.employment_start_date) : null,
            status: String(run.status ?? ''),
          });
        }
      }

      const tasksByRunId = new Map<string, Array<{ title: string; due_date: string | null; status: string }>>();
      for (const task of onboardingTasks ?? []) {
        const runId = String(task.run_id ?? '');
        if (!runId || !activeRunIds.has(runId)) continue;
        if (!tasksByRunId.has(runId)) tasksByRunId.set(runId, []);
        tasksByRunId.get(runId)?.push({
          title: String(task.title ?? 'Onboarding task'),
          due_date: task.due_date ? String(task.due_date) : null,
          status: String(task.status ?? 'pending'),
        });
      }

      const checkpointsByUserId = new Map<
        string,
        Array<{ checkpoint_day: number; due_on: string | null; completed_at: string | null }>
      >();
      for (const cp of probationCheckpoints ?? []) {
        const uid = String(cp.user_id ?? '');
        if (!uid) continue;
        if (!checkpointsByUserId.has(uid)) checkpointsByUserId.set(uid, []);
        checkpointsByUserId.get(uid)?.push({
          checkpoint_day: Number(cp.checkpoint_day ?? 0),
          due_on: cp.due_on ? String(cp.due_on) : null,
          completed_at: cp.completed_at ? String(cp.completed_at) : null,
        });
      }

      const checkinsByUserId = new Map<string, string[]>();
      for (const m of oneOnOneMeetings ?? []) {
        const uid = String(m.report_user_id ?? '');
        const startsAt = m.starts_at ? String(m.starts_at) : '';
        if (!uid || !startsAt) continue;
        if (!checkinsByUserId.has(uid)) checkinsByUserId.set(uid, []);
        checkinsByUserId.get(uid)?.push(startsAt);
      }

      const validApplicationIds = new Set((jobApplications ?? []).map((a) => String(a.id)));
      const offerSentByApplicationId = new Map<string, string>();
      for (const offer of applicationOffers ?? []) {
        const appId = String(offer.application_id ?? '');
        const sentAt = offer.sent_at ? String(offer.sent_at) : '';
        if (!appId || !sentAt || !validApplicationIds.has(appId) || offerSentByApplicationId.has(appId)) continue;
        offerSentByApplicationId.set(appId, sentAt);
      }

      staffTimelineRows = memberIds
        .map((uid): StaffTimelineRow => {
          const name = nameByUserId.get(uid) ?? 'Team member';
          const deptName = deptByUserId.get(uid) ?? null;
          const hr = hrByUserId.get(uid) as
            | {
                employment_start_date: string | null;
                contract_start_date: string | null;
                probation_end_date: string | null;
                rtw_checked_on: string | null;
                rtw_expiry_date: string | null;
                hired_from_application_id: string | null;
              }
            | undefined;
          const run = runByUserId.get(uid);
          const items: StaffTimelineItem[] = [];

          if (hr?.hired_from_application_id) {
            const sentAt = offerSentByApplicationId.get(String(hr.hired_from_application_id));
            if (sentAt) {
              items.push({
                id: `offer-${uid}`,
                title: 'Job offer sent',
                date: sentAt,
                category: 'offer',
                source: 'Recruitment',
                editable: true,
                editHref: '/hr/hiring',
                completed: true,
                recurring: false,
                details: 'Offer dispatch milestone synced from recruitment records.',
              });
            }
          }

          const contractDate = hr?.contract_start_date ?? hr?.employment_start_date;
          if (contractDate) {
            items.push({
              id: `contract-${uid}`,
              title: 'Contract start',
              date: contractDate,
              category: 'contract',
              source: 'HR Record',
              editable: true,
              editHref: `/admin/hr/${uid}`,
              completed: new Date(contractDate).getTime() < Date.now(),
              recurring: false,
              details: 'Primary contract start date from employee HR record.',
            });
          }

          if (hr?.rtw_checked_on) {
            items.push({
              id: `rtw-check-${uid}`,
              title: 'Right to work check',
              date: hr.rtw_checked_on,
              category: 'right_to_work',
              source: 'HR Record',
              editable: true,
              editHref: `/admin/hr/${uid}`,
              completed: true,
              recurring: false,
              details: 'Right-to-work verification completion date from HR record.',
            });
          }
          if (hr?.rtw_expiry_date) {
            items.push({
              id: `rtw-expiry-${uid}`,
              title: 'Right to work expiry',
              date: hr.rtw_expiry_date,
              category: 'right_to_work',
              source: 'HR Record',
              editable: true,
              editHref: `/admin/hr/${uid}`,
              completed: false,
              recurring: false,
              details: 'Right-to-work expiry date requiring periodic renewal tracking.',
            });
          }

          if (run?.employment_start_date) {
            items.push({
              id: `starter-${uid}`,
              title: run.status === 'active' ? 'New starter onboarding active' : 'Starter onboarding complete',
              date: run.employment_start_date,
              category: 'new_starter',
              source: 'Onboarding',
              editable: run.status !== 'completed',
              editHref: '/admin/hr/onboarding',
              completed: run.status === 'completed',
              recurring: false,
              details: 'Onboarding run status and start date from onboarding workflow.',
            });
          }

          if (run) {
            for (const task of tasksByRunId.get(run.id) ?? []) {
              if (!task.due_date) continue;
              const lower = task.title.toLowerCase();
              const inductionLike =
                lower.includes('induction') || lower.includes('new starter form') || lower.includes('orientation');
              if (!inductionLike) continue;
              items.push({
                id: `induction-${uid}-${task.title}-${task.due_date}`,
                title: task.title,
                date: task.due_date,
                category: 'induction',
                source: 'Onboarding task',
                editable: task.status !== 'completed',
                editHref: '/admin/hr/onboarding',
                completed: task.status === 'completed',
                recurring: false,
                details: `Induction/new starter task from onboarding checklist (${task.status}).`,
              });
            }
          }

          if (hr?.probation_end_date) {
            items.push({
              id: `probation-end-${uid}`,
              title: 'Probation review due',
              date: hr.probation_end_date,
              category: 'probation',
              source: 'HR Record',
              editable: true,
              editHref: `/admin/hr/${uid}`,
              completed: false,
              recurring: false,
              details: 'Primary probation review date from employee HR record.',
            });
          }

          for (const cp of checkpointsByUserId.get(uid) ?? []) {
            if (!cp.due_on) continue;
            items.push({
              id: `probation-checkpoint-${uid}-${cp.checkpoint_day}-${cp.due_on}`,
              title: `${cp.checkpoint_day}-day probation checkpoint`,
              date: cp.due_on,
              category: 'probation',
              source: 'Probation policy',
              editable: !cp.completed_at,
              editHref: '/admin/hr/onboarding',
              completed: Boolean(cp.completed_at),
              recurring: false,
              details: `Policy-driven checkpoint (day ${cp.checkpoint_day}) generated from probation policy settings.`,
            });
          }

          for (const startsAt of (checkinsByUserId.get(uid) ?? []).slice(0, 4)) {
            items.push({
              id: `checkin-${uid}-${startsAt}`,
              title: '1:1 check-in',
              date: startsAt,
              category: 'check_in',
              source: 'One-on-one',
              editable: true,
              editHref: '/one-on-one',
              completed: false,
              recurring: true,
              details: 'Scheduled recurring manager/report 1:1 pulled from one-on-one meetings.',
            });
          }

          items.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

          return {
            userId: uid,
            fullName: name,
            departmentName: deptName,
            items,
          };
        })
        .filter((row) => row.userId === user.id)
        .filter((row) => row.items.length > 0)
        .slice(0, 1);
    }
  }

  const view = (
    <ManagerDashboardClient
      stats={{
        pendingUsers,
        activeUsers,
        totalMembers,
        pendingBroadcasts,
        broadcastsThisWeek,
        shiftsWeek,
        shiftsToday,
        teamsCount,
      }}
      hasDepartments={deptIds.length > 0}
      departmentNames={departmentNames}
      upcomingItems={upcomingItems}
      departmentBreakdown={departmentBreakdown}
      staffTimelineRows={staffTimelineRows}
      viewerUserId={user.id}
      viewerFullName={typeof profile?.full_name === 'string' ? profile.full_name.trim() || 'You' : 'You'}
    />
  );
  warnIfSlowServerPath('/manager', pathStartedAtMs);
  return view;
}
