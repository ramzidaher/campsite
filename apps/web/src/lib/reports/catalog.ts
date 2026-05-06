export type ReportDomain = 'hr' | 'finance';

export type ReportFieldDef = {
  key: string;
  label: string;
  domain: ReportDomain;
  category: string;
  type: 'text' | 'number' | 'date' | 'boolean';
  queryKey: string;
  /** Origin table(s) for engineers / tooltips  optional */
  sourceTable?: string;
};

/** Column picker category order (groups can be omitted if empty). */
export const REPORT_CATEGORY_ORDER: string[] = [
  'Employee',
  'Contract & HR record',
  'Leave entitlements',
  'Rota & shifts',
  'Onboarding',
  'Absence',
  'Performance',
  'One-to-one',
  'Timesheets',
  'Wagesheets',
  'Tax documents',
  'Bank details',
];

export const REPORT_FIELDS: ReportFieldDef[] = [
  // HR  core employee (profiles)
  { key: 'employee_name', label: 'Employee name', domain: 'hr', category: 'Employee', type: 'text', queryKey: 'employee_name', sourceTable: 'profiles' },
  { key: 'employee_department', label: 'Department', domain: 'hr', category: 'Employee', type: 'text', queryKey: 'employee_department', sourceTable: 'profiles / departments' },
  { key: 'employee_role', label: 'Role', domain: 'hr', category: 'Employee', type: 'text', queryKey: 'employee_role', sourceTable: 'profiles.role' },
  { key: 'employee_start_date', label: 'Profile created at', domain: 'hr', category: 'Employee', type: 'date', queryKey: 'employee_start_date', sourceTable: 'profiles.created_at' },
  { key: 'employee_status', label: 'Status', domain: 'hr', category: 'Employee', type: 'text', queryKey: 'employee_status', sourceTable: 'profiles.status' },
  // HR  employee_hr_records (contract & employment)
  { key: 'hr_job_title', label: 'Job title', domain: 'hr', category: 'Contract & HR record', type: 'text', queryKey: 'hr_job_title', sourceTable: 'employee_hr_records.job_title' },
  { key: 'hr_grade_level', label: 'Grade level', domain: 'hr', category: 'Contract & HR record', type: 'text', queryKey: 'hr_grade_level', sourceTable: 'employee_hr_records.grade_level' },
  { key: 'hr_contract_type', label: 'Contract type', domain: 'hr', category: 'Contract & HR record', type: 'text', queryKey: 'hr_contract_type', sourceTable: 'employee_hr_records.contract_type' },
  { key: 'hr_employment_basis', label: 'Employment basis', domain: 'hr', category: 'Contract & HR record', type: 'text', queryKey: 'hr_employment_basis', sourceTable: 'employee_hr_records.employment_basis' },
  { key: 'hr_position_type', label: 'Position type', domain: 'hr', category: 'Contract & HR record', type: 'text', queryKey: 'hr_position_type', sourceTable: 'employee_hr_records.position_type' },
  { key: 'hr_pay_grade', label: 'Pay grade', domain: 'hr', category: 'Contract & HR record', type: 'text', queryKey: 'hr_pay_grade', sourceTable: 'employee_hr_records.pay_grade' },
  { key: 'hr_work_location', label: 'Work location', domain: 'hr', category: 'Contract & HR record', type: 'text', queryKey: 'hr_work_location', sourceTable: 'employee_hr_records.work_location' },
  { key: 'hr_fte', label: 'FTE', domain: 'hr', category: 'Contract & HR record', type: 'number', queryKey: 'hr_fte', sourceTable: 'employee_hr_records.fte' },
  { key: 'hr_weekly_hours', label: 'Weekly hours', domain: 'hr', category: 'Contract & HR record', type: 'number', queryKey: 'hr_weekly_hours', sourceTable: 'employee_hr_records.weekly_hours' },
  { key: 'hr_employment_start_date', label: 'Employment start date', domain: 'hr', category: 'Contract & HR record', type: 'date', queryKey: 'hr_employment_start_date', sourceTable: 'employee_hr_records.employment_start_date' },
  { key: 'hr_probation_end_date', label: 'Probation end date', domain: 'hr', category: 'Contract & HR record', type: 'date', queryKey: 'hr_probation_end_date', sourceTable: 'employee_hr_records.probation_end_date' },
  { key: 'hr_contract_start_date', label: 'Contract start date', domain: 'hr', category: 'Contract & HR record', type: 'date', queryKey: 'hr_contract_start_date', sourceTable: 'employee_hr_records.contract_start_date' },
  { key: 'hr_contract_end_date', label: 'Contract expiry', domain: 'hr', category: 'Contract & HR record', type: 'date', queryKey: 'hr_contract_end_date', sourceTable: 'employee_hr_records.contract_end_date' },
  { key: 'hr_contract_review_date', label: 'Contract review date', domain: 'hr', category: 'Contract & HR record', type: 'date', queryKey: 'hr_contract_review_date', sourceTable: 'employee_hr_records.contract_review_date' },
  { key: 'hr_notice_period_weeks', label: 'Notice period (weeks)', domain: 'hr', category: 'Contract & HR record', type: 'number', queryKey: 'hr_notice_period_weeks', sourceTable: 'employee_hr_records.notice_period_weeks' },
  { key: 'hr_department_start_date', label: 'Department start date', domain: 'hr', category: 'Contract & HR record', type: 'date', queryKey: 'hr_department_start_date', sourceTable: 'employee_hr_records.department_start_date' },
  { key: 'hr_continuous_employment_start_date', label: 'Continuous employment start', domain: 'hr', category: 'Contract & HR record', type: 'date', queryKey: 'hr_continuous_employment_start_date', sourceTable: 'employee_hr_records.continuous_employment_start_date' },
  { key: 'hr_annual_leave_exempt', label: 'Annual leave entitlement exempt', domain: 'hr', category: 'Contract & HR record', type: 'boolean', queryKey: 'hr_annual_leave_exempt', sourceTable: 'employee_hr_records.annual_leave_entitlement_exempt' },
  { key: 'hr_salary_band', label: 'Salary band', domain: 'hr', category: 'Contract & HR record', type: 'text', queryKey: 'hr_salary_band', sourceTable: 'employee_hr_records.salary_band' },
  // Leave  leave_allowances (multi-year summary + latest year snapshot)
  {
    key: 'leave_entitlements_summary',
    label: 'Holiday entitlements (all years)',
    domain: 'hr',
    category: 'Leave entitlements',
    type: 'text',
    queryKey: 'leave_entitlements_summary',
    sourceTable: 'leave_allowances',
  },
  {
    key: 'leave_annual_days_latest_year',
    label: 'Annual leave days (latest leave year row)',
    domain: 'hr',
    category: 'Leave entitlements',
    type: 'number',
    queryKey: 'leave_annual_days_latest_year',
    sourceTable: 'leave_allowances.annual_entitlement_days',
  },
  {
    key: 'leave_toil_days_latest_year',
    label: 'TOIL balance days (latest leave year row)',
    domain: 'hr',
    category: 'Leave entitlements',
    type: 'number',
    queryKey: 'leave_toil_days_latest_year',
    sourceTable: 'leave_allowances.toil_balance_days',
  },
  // Rota  rota_shifts (rolling 365 days)
  {
    key: 'rota_shifts_worked_count',
    label: 'Shifts worked (last 365 days, count)',
    domain: 'hr',
    category: 'Rota & shifts',
    type: 'number',
    queryKey: 'rota_shifts_worked_count',
    sourceTable: 'rota_shifts',
  },
  {
    key: 'rota_hours_worked_365d',
    label: 'Hours on rota shifts (last 365 days)',
    domain: 'hr',
    category: 'Rota & shifts',
    type: 'number',
    queryKey: 'rota_hours_worked_365d',
    sourceTable: 'rota_shifts (start_time → end_time)',
  },
  { key: 'onboarding_status', label: 'Onboarding status', domain: 'hr', category: 'Onboarding', type: 'text', queryKey: 'onboarding_status' },
  { key: 'onboarding_days_since_start', label: 'Onboarding days since start', domain: 'hr', category: 'Onboarding', type: 'number', queryKey: 'onboarding_days_since_start' },
  { key: 'absence_type', label: 'Absence type', domain: 'hr', category: 'Absence', type: 'text', queryKey: 'absence_type', sourceTable: 'leave_requests' },
  { key: 'absence_days', label: 'Absence days', domain: 'hr', category: 'Absence', type: 'number', queryKey: 'absence_days', sourceTable: 'leave_requests' },
  { key: 'performance_review_status', label: 'Performance review status', domain: 'hr', category: 'Performance', type: 'text', queryKey: 'performance_review_status' },
  { key: 'performance_overdue', label: 'Performance overdue', domain: 'hr', category: 'Performance', type: 'boolean', queryKey: 'performance_overdue' },
  { key: 'one_to_one_last_session', label: '1:1 last session', domain: 'hr', category: 'One-to-one', type: 'date', queryKey: 'one_to_one_last_session' },
  { key: 'one_to_one_overdue', label: '1:1 overdue', domain: 'hr', category: 'One-to-one', type: 'boolean', queryKey: 'one_to_one_overdue' },
  // Finance
  { key: 'timesheet_week_start', label: 'Timesheet week start', domain: 'finance', category: 'Timesheets', type: 'date', queryKey: 'timesheet_week_start', sourceTable: 'weekly_timesheets' },
  { key: 'timesheet_hours_total', label: 'Timesheet total hours', domain: 'finance', category: 'Timesheets', type: 'number', queryKey: 'timesheet_hours_total', sourceTable: 'weekly_timesheets' },
  { key: 'timesheet_status', label: 'Timesheet status', domain: 'finance', category: 'Timesheets', type: 'text', queryKey: 'timesheet_status', sourceTable: 'weekly_timesheets' },
  { key: 'wagesheet_status', label: 'Wagesheet status', domain: 'finance', category: 'Wagesheets', type: 'text', queryKey: 'wagesheet_status', sourceTable: 'payroll_wagesheet_reviews' },
  { key: 'tax_document_status', label: 'Tax document status', domain: 'finance', category: 'Tax documents', type: 'text', queryKey: 'tax_document_status', sourceTable: 'employee_tax_documents' },
  { key: 'bank_detail_change_status', label: 'Bank detail change status', domain: 'finance', category: 'Bank details', type: 'text', queryKey: 'bank_detail_change_status', sourceTable: 'employee_bank_detail_events' },
  { key: 'bank_detail_change_at', label: 'Bank detail changed at', domain: 'finance', category: 'Bank details', type: 'date', queryKey: 'bank_detail_change_at', sourceTable: 'employee_bank_detail_events' },
];

export const REPORT_FIELD_BY_KEY = new Map(REPORT_FIELDS.map((f) => [f.key, f]));
