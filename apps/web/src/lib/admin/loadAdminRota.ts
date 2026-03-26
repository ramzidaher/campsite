import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { endOfWeekExclusive, startOfWeekMonday } from '@/lib/datetime';

function first<T>(v: T | T[] | null | undefined): T | null {
  if (v == null) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

export type AdminRotaUpcomingRow = {
  id: string;
  role_label: string | null;
  start_time: string;
  end_time: string;
  staffName: string;
  departmentName: string;
};

export type AdminRotaDashboardModel = {
  shiftsThisWeek: number;
  deptCountThisWeek: number;
  unfilledThisWeek: number;
  coveragePct: number | null;
  lastSyncLabel: string | null;
  lastSyncSub: string | null;
  hasSheetsMapping: boolean;
  upcoming: AdminRotaUpcomingRow[];
};

export async function loadAdminRotaDashboard(
  supabase: SupabaseClient,
  orgId: string
): Promise<AdminRotaDashboardModel> {
  const now = new Date();
  const weekStart = startOfWeekMonday(now);
  const weekEnd = endOfWeekExclusive(weekStart);
  const from = weekStart.toISOString();
  const to = weekEnd.toISOString();

  const { data: weekShifts } = await supabase
    .from('rota_shifts')
    .select('id, user_id, dept_id')
    .eq('org_id', orgId)
    .gte('start_time', from)
    .lt('start_time', to);

  const list = weekShifts ?? [];
  const shiftsThisWeek = list.length;
  const unfilledThisWeek = list.filter((s) => s.user_id == null).length;
  const filled = shiftsThisWeek - unfilledThisWeek;
  const deptIds = new Set(
    list.map((s) => s.dept_id as string | null).filter((id): id is string => id != null && id !== '')
  );
  const coveragePct = shiftsThisWeek > 0 ? Math.round((filled / shiftsThisWeek) * 100) : null;

  const [{ data: logRow }, { data: mapRow }, { data: upcomingRaw }] = await Promise.all([
    supabase
      .from('rota_sheets_sync_log')
      .select('started_at, finished_at, rows_imported, error_message, source')
      .eq('org_id', orgId)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from('sheets_mappings').select('id').eq('org_id', orgId).limit(1).maybeSingle(),
    supabase
      .from('rota_shifts')
      .select(
        `id, role_label, start_time, end_time,
         departments(name),
         assignee:profiles!rota_shifts_user_id_fkey(full_name)`
      )
      .eq('org_id', orgId)
      .gte('start_time', now.toISOString())
      .lt('start_time', to)
      .order('start_time', { ascending: true })
      .limit(50),
  ]);

  let lastSyncLabel: string | null = null;
  let lastSyncSub: string | null = null;
  if (logRow) {
    const err = logRow.error_message as string | null;
    const fin = logRow.finished_at as string | null;
    const st = logRow.started_at as string;
    if (fin && !err) {
      lastSyncLabel = new Date(fin).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
      lastSyncSub = `${logRow.rows_imported as number} rows · ${logRow.source as string}`;
    } else if (st) {
      lastSyncLabel = new Date(st).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
      lastSyncSub = err ? 'Last run reported errors' : fin ? '—' : 'In progress';
    }
  }

  const upcoming: AdminRotaUpcomingRow[] = (upcomingRaw ?? []).map((r) => {
    const dept = first(r.departments as { name: string } | { name: string }[] | null);
    const person = first(r.assignee as { full_name: string } | { full_name: string }[] | null);
    return {
      id: r.id as string,
      role_label: r.role_label as string | null,
      start_time: r.start_time as string,
      end_time: r.end_time as string,
      staffName: person?.full_name ?? 'Unassigned',
      departmentName: dept?.name ?? '—',
    };
  });

  return {
    shiftsThisWeek,
    deptCountThisWeek: deptIds.size,
    unfilledThisWeek,
    coveragePct,
    lastSyncLabel,
    lastSyncSub,
    hasSheetsMapping: mapRow != null,
    upcoming,
  };
}
