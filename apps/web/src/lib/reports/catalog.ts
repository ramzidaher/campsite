export type ReportDomain = 'hr' | 'finance';

export type ReportFieldDef = {
  key: string;
  label: string;
  domain: ReportDomain;
  category: string;
  type: 'text' | 'number' | 'date' | 'boolean';
  queryKey: string;
};

export const REPORT_FIELDS: ReportFieldDef[] = [
  // HR
  { key: 'employee_name', label: 'Employee name', domain: 'hr', category: 'Employee', type: 'text', queryKey: 'employee_name' },
  { key: 'employee_department', label: 'Department', domain: 'hr', category: 'Employee', type: 'text', queryKey: 'employee_department' },
  { key: 'employee_role', label: 'Role', domain: 'hr', category: 'Employee', type: 'text', queryKey: 'employee_role' },
  { key: 'employee_start_date', label: 'Start date', domain: 'hr', category: 'Employee', type: 'date', queryKey: 'employee_start_date' },
  { key: 'employee_status', label: 'Status', domain: 'hr', category: 'Employee', type: 'text', queryKey: 'employee_status' },
  { key: 'onboarding_status', label: 'Onboarding status', domain: 'hr', category: 'Onboarding', type: 'text', queryKey: 'onboarding_status' },
  { key: 'onboarding_days_since_start', label: 'Onboarding days since start', domain: 'hr', category: 'Onboarding', type: 'number', queryKey: 'onboarding_days_since_start' },
  { key: 'absence_type', label: 'Absence type', domain: 'hr', category: 'Absence', type: 'text', queryKey: 'absence_type' },
  { key: 'absence_days', label: 'Absence days', domain: 'hr', category: 'Absence', type: 'number', queryKey: 'absence_days' },
  { key: 'performance_review_status', label: 'Performance review status', domain: 'hr', category: 'Performance', type: 'text', queryKey: 'performance_review_status' },
  { key: 'performance_overdue', label: 'Performance overdue', domain: 'hr', category: 'Performance', type: 'boolean', queryKey: 'performance_overdue' },
  { key: 'one_to_one_last_session', label: '1:1 last session', domain: 'hr', category: 'One-to-one', type: 'date', queryKey: 'one_to_one_last_session' },
  { key: 'one_to_one_overdue', label: '1:1 overdue', domain: 'hr', category: 'One-to-one', type: 'boolean', queryKey: 'one_to_one_overdue' },
  // Finance
  { key: 'timesheet_week_start', label: 'Timesheet week start', domain: 'finance', category: 'Timesheets', type: 'date', queryKey: 'timesheet_week_start' },
  { key: 'timesheet_hours_total', label: 'Timesheet total hours', domain: 'finance', category: 'Timesheets', type: 'number', queryKey: 'timesheet_hours_total' },
  { key: 'timesheet_status', label: 'Timesheet status', domain: 'finance', category: 'Timesheets', type: 'text', queryKey: 'timesheet_status' },
  { key: 'wagesheet_status', label: 'Wagesheet status', domain: 'finance', category: 'Wagesheets', type: 'text', queryKey: 'wagesheet_status' },
  { key: 'tax_document_status', label: 'Tax document status', domain: 'finance', category: 'Tax documents', type: 'text', queryKey: 'tax_document_status' },
  { key: 'bank_detail_change_status', label: 'Bank detail change status', domain: 'finance', category: 'Bank details', type: 'text', queryKey: 'bank_detail_change_status' },
  { key: 'bank_detail_change_at', label: 'Bank detail changed at', domain: 'finance', category: 'Bank details', type: 'date', queryKey: 'bank_detail_change_at' },
];

export const REPORT_FIELD_BY_KEY = new Map(REPORT_FIELDS.map((f) => [f.key, f]));
