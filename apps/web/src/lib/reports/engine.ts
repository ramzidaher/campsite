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
    if (!scopedDepartmentId) {
      // Fail closed for scoped users when department context cannot be resolved.
      return [];
    }
  }

  const profilesQ = supabase
    .from('profiles')
    .select('id, full_name, role, status, created_at, department_id')
    .eq('org_id', scope.orgId)
    .eq('status', 'active');
  const profilesScoped = !scope.orgWideDataAccess && scopedDepartmentId
    ? profilesQ.eq('department_id', scopedDepartmentId)
    : profilesQ;

  const [profilesRes, tsRes, wrRes, taxRes, bankRes, leaveRes] = await Promise.all([
    profilesScoped,
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
    byUser.set(String(p.id), {
      employee_name: p.full_name ?? '',
      employee_role: p.role ?? '',
      employee_status: p.status ?? '',
      employee_start_date: p.created_at ?? null,
      employee_department: String(p.department_id ?? ''),
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

  return Array.from(byUser.values());
}

export async function runReport(configInput: unknown, scope: Scope, limit = 50) {
  const startedAt = Date.now();
  const config = normConfig(configInput);
  const quickFilters = normalizeQuickFilters(config.quickFilters ?? []);
  const allFilters = [...config.filters, ...quickFilters];
  const base = await loadBaseRows(scope);
  let rows = applyFilterRows(base, allFilters, config.filterMode);
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
