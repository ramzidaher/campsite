import { createClient } from '@/lib/supabase/server';
import { REPORT_FIELD_BY_KEY } from './catalog';
import type { ReportConfig, ReportFilter } from './types';

type Scope = {
  orgId: string;
  userId: string;
  departmentId: string | null;
  orgWideDataAccess: boolean;
};

function normConfig(input: unknown): ReportConfig {
  const raw = (input ?? {}) as Partial<ReportConfig>;
  return {
    domains: Array.isArray(raw.domains) ? raw.domains.filter((d): d is 'hr' | 'finance' => d === 'hr' || d === 'finance') : ['hr'],
    fields: Array.isArray(raw.fields) ? raw.fields.map(String) : [],
    filters: Array.isArray(raw.filters) ? raw.filters : [],
    filterMode: raw.filterMode === 'or' ? 'or' : 'and',
    sort: Array.isArray(raw.sort) ? raw.sort.map((s) => ({ field: String(s.field), direction: s.direction === 'desc' ? 'desc' : 'asc' })) : [],
    groupBy: Array.isArray(raw.groupBy) ? raw.groupBy.map(String) : [],
    quickFilters: Array.isArray(raw.quickFilters) ? raw.quickFilters.map(String) : [],
    departmentIds: Array.isArray(raw.departmentIds) ? raw.departmentIds.map(String).filter(Boolean) : [],
  };
}

function normalizeQuickFilters(filters: string[]) {
  return filters
    .map((entry) => String(entry).trim().toLowerCase())
    .filter(Boolean)
    .flatMap((entry): ReportFilter[] => {
      if (entry === 'active_only') return [{ field: 'employee_status', op: 'equals', value: 'active' }];
      if (entry === 'timesheet_pending') return [{ field: 'timesheet_status', op: 'equals', value: 'pending' }];
      return [];
    });
}

function applyFilterRows(rows: Record<string, unknown>[], filters: ReportFilter[], mode: 'and' | 'or') {
  if (!filters.length) return rows;
  return rows.filter((row) => {
    const checks = filters.map((f) => {
      const field = REPORT_FIELD_BY_KEY.get(f.field);
      if (!field) return true;
      const val = row[field.queryKey];
      if (f.op === 'is_empty') return val === null || val === undefined || String(val) === '';
      if (val === null || val === undefined) return false;
      const s = String(val).toLowerCase();
      const q = String(f.value ?? '').toLowerCase();
      switch (f.op) {
        case 'equals':
          return s === q;
        case 'not_equals':
          return s !== q;
        case 'contains':
          return s.includes(q);
        case 'before':
          return new Date(String(val)).getTime() < new Date(String(f.value ?? '')).getTime();
        case 'after':
          return new Date(String(val)).getTime() > new Date(String(f.value ?? '')).getTime();
        case 'between': {
          const t = new Date(String(val)).getTime();
          return t >= new Date(String(f.value ?? '')).getTime() && t <= new Date(String(f.valueTo ?? '')).getTime();
        }
        case 'greater_than':
          return Number(val) > Number(f.value ?? 0);
        case 'less_than':
          return Number(val) < Number(f.value ?? 0);
        default:
          return true;
      }
    });
    return mode === 'or' ? checks.some(Boolean) : checks.every(Boolean);
  });
}

async function loadBaseRows(scope: Scope): Promise<Record<string, unknown>[]> {
  const supabase = await createClient();
  let scopedDepartmentId = scope.departmentId;
  if (!scope.orgWideDataAccess && !scopedDepartmentId) {
    const { data: me } = await supabase
      .from('profiles')
      .select('department_id')
      .eq('id', scope.userId)
      .eq('org_id', scope.orgId)
      .maybeSingle();
    scopedDepartmentId = me?.department_id ? String(me.department_id) : null;
  }
  // Many accounts have `user_departments` but null `profiles.department_id`; use first org dept membership.
  if (!scope.orgWideDataAccess && !scopedDepartmentId) {
    const { data: uds } = await supabase.from('user_departments').select('dept_id').eq('user_id', scope.userId);
    const candidates = (uds ?? []).map((r) => r.dept_id).filter(Boolean) as string[];
    if (candidates.length) {
      const { data: inOrgDept } = await supabase
        .from('departments')
        .select('id')
        .eq('org_id', scope.orgId)
        .in('id', candidates)
        .limit(1)
        .maybeSingle();
      if (inOrgDept?.id) scopedDepartmentId = String(inOrgDept.id);
    }
  }
  if (!scope.orgWideDataAccess && !scopedDepartmentId) {
    return [];
  }

  // Scoped users: include everyone in the department via `user_departments` OR `profiles.department_id`
  // (many members only appear in `user_departments`, so filtering on profile.department_id alone yields 0 rows).
  let profilesQuery = supabase
    .from('profiles')
    .select('id, full_name, role, status, created_at, department_id')
    .eq('org_id', scope.orgId)
    .eq('status', 'active');

  if (!scope.orgWideDataAccess && scopedDepartmentId) {
    const [{ data: udRows }, { data: profDirect }] = await Promise.all([
      supabase.from('user_departments').select('user_id').eq('dept_id', scopedDepartmentId),
      supabase
        .from('profiles')
        .select('id')
        .eq('org_id', scope.orgId)
        .eq('status', 'active')
        .eq('department_id', scopedDepartmentId),
    ]);
    const inScope = new Set<string>();
    for (const r of udRows ?? []) inScope.add(String(r.user_id));
    for (const r of profDirect ?? []) inScope.add(String(r.id));
    const scopeIds = Array.from(inScope);
    if (scopeIds.length === 0) return [];
    profilesQuery = profilesQuery.in('id', scopeIds);
  }

  const [profilesRes, tsRes, wrRes, taxRes, bankRes, leaveRes] = await Promise.all([
    profilesQuery,
    supabase.from('weekly_timesheets').select('user_id, week_start_date, total_hours, status').eq('org_id', scope.orgId).limit(5000),
    supabase.from('payroll_wagesheet_reviews').select('user_id, week_start_date, review_status').eq('org_id', scope.orgId).limit(5000),
    supabase.from('employee_tax_documents').select('user_id, status').eq('org_id', scope.orgId).limit(5000),
    supabase.from('employee_bank_detail_events').select('user_id, event_type, created_at').eq('org_id', scope.orgId).eq('event_type', 'changed').limit(5000),
    supabase.from('leave_requests').select('user_id, leave_type, start_date, end_date, status').eq('org_id', scope.orgId).limit(5000),
  ]);

  const profiles = profilesRes.data ?? [];
  const timesheets = tsRes.data ?? [];
  const wagesheets = wrRes.data ?? [];
  const taxes = taxRes.data ?? [];
  const bankEvents = bankRes.data ?? [];
  const absences = leaveRes.data ?? [];

  const byUser = new Map<string, Record<string, unknown>>();
  for (const p of profiles) {
    let empDept = String(p.department_id ?? '');
    if (!empDept && !scope.orgWideDataAccess && scopedDepartmentId) {
      empDept = scopedDepartmentId;
    }
    byUser.set(String(p.id), {
      employee_name: p.full_name ?? '',
      employee_role: p.role ?? '',
      employee_status: p.status ?? '',
      employee_start_date: p.created_at ?? null,
      employee_department: empDept,
      onboarding_status: 'pending',
      onboarding_days_since_start: p.created_at ? Math.max(0, Math.floor((Date.now() - new Date(String(p.created_at)).getTime()) / 86400000)) : null,
      absence_type: '',
      absence_days: 0,
      performance_review_status: '',
      performance_overdue: false,
      one_to_one_last_session: null,
      one_to_one_overdue: false,
      timesheet_week_start: null,
      timesheet_hours_total: 0,
      timesheet_status: '',
      wagesheet_status: '',
      tax_document_status: '',
      bank_detail_change_status: '',
      bank_detail_change_at: null,
      hr_job_title: null,
      hr_grade_level: null,
      hr_contract_type: null,
      hr_employment_basis: null,
      hr_position_type: null,
      hr_pay_grade: null,
      hr_work_location: null,
      hr_fte: null,
      hr_weekly_hours: null,
      hr_employment_start_date: null,
      hr_probation_end_date: null,
      hr_contract_start_date: null,
      hr_contract_end_date: null,
      hr_contract_review_date: null,
      hr_notice_period_weeks: null,
      hr_department_start_date: null,
      hr_continuous_employment_start_date: null,
      hr_annual_leave_exempt: null,
      hr_salary_band: null,
      leave_entitlements_summary: '',
      leave_annual_days_latest_year: null,
      leave_toil_days_latest_year: null,
      rota_shifts_worked_count: 0,
      rota_hours_worked_365d: 0,
    });
  }

  for (const t of timesheets) {
    const key = String(t.user_id);
    const row = byUser.get(key);
    if (!row) continue;
    row.timesheet_week_start = t.week_start_date ?? row.timesheet_week_start;
    row.timesheet_hours_total = Number(t.total_hours ?? row.timesheet_hours_total ?? 0);
    row.timesheet_status = t.status ?? row.timesheet_status;
  }
  for (const w of wagesheets) {
    const row = byUser.get(String(w.user_id));
    if (!row) continue;
    row.wagesheet_status = w.review_status ?? row.wagesheet_status;
  }
  for (const t of taxes) {
    const row = byUser.get(String(t.user_id));
    if (!row) continue;
    row.tax_document_status = t.status ?? row.tax_document_status;
  }
  for (const b of bankEvents) {
    const row = byUser.get(String(b.user_id));
    if (!row) continue;
    row.bank_detail_change_status = b.event_type ?? 'changed';
    row.bank_detail_change_at = b.created_at ?? row.bank_detail_change_at;
  }
  for (const l of absences) {
    const row = byUser.get(String(l.user_id));
    if (!row) continue;
    row.absence_type = l.leave_type ?? row.absence_type;
    if (l.start_date && l.end_date) {
      const days = Math.max(1, Math.ceil((new Date(String(l.end_date)).getTime() - new Date(String(l.start_date)).getTime()) / 86400000) + 1);
      row.absence_days = Number(row.absence_days ?? 0) + days;
    }
  }

  const profileIds = Array.from(byUser.keys());
  const chunkSize = 120;
  const since365 = new Date(Date.now() - 365 * 86400000).toISOString();

  type HrRow = {
    user_id: string;
    job_title?: string | null;
    grade_level?: string | null;
    contract_type?: string | null;
    employment_basis?: string | null;
    position_type?: string | null;
    pay_grade?: string | null;
    work_location?: string | null;
    fte?: number | null;
    weekly_hours?: number | null;
    employment_start_date?: string | null;
    probation_end_date?: string | null;
    contract_start_date?: string | null;
    contract_end_date?: string | null;
    contract_review_date?: string | null;
    notice_period_weeks?: number | null;
    department_start_date?: string | null;
    continuous_employment_start_date?: string | null;
    annual_leave_entitlement_exempt?: boolean | null;
    salary_band?: string | null;
  };

  const hrRows: HrRow[] = [];
  for (let i = 0; i < profileIds.length; i += chunkSize) {
    const slice = profileIds.slice(i, i + chunkSize);
    const { data } = await supabase
      .from('employee_hr_records')
      .select(
        'user_id, job_title, grade_level, contract_type, employment_basis, position_type, pay_grade, work_location, fte, weekly_hours, employment_start_date, probation_end_date, contract_start_date, contract_end_date, contract_review_date, notice_period_weeks, department_start_date, continuous_employment_start_date, annual_leave_entitlement_exempt, salary_band'
      )
      .eq('org_id', scope.orgId)
      .in('user_id', slice);
    hrRows.push(...((data ?? []) as HrRow[]));
  }
  for (const h of hrRows) {
    const row = byUser.get(String(h.user_id));
    if (!row) continue;
    row.hr_job_title = h.job_title ?? null;
    row.hr_grade_level = h.grade_level ?? null;
    row.hr_contract_type = h.contract_type ?? null;
    row.hr_employment_basis = h.employment_basis ?? null;
    row.hr_position_type = h.position_type ?? null;
    row.hr_pay_grade = h.pay_grade ?? null;
    row.hr_work_location = h.work_location ?? null;
    row.hr_fte = h.fte != null ? Number(h.fte) : null;
    row.hr_weekly_hours = h.weekly_hours != null ? Number(h.weekly_hours) : null;
    row.hr_employment_start_date = h.employment_start_date ?? null;
    row.hr_probation_end_date = h.probation_end_date ?? null;
    row.hr_contract_start_date = h.contract_start_date ?? null;
    row.hr_contract_end_date = h.contract_end_date ?? null;
    row.hr_contract_review_date = h.contract_review_date ?? null;
    row.hr_notice_period_weeks = h.notice_period_weeks != null ? Number(h.notice_period_weeks) : null;
    row.hr_department_start_date = h.department_start_date ?? null;
    row.hr_continuous_employment_start_date = h.continuous_employment_start_date ?? null;
    row.hr_annual_leave_exempt = h.annual_leave_entitlement_exempt ?? null;
    row.hr_salary_band = h.salary_band ?? null;
  }

  type LeaveAllowRow = {
    user_id: string;
    leave_year: string;
    annual_entitlement_days?: number | null;
    toil_balance_days?: number | null;
  };
  const leaveRows: LeaveAllowRow[] = [];
  for (let i = 0; i < profileIds.length; i += chunkSize) {
    const slice = profileIds.slice(i, i + chunkSize);
    const { data } = await supabase
      .from('leave_allowances')
      .select('user_id, leave_year, annual_entitlement_days, toil_balance_days')
      .eq('org_id', scope.orgId)
      .in('user_id', slice);
    leaveRows.push(...((data ?? []) as LeaveAllowRow[]));
  }
  const leaveByUser = new Map<string, LeaveAllowRow[]>();
  for (const lr of leaveRows) {
    const uid = String(lr.user_id);
    const arr = leaveByUser.get(uid) ?? [];
    arr.push(lr);
    leaveByUser.set(uid, arr);
  }
  for (const [uid, rows] of leaveByUser) {
    const row = byUser.get(uid);
    if (!row) continue;
    const sorted = [...rows].sort((a, b) => String(b.leave_year).localeCompare(String(a.leave_year)));
    row.leave_entitlements_summary = sorted
      .map(
        (x) =>
          `${x.leave_year}: annual ${Number(x.annual_entitlement_days ?? 0)}d, TOIL ${Number(x.toil_balance_days ?? 0)}d`
      )
      .join('; ');
    const latest = sorted[0];
    if (latest) {
      row.leave_annual_days_latest_year = Number(latest.annual_entitlement_days ?? 0);
      row.leave_toil_days_latest_year = Number(latest.toil_balance_days ?? 0);
    }
  }

  type RotaRow = { user_id: string; start_time: string; end_time: string };
  const rotaRows: RotaRow[] = [];
  for (let i = 0; i < profileIds.length; i += chunkSize) {
    const slice = profileIds.slice(i, i + chunkSize);
    const { data } = await supabase
      .from('rota_shifts')
      .select('user_id, start_time, end_time')
      .eq('org_id', scope.orgId)
      .in('user_id', slice)
      .gte('start_time', since365)
      .limit(15000);
    rotaRows.push(...((data ?? []) as RotaRow[]));
  }
  const shiftCount = new Map<string, number>();
  const shiftHours = new Map<string, number>();
  for (const s of rotaRows) {
    const uid = String(s.user_id);
    shiftCount.set(uid, (shiftCount.get(uid) ?? 0) + 1);
    const ms = new Date(String(s.end_time)).getTime() - new Date(String(s.start_time)).getTime();
    const hrs = ms > 0 ? ms / 3600000 : 0;
    shiftHours.set(uid, (shiftHours.get(uid) ?? 0) + hrs);
  }
  for (const uid of profileIds) {
    const row = byUser.get(uid);
    if (!row) continue;
    row.rota_shifts_worked_count = shiftCount.get(uid) ?? 0;
    row.rota_hours_worked_365d = Math.round((shiftHours.get(uid) ?? 0) * 100) / 100;
  }

  return Array.from(byUser.values());
}

export async function runReport(configInput: unknown, scope: Scope, limit = 50) {
  const startedAt = Date.now();
  const config = normConfig(configInput);
  const quickFilters = normalizeQuickFilters(config.quickFilters ?? []);
  const allFilters = [...config.filters, ...quickFilters];
  const base = await loadBaseRows(scope);
  let rows = applyFilterRows(base, allFilters, config.filterMode);
  const deptKey = REPORT_FIELD_BY_KEY.get('employee_department')?.queryKey ?? 'employee_department';
  if (config.departmentIds?.length) {
    const allow = new Set(config.departmentIds);
    rows = rows.filter((r) => allow.has(String(r[deptKey] ?? '')));
  }
  if (config.sort?.length) {
    const [first] = config.sort;
    const field = REPORT_FIELD_BY_KEY.get(first.field);
    if (field) {
      rows = rows.sort((a, b) => {
        const av = a[field.queryKey];
        const bv = b[field.queryKey];
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        if (first.direction === 'desc') return String(bv).localeCompare(String(av));
        return String(av).localeCompare(String(bv));
      });
    }
  }

  const fields = config.fields.filter((k) => REPORT_FIELD_BY_KEY.has(k));
  const projected = rows.map((r) => {
    if (!fields.length) return r;
    const out: Record<string, unknown> = {};
    for (const f of fields) {
      const def = REPORT_FIELD_BY_KEY.get(f);
      if (!def) continue;
      out[f] = r[def.queryKey];
    }
    return out;
  });

  return {
    totalRows: projected.length,
    previewRows: projected.slice(0, limit),
    diagnostics: {
      durationMs: Date.now() - startedAt,
      baseRowCount: base.length,
      filteredRowCount: rows.length,
      appliedFilterCount: allFilters.length,
      fieldCount: fields.length,
      noDataReason:
        projected.length > 0
          ? null
          : base.length === 0
          ? 'no_base_rows_in_scope'
          : allFilters.length > 0
          ? 'filters_removed_all_rows'
          : 'projection_or_scope_empty',
    },
  };
}
