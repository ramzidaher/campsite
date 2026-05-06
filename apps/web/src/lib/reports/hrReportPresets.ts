import type { ReportDomain } from '@/lib/reports/catalog';

export type HrReportPresetId =
  | 'daily-shift-review'
  | 'shift-reports'
  | 'staff-reports'
  | 'time-entries-pay'
  | 'welfare-performance'
  | 'custom-builder';

export type HrReportPreset = {
  id: HrReportPresetId;
  /** Short label for the nav */
  label: string;
  /** Nav grouping */
  group: 'Shift & coverage' | 'Time & pay' | 'People' | 'Custom';
  description: string;
  suggestedReportName: string;
  domains: ReportDomain[];
  fields: string[];
  /** Optional deep link shown as secondary action */
  relatedHref?: string;
  relatedLabel?: string;
  /** Requires reports.manage for finance slice */
  requiresFinanceAccess?: boolean;
};

export const HR_REPORT_PRESETS: HrReportPreset[] = [
  {
    id: 'custom-builder',
    group: 'Custom',
    label: 'Custom Reports',
    description:
      'Start from scratch: choose HR and Finance domains, every available field, then visualize as table, chart, or summary.',
    suggestedReportName: 'Custom report',
    domains: ['hr'],
    fields: ['employee_name', 'employee_department', 'employee_role', 'employee_status'],
  },
  {
    id: 'daily-shift-review',
    group: 'Shift & coverage',
    label: 'Daily Shift Review',
    description:
      'Compare roster coverage with people on the groundnames, departments, and statuses side by side. Pair with live rota when you need to reconcile gaps.',
    suggestedReportName: 'Daily shift review',
    domains: ['hr'],
    fields: ['employee_name', 'employee_department', 'employee_role', 'employee_status'],
    relatedHref: '/rota',
    relatedLabel: 'Open rota',
  },
  {
    id: 'shift-reports',
    group: 'Shift & coverage',
    label: 'Shift Reports',
    description:
      'Aggregate workforce signals around shifts and attendance-oriented HR fields. Tune fields below for the exact columns you need.',
    suggestedReportName: 'Shift patterns',
    domains: ['hr'],
    fields: ['employee_name', 'employee_department', 'employee_role', 'absence_type', 'absence_days', 'employee_status'],
    relatedHref: '/rota',
    relatedLabel: 'Open schedule',
  },
  {
    id: 'staff-reports',
    group: 'Shift & coverage',
    label: 'Staff Reports',
    description:
      'Directory-style exports: who sits where, how long they have been with you, and lifecycle flags you choose.',
    suggestedReportName: 'Staff directory export',
    domains: ['hr'],
    fields: [
      'employee_name',
      'employee_department',
      'employee_role',
      'employee_status',
      'employee_start_date',
      'onboarding_status',
      'onboarding_days_since_start',
    ],
  },
  {
    id: 'time-entries-pay',
    group: 'Time & pay',
    label: 'Time Entries & Pay',
    description:
      'Timesheet weeks, hours, wagesheet status, and bank-change audit fieldseverything Finance needs in one configurable grid.',
    suggestedReportName: 'Time entries & pay',
    domains: ['hr', 'finance'],
    fields: [
      'employee_name',
      'employee_department',
      'timesheet_week_start',
      'timesheet_hours_total',
      'timesheet_status',
      'wagesheet_status',
      'bank_detail_change_status',
      'bank_detail_change_at',
    ],
    requiresFinanceAccess: true,
  },
  {
    id: 'welfare-performance',
    group: 'People',
    label: 'Welfare & Performance',
    description:
      'Absences, reviews, and 1:1 rhythm in one reportpick only the wellbeing and performance columns you want to review.',
    suggestedReportName: 'Welfare & performance',
    domains: ['hr'],
    fields: [
      'employee_name',
      'employee_department',
      'absence_type',
      'absence_days',
      'performance_review_status',
      'performance_overdue',
      'one_to_one_last_session',
      'one_to_one_overdue',
    ],
  },
];

export function presetById(id: HrReportPresetId): HrReportPreset | undefined {
  return HR_REPORT_PRESETS.find((p) => p.id === id);
}
