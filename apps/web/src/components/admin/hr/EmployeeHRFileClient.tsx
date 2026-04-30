'use client';

import { invalidateClientCaches } from '@/lib/cache/clientInvalidate';
import { createClient } from '@/lib/supabase/client';
import { DependantsEditorClient, type DependantRow } from '@/components/hr/DependantsEditorClient';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { EmployeeRecordHeroActionMenu } from '@/components/admin/hr/EmployeeRecordHeroActionMenu';
import { getProfileInitials } from '@/lib/names';

const MIN_PENDING_MS = 450;
const BRADFORD_ALERT_THRESHOLD = 200;
const DOC_MAX_BYTES = 20 * 1024 * 1024;
const HR_DOC_BUCKET = 'employee-hr-documents';
const EMPLOYEE_PHOTO_BUCKET = 'employee-photos';
const EMPLOYEE_ID_BUCKET = 'employee-id-documents';

function safeFileSegment(name: string): string {
  const base = name.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '');
  return base.slice(0, 180) || 'file';
}

function isAllowedHrDocMime(mime: string, category: string): boolean {
  const m = mime.toLowerCase().split(';')[0]?.trim() ?? '';
  if (category === 'employee_photo') return m.startsWith('image/');
  if (category === 'id_document') return m === 'application/pdf' || m.startsWith('image/');
  if (m === 'application/pdf') return true;
  if (m.startsWith('image/')) return true;
  if (m === 'application/msword') return true;
  if (m === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return true;
  if (m === 'application/vnd.ms-excel') return true;
  if (m === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') return true;
  return false;
}

function categoryLabel(key: string): string {
  switch (key) {
    case 'right_to_work':
      return 'Right to work';
    case 'passport':
      return 'Passport / ID';
    case 'contract':
      return 'Contract';
    case 'signed_other':
      return 'Signed document';
    case 'other':
      return 'Other';
    case 'employee_photo':
      return 'Employee photo';
    case 'id_document':
      return 'ID document';
    default:
      return key;
  }
}

function formatFileSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDateStable(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  const day = String(d.getUTCDate()).padStart(2, '0');
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const year = d.getUTCFullYear();
  return `${day}/${month}/${year}`;
}

function formatDateTimeStable(value: string): string {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  const day = String(d.getUTCDate()).padStart(2, '0');
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const year = d.getUTCFullYear();
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} ${hh}:${mm} UTC`;
}

async function withMinimumDelay<T>(promise: PromiseLike<T>) {
  const [result] = await Promise.all([
    promise,
    new Promise((resolve) => setTimeout(resolve, MIN_PENDING_MS)),
  ]);
  return result;
}

type Employee = {
  user_id: string;
  full_name: string;
  preferred_name?: string | null;
  display_name?: string | null;
  email: string | null;
  status: string;
  avatar_url: string | null;
  role: string;
  reports_to_user_id: string | null;
  reports_to_name: string | null;
  department_names: string[];
  hr_record_id: string | null;
  job_title: string | null;
  grade_level: string | null;
  contract_type: string | null;
  salary_band: string | null;
  fte: number | null;
  work_location: string | null;
  employment_start_date: string | null;
  probation_end_date: string | null;
  notice_period_weeks: number | null;
  hired_from_application_id: string | null;
  notes: string | null;
  record_created_at: string | null;
  record_updated_at: string | null;
  position_type?: string | null;
  pay_grade?: string | null;
  employment_basis?: string | null;
  weekly_hours?: number | null;
  positions_count?: number | null;
  budget_amount?: number | null;
  budget_currency?: string | null;
  department_start_date?: string | null;
  continuous_employment_start_date?: string | null;
  custom_fields?: Record<string, unknown> | null;
  length_of_service_years?: number | null;
  length_of_service_months?: number | null;
  contract_start_date?: string | null;
  contract_end_date?: string | null;
  contract_signed_on?: string | null;
  contract_document_url?: string | null;
  contract_review_date?: string | null;
  home_address_line1?: string | null;
  home_address_line2?: string | null;
  home_city?: string | null;
  home_county?: string | null;
  home_postcode?: string | null;
  home_country?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_relationship?: string | null;
  emergency_contact_phone?: string | null;
  emergency_contact_email?: string | null;
  rtw_status?: string | null;
  rtw_checked_on?: string | null;
  rtw_expiry_date?: string | null;
  rtw_check_method?: string | null;
  rtw_document_url?: string | null;
  visa_type?: string | null;
  pay_frequency?: string | null;
  contracted_days_per_week?: number | null;
  average_weekly_earnings_gbp?: number | null;
  timesheet_clock_enabled?: boolean | null;
  hourly_pay_gbp?: number | null;
  /** When true, person has no paid annual leave (pro-rata and org defaults yield 0). */
  annual_leave_entitlement_exempt?: boolean | null;
  probation_check_completed_at?: string | null;
  probation_check_completed_by?: string | null;
};

type AuditEvent = {
  id: string;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
  changer_name: string;
};

type HrEvidenceDoc = {
  id: string;
  org_id: string;
  user_id: string;
  category: string;
  document_kind: string;
  bucket_id: string;
  custom_category_id: string | null;
  custom_category_name: string | null;
  label: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  byte_size: number;
  uploaded_by: string;
  created_at: string;
  id_document_type: string | null;
  id_number_last4: string | null;
  expires_on: string | null;
  verification_status: string | null;
  is_current: boolean;
  uploader_name: string;
};

type CustomDocumentCategory = {
  id: string;
  name: string;
  document_kind_scope: string;
};

function contractLabel(ct: string) {
  switch (ct) {
    case 'full_time':
      return 'Full-time';
    case 'part_time':
      return 'Part-time';
    case 'contractor':
      return 'Contractor';
    case 'zero_hours':
      return 'Zero hours';
    default:
      return ct;
  }
}

function locationLabel(wl: string) {
  switch (wl) {
    case 'office':
      return 'Office';
    case 'remote':
      return 'Remote';
    case 'hybrid':
      return 'Hybrid';
    default:
      return wl;
  }
}

function payFrequencyLabel(pf: string) {
  switch (pf) {
    case 'weekly':
      return 'Weekly';
    case 'monthly':
      return 'Monthly';
    case 'four_weekly':
      return 'Four-weekly';
    default:
      return pf || '—';
  }
}

function fieldLabel(f: string) {
  const map: Record<string, string> = {
    record: 'Record',
    job_title: 'Job title',
    grade_level: 'Grade',
    contract_type: 'Contract type',
    salary_band: 'Salary band',
    fte: 'FTE',
    work_location: 'Work location',
    employment_start_date: 'Start date',
    probation_end_date: 'Probation end',
    notice_period_weeks: 'Notice period',
    hired_from_application_id: 'Linked application',
    notes: 'Notes',
    position_type: 'Position type',
    pay_grade: 'Pay grade',
    employment_basis: 'Employment basis',
    weekly_hours: 'Weekly hours',
    positions_count: 'Positions count',
    budget_amount: 'Budget amount',
    budget_currency: 'Budget currency',
    department_start_date: 'Department start date',
    continuous_employment_start_date: 'Continuous employment start',
    custom_fields: 'Custom fields',
    contract_start_date: 'Contract start date',
    contract_end_date: 'Contract end date',
    contract_signed_on: 'Contract signed on',
    contract_document_url: 'Contract document URL',
    contract_review_date: 'Contract review date',
    home_address_line1: 'Home address line 1',
    home_address_line2: 'Home address line 2',
    home_city: 'Home city',
    home_county: 'Home county',
    home_postcode: 'Home postcode',
    home_country: 'Home country',
    emergency_contact_name: 'Emergency contact name',
    emergency_contact_relationship: 'Emergency contact relationship',
    emergency_contact_phone: 'Emergency contact phone',
    emergency_contact_email: 'Emergency contact email',
    rtw_status: 'Right-to-work status',
    rtw_checked_on: 'Right-to-work checked on',
    rtw_expiry_date: 'Right-to-work expiry date',
    rtw_check_method: 'Right-to-work check method',
    rtw_document_url: 'Right-to-work document URL',
    visa_type: 'Visa type',
    pay_frequency: 'Pay frequency',
    contracted_days_per_week: 'Contracted days per week',
    average_weekly_earnings_gbp: 'Average weekly earnings (AWE)',
    annual_leave_entitlement_exempt: 'No paid annual leave entitlement',
    probation_check_completed_at: 'Probation check completed',
    probation_check_completed_by: 'Probation check recorded by (user id)',
  };
  return map[f] ?? f;
}

type CustomFieldRow = { key: string; value: string };

function customFieldRowsFromEmployee(cf: unknown): CustomFieldRow[] {
  if (cf && typeof cf === 'object' && !Array.isArray(cf)) {
    const entries = Object.entries(cf as Record<string, unknown>);
    if (entries.length === 0) return [{ key: '', value: '' }];
    return entries.map(([k, v]) => ({ key: k, value: v == null ? '' : String(v) }));
  }
  return [{ key: '', value: '' }];
}

function customFieldsToRecord(rows: CustomFieldRow[]): Record<string, string> {
  const o: Record<string, string> = {};
  for (const r of rows) {
    const k = r.key.trim();
    if (k) o[k] = r.value.trim();
  }
  return o;
}

function fmt(v: string | null) {
  if (!v || v === 'null') return '—';
  if (v === 'created') return 'Record created';
  return v;
}

function probationAlertLevel(
  end: string | null,
  completedAt: string | null,
  today: string
): 'due_soon' | 'overdue' | 'critical' | null {
  if (!end || completedAt) return null;
  const endD = new Date(`${end}T12:00:00`);
  const t = new Date(`${today}T12:00:00`);
  const startPrompt = new Date(endD);
  startPrompt.setDate(startPrompt.getDate() - 30);
  if (t < startPrompt) return null;
  const overdue7 = new Date(endD);
  overdue7.setDate(overdue7.getDate() + 7);
  if (t > overdue7) return 'critical';
  if (t > endD) return 'overdue';
  return 'due_soon';
}

function daysUntilDate(value: string | null, today: string): number | null {
  if (!value) return null;
  const target = new Date(`${value}T12:00:00`);
  const base = new Date(`${today}T12:00:00`);
  if (Number.isNaN(target.getTime()) || Number.isNaN(base.getTime())) return null;
  return Math.round((target.getTime() - base.getTime()) / 86_400_000);
}

type Tab =
  | 'overview'
  | 'job'
  | 'leave'
  | 'documents'
  | 'emergency'
  | 'payroll'
  | 'tax'
  | 'history'
  | 'cases'
  | 'medical'
  | 'custom'
  | 'audit';

type OverviewWarning = {
  id: string;
  title: string;
  detail: string;
  tone: 'danger' | 'warning' | 'info';
};

type TabBadgeTone = 'default' | 'warning' | 'danger' | 'info' | 'success';

type TabBadge = {
  text: string;
  tone?: TabBadgeTone;
};

function hrRecordTabClass(active: boolean) {
  const base =
    'inline-flex items-center rounded-lg border px-3 py-1.5 text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--org-brand-primary,#0f6e56)] focus-visible:ring-offset-2';
  return active
    ? `${base} border-transparent bg-[var(--org-brand-primary,#0f6e56)] text-white`
    : `${base} border-transparent text-[#6b6b6b] hover:border-[color-mix(in_oklab,var(--org-brand-primary,#0f6e56)_22%,#e8e8e8)] hover:bg-[color-mix(in_oklab,var(--org-brand-primary,#0f6e56)_6%,#faf9f6)]`;
}

export function EmployeeHRFileClient({
  orgId,
  currentUserId,
  canManage,
  canManageEmployeePhotos,
  canViewEmployeePhotos,
  canManageIdDocuments,
  canViewIdDocuments,
  customCategories,
  canMarkProbationCheck,
  canViewGrading,
  employee,
  auditEvents,
  leaveAllowance,
  leaveEntitlementYearLabel,
  absenceScore,
  showAbsenceReportingLink = false,
  applications,
  initialDocuments,
  initialDependants,
  recordExport,
  payrollPanel,
  taxPanel,
  historyPanel,
  casesPanel,
  medicalPanel,
  customFieldsPanel,
  overviewWarnings = [],
  tabBadges = {},
}: {
  orgId: string;
  currentUserId: string;
  canManage: boolean;
  canManageEmployeePhotos: boolean;
  canViewEmployeePhotos: boolean;
  canManageIdDocuments: boolean;
  canViewIdDocuments: boolean;
  customCategories: CustomDocumentCategory[];
  /** HR or line manager — can record probation review completion. */
  canMarkProbationCheck: boolean;
  canViewGrading: boolean;
  employee: Employee;
  auditEvents: AuditEvent[];
  leaveAllowance: { annual_entitlement_days: number; toil_balance_days: number } | null;
  /** Leave year key (YYYY) for entitlement row / heading — matches org leave-year settings. */
  leaveEntitlementYearLabel: string;
  absenceScore: { spell_count: number; total_days: number; bradford_score: number } | null;
  /** Link to org / team Bradford report (HR and managers with leave visibility). */
  showAbsenceReportingLink?: boolean;
  applications: { id: string; candidate_name: string; job_listing_id: string }[];
  initialDocuments: HrEvidenceDoc[];
  initialDependants: DependantRow[];
  /** Export permissions for hero action menu (CSV / PDF / sensitive). */
  recordExport: { canCsv: boolean; canPdf: boolean; canSensitive: boolean };
  payrollPanel?: ReactNode;
  taxPanel?: ReactNode;
  historyPanel?: ReactNode;
  casesPanel?: ReactNode;
  medicalPanel?: ReactNode;
  customFieldsPanel?: ReactNode;
  overviewWarnings?: OverviewWarning[];
  tabBadges?: Partial<Record<Tab, TabBadge>>;
}) {
  const supabase = useMemo(() => createClient(), []);
  const invalidateHrRecordCaches = useCallback(async () => {
    await invalidateClientCaches({ scopes: ['hr-records'] });
  }, []);
  const router = useRouter();

  const [documents, setDocuments] = useState(initialDocuments);
  const [docCategory, setDocCategory] = useState('right_to_work');
  const [docLabel, setDocLabel] = useState('');
  const [selectedCustomCategoryId, setSelectedCustomCategoryId] = useState('');
  const [newCustomCategoryName, setNewCustomCategoryName] = useState('');
  const [idDocumentType, setIdDocumentType] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [idExpiryDate, setIdExpiryDate] = useState('');
  const [docBusy, setDocBusy] = useState(false);

  useEffect(() => {
    setDocuments(initialDocuments);
  }, [initialDocuments]);

  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [probationBusy, setProbationBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // form state — initialised from existing record or defaults
  const [jobTitle, setJobTitle] = useState(employee.job_title ?? '');
  const [gradeLevel, setGradeLevel] = useState(employee.grade_level ?? '');
  const [contractType, setContractType] = useState(employee.contract_type ?? 'full_time');
  const [salaryBand, setSalaryBand] = useState(employee.salary_band ?? '');
  const [fte, setFte] = useState(String(employee.fte ?? 1));
  const [workLocation, setWorkLocation] = useState(employee.work_location ?? 'office');
  const [startDate, setStartDate] = useState(employee.employment_start_date ?? '');
  const [probationEnd, setProbationEnd] = useState(employee.probation_end_date ?? '');
  const [noticePeriod, setNoticePeriod] = useState(
    employee.notice_period_weeks !== null && employee.notice_period_weeks !== undefined
      ? String(employee.notice_period_weeks)
      : ''
  );
  const [hiredFromApp, setHiredFromApp] = useState(employee.hired_from_application_id ?? '');
  const [notes, setNotes] = useState(employee.notes ?? '');
  const [positionType, setPositionType] = useState(employee.position_type ?? '');
  const [payGrade, setPayGrade] = useState(employee.pay_grade ?? '');
  const [employmentBasis, setEmploymentBasis] = useState(employee.employment_basis ?? '');
  const [weeklyHours, setWeeklyHours] = useState(
    employee.weekly_hours != null ? String(employee.weekly_hours) : ''
  );
  const [positionsCount, setPositionsCount] = useState(
    employee.positions_count != null ? String(employee.positions_count) : '1'
  );
  const [budgetAmount, setBudgetAmount] = useState(
    employee.budget_amount != null ? String(employee.budget_amount) : ''
  );
  const [budgetCurrency, setBudgetCurrency] = useState(employee.budget_currency ?? '');
  const [departmentStart, setDepartmentStart] = useState(employee.department_start_date ?? '');
  const [continuousEmploymentStart, setContinuousEmploymentStart] = useState(
    employee.continuous_employment_start_date ?? ''
  );
  const [contractStartDate, setContractStartDate] = useState(employee.contract_start_date ?? '');
  const [contractEndDate, setContractEndDate] = useState(employee.contract_end_date ?? '');
  const [contractSignedOn, setContractSignedOn] = useState(employee.contract_signed_on ?? '');
  const [contractDocumentUrl, setContractDocumentUrl] = useState(
    employee.contract_document_url ?? ''
  );
  const [contractReviewDate, setContractReviewDate] = useState(employee.contract_review_date ?? '');
  const [homeAddressLine1, setHomeAddressLine1] = useState(employee.home_address_line1 ?? '');
  const [homeAddressLine2, setHomeAddressLine2] = useState(employee.home_address_line2 ?? '');
  const [homeCity, setHomeCity] = useState(employee.home_city ?? '');
  const [homeCounty, setHomeCounty] = useState(employee.home_county ?? '');
  const [homePostcode, setHomePostcode] = useState(employee.home_postcode ?? '');
  const [homeCountry, setHomeCountry] = useState(employee.home_country ?? '');
  const [emergencyContactName, setEmergencyContactName] = useState(
    employee.emergency_contact_name ?? ''
  );
  const [emergencyContactRelationship, setEmergencyContactRelationship] = useState(
    employee.emergency_contact_relationship ?? ''
  );
  const [emergencyContactPhone, setEmergencyContactPhone] = useState(
    employee.emergency_contact_phone ?? ''
  );
  const [emergencyContactEmail, setEmergencyContactEmail] = useState(
    employee.emergency_contact_email ?? ''
  );
  const [rtwStatus, setRtwStatus] = useState(employee.rtw_status ?? 'unknown');
  const [rtwCheckedOn, setRtwCheckedOn] = useState(employee.rtw_checked_on ?? '');
  const [rtwExpiryDate, setRtwExpiryDate] = useState(employee.rtw_expiry_date ?? '');
  const [rtwCheckMethod, setRtwCheckMethod] = useState(employee.rtw_check_method ?? '');
  const [rtwDocumentUrl, setRtwDocumentUrl] = useState(employee.rtw_document_url ?? '');
  const [visaType, setVisaType] = useState(employee.visa_type ?? '');
  const [payFrequency, setPayFrequency] = useState(employee.pay_frequency ?? 'monthly');
  const [contractedDaysPerWeek, setContractedDaysPerWeek] = useState(
    employee.contracted_days_per_week != null ? String(employee.contracted_days_per_week) : ''
  );
  const [averageWeeklyEarnings, setAverageWeeklyEarnings] = useState(
    employee.average_weekly_earnings_gbp != null ? String(employee.average_weekly_earnings_gbp) : ''
  );
  const [timesheetClockEnabled, setTimesheetClockEnabled] = useState(
    Boolean(employee.timesheet_clock_enabled)
  );
  const [hourlyPayGbp, setHourlyPayGbp] = useState(
    employee.hourly_pay_gbp != null ? String(employee.hourly_pay_gbp) : ''
  );
  const [annualLeaveEntitlementExempt, setAnnualLeaveEntitlementExempt] = useState(
    Boolean(employee.annual_leave_entitlement_exempt)
  );
  const [customFieldRows, setCustomFieldRows] = useState<CustomFieldRow[]>(() =>
    customFieldRowsFromEmployee(employee.custom_fields)
  );
  const [activeTab, setActiveTab] = useState<Tab>('overview');

  function resetFormFromEmployee(emp: Employee) {
    setJobTitle(emp.job_title ?? '');
    setGradeLevel(emp.grade_level ?? '');
    setContractType(emp.contract_type ?? 'full_time');
    setSalaryBand(emp.salary_band ?? '');
    setFte(String(emp.fte ?? 1));
    setWorkLocation(emp.work_location ?? 'office');
    setStartDate(emp.employment_start_date ?? '');
    setProbationEnd(emp.probation_end_date ?? '');
    setNoticePeriod(
      emp.notice_period_weeks !== null && emp.notice_period_weeks !== undefined
        ? String(emp.notice_period_weeks)
        : ''
    );
    setHiredFromApp(emp.hired_from_application_id ?? '');
    setNotes(emp.notes ?? '');
    setPositionType(emp.position_type ?? '');
    setPayGrade(emp.pay_grade ?? '');
    setEmploymentBasis(emp.employment_basis ?? '');
    setWeeklyHours(emp.weekly_hours != null ? String(emp.weekly_hours) : '');
    setPositionsCount(emp.positions_count != null ? String(emp.positions_count) : '1');
    setBudgetAmount(emp.budget_amount != null ? String(emp.budget_amount) : '');
    setBudgetCurrency(emp.budget_currency ?? '');
    setDepartmentStart(emp.department_start_date ?? '');
    setContinuousEmploymentStart(emp.continuous_employment_start_date ?? '');
    setContractStartDate(emp.contract_start_date ?? '');
    setContractEndDate(emp.contract_end_date ?? '');
    setContractSignedOn(emp.contract_signed_on ?? '');
    setContractDocumentUrl(emp.contract_document_url ?? '');
    setContractReviewDate(emp.contract_review_date ?? '');
    setHomeAddressLine1(emp.home_address_line1 ?? '');
    setHomeAddressLine2(emp.home_address_line2 ?? '');
    setHomeCity(emp.home_city ?? '');
    setHomeCounty(emp.home_county ?? '');
    setHomePostcode(emp.home_postcode ?? '');
    setHomeCountry(emp.home_country ?? '');
    setEmergencyContactName(emp.emergency_contact_name ?? '');
    setEmergencyContactRelationship(emp.emergency_contact_relationship ?? '');
    setEmergencyContactPhone(emp.emergency_contact_phone ?? '');
    setEmergencyContactEmail(emp.emergency_contact_email ?? '');
    setRtwStatus(emp.rtw_status ?? 'unknown');
    setRtwCheckedOn(emp.rtw_checked_on ?? '');
    setRtwExpiryDate(emp.rtw_expiry_date ?? '');
    setRtwCheckMethod(emp.rtw_check_method ?? '');
    setRtwDocumentUrl(emp.rtw_document_url ?? '');
    setVisaType(emp.visa_type ?? '');
    setPayFrequency(emp.pay_frequency ?? 'monthly');
    setContractedDaysPerWeek(
      emp.contracted_days_per_week != null ? String(emp.contracted_days_per_week) : ''
    );
    setAverageWeeklyEarnings(
      emp.average_weekly_earnings_gbp != null ? String(emp.average_weekly_earnings_gbp) : ''
    );
    setTimesheetClockEnabled(Boolean(emp.timesheet_clock_enabled));
    setHourlyPayGbp(emp.hourly_pay_gbp != null ? String(emp.hourly_pay_gbp) : '');
    setAnnualLeaveEntitlementExempt(Boolean(emp.annual_leave_entitlement_exempt));
    setCustomFieldRows(customFieldRowsFromEmployee(emp.custom_fields));
  }

  useEffect(() => {
    if (!editing) resetFormFromEmployee(employee);
    // Sync flattened form when server record changes (after save / navigation).
  }, [editing, employee.user_id, employee.record_updated_at]); // eslint-disable-line react-hooks/exhaustive-deps -- full `employee` would overwrite in-flight edits

  function cancelEdit() {
    setJobTitle(employee.job_title ?? '');
    setGradeLevel(employee.grade_level ?? '');
    setContractType(employee.contract_type ?? 'full_time');
    setSalaryBand(employee.salary_band ?? '');
    setFte(String(employee.fte ?? 1));
    setWorkLocation(employee.work_location ?? 'office');
    setStartDate(employee.employment_start_date ?? '');
    setProbationEnd(employee.probation_end_date ?? '');
    setNoticePeriod(
      employee.notice_period_weeks !== null && employee.notice_period_weeks !== undefined
        ? String(employee.notice_period_weeks)
        : ''
    );
    setHiredFromApp(employee.hired_from_application_id ?? '');
    setNotes(employee.notes ?? '');
    setPositionType(employee.position_type ?? '');
    setPayGrade(employee.pay_grade ?? '');
    setEmploymentBasis(employee.employment_basis ?? '');
    setWeeklyHours(employee.weekly_hours != null ? String(employee.weekly_hours) : '');
    setPositionsCount(employee.positions_count != null ? String(employee.positions_count) : '1');
    setBudgetAmount(employee.budget_amount != null ? String(employee.budget_amount) : '');
    setBudgetCurrency(employee.budget_currency ?? '');
    setDepartmentStart(employee.department_start_date ?? '');
    setContinuousEmploymentStart(employee.continuous_employment_start_date ?? '');
    setContractStartDate(employee.contract_start_date ?? '');
    setContractEndDate(employee.contract_end_date ?? '');
    setContractSignedOn(employee.contract_signed_on ?? '');
    setContractDocumentUrl(employee.contract_document_url ?? '');
    setContractReviewDate(employee.contract_review_date ?? '');
    setHomeAddressLine1(employee.home_address_line1 ?? '');
    setHomeAddressLine2(employee.home_address_line2 ?? '');
    setHomeCity(employee.home_city ?? '');
    setHomeCounty(employee.home_county ?? '');
    setHomePostcode(employee.home_postcode ?? '');
    setHomeCountry(employee.home_country ?? '');
    setEmergencyContactName(employee.emergency_contact_name ?? '');
    setEmergencyContactRelationship(employee.emergency_contact_relationship ?? '');
    setEmergencyContactPhone(employee.emergency_contact_phone ?? '');
    setEmergencyContactEmail(employee.emergency_contact_email ?? '');
    setRtwStatus(employee.rtw_status ?? 'unknown');
    setRtwCheckedOn(employee.rtw_checked_on ?? '');
    setRtwExpiryDate(employee.rtw_expiry_date ?? '');
    setRtwCheckMethod(employee.rtw_check_method ?? '');
    setRtwDocumentUrl(employee.rtw_document_url ?? '');
    setVisaType(employee.visa_type ?? '');
    setPayFrequency(employee.pay_frequency ?? 'monthly');
    setContractedDaysPerWeek(
      employee.contracted_days_per_week != null ? String(employee.contracted_days_per_week) : ''
    );
    setAverageWeeklyEarnings(
      employee.average_weekly_earnings_gbp != null
        ? String(employee.average_weekly_earnings_gbp)
        : ''
    );
    setTimesheetClockEnabled(Boolean(employee.timesheet_clock_enabled));
    setHourlyPayGbp(employee.hourly_pay_gbp != null ? String(employee.hourly_pay_gbp) : '');
    setAnnualLeaveEntitlementExempt(Boolean(employee.annual_leave_entitlement_exempt));
    setCustomFieldRows(customFieldRowsFromEmployee(employee.custom_fields));
    setMsg(null);
    setEditing(false);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const posN = Number(positionsCount);
    const budN = budgetAmount.trim() === '' ? null : Number(budgetAmount);
    const whN = weeklyHours.trim() === '' ? null : Number(weeklyHours);
    const response = await withMinimumDelay(
      supabase.rpc('employee_hr_record_upsert', {
        p_user_id: employee.user_id,
        p_job_title: jobTitle.trim(),
        p_grade_level: gradeLevel.trim(),
        p_contract_type: contractType,
        p_salary_band: salaryBand.trim(),
        p_fte: Number(fte) || 1,
        p_work_location: workLocation,
        p_employment_start_date: startDate || null,
        p_probation_end_date: probationEnd || null,
        p_notice_period_weeks: noticePeriod !== '' ? Number(noticePeriod) : null,
        p_hired_from_application_id: hiredFromApp || null,
        p_notes: notes.trim() || null,
        p_position_type: positionType.trim() || null,
        p_pay_grade: payGrade.trim() || null,
        p_employment_basis: employmentBasis.trim() || null,
        p_weekly_hours: whN != null && !Number.isNaN(whN) ? whN : null,
        p_positions_count: !Number.isNaN(posN) && posN >= 1 ? Math.floor(posN) : null,
        p_budget_amount: budN != null && !Number.isNaN(budN) ? budN : null,
        p_budget_currency: budgetCurrency.trim() || null,
        p_department_start_date: departmentStart || null,
        p_continuous_employment_start_date: continuousEmploymentStart || null,
        p_custom_fields: customFieldsToRecord(customFieldRows),
        p_contract_start_date: contractStartDate || null,
        p_contract_end_date: contractEndDate || null,
        p_contract_signed_on: contractSignedOn || null,
        p_contract_document_url: contractDocumentUrl.trim() || null,
        p_contract_review_date: contractReviewDate || null,
        p_home_address_line1: homeAddressLine1.trim() || null,
        p_home_address_line2: homeAddressLine2.trim() || null,
        p_home_city: homeCity.trim() || null,
        p_home_county: homeCounty.trim() || null,
        p_home_postcode: homePostcode.trim() || null,
        p_home_country: homeCountry.trim() || null,
        p_emergency_contact_name: emergencyContactName.trim() || null,
        p_emergency_contact_relationship: emergencyContactRelationship.trim() || null,
        p_emergency_contact_phone: emergencyContactPhone.trim() || null,
        p_emergency_contact_email: emergencyContactEmail.trim() || null,
        p_rtw_status: rtwStatus || 'unknown',
        p_rtw_checked_on: rtwCheckedOn || null,
        p_rtw_expiry_date: rtwExpiryDate || null,
        p_rtw_check_method: rtwCheckMethod.trim() || null,
        p_rtw_document_url: rtwDocumentUrl.trim() || null,
        p_visa_type: visaType.trim() || null,
        p_pay_frequency: payFrequency || 'monthly',
        p_contracted_days_per_week:
          contractedDaysPerWeek.trim() === '' ? null : Number(contractedDaysPerWeek),
        p_average_weekly_earnings_gbp:
          averageWeeklyEarnings.trim() === '' ? null : Number(averageWeeklyEarnings),
        p_timesheet_clock_enabled: timesheetClockEnabled,
        p_hourly_pay_gbp: hourlyPayGbp.trim() === '' ? null : Number(hourlyPayGbp),
        p_annual_leave_entitlement_exempt: annualLeaveEntitlementExempt,
      })
    );
    const error = (response as { error: { message: string } | null }).error;
    setBusy(false);
    if (error) {
      setMsg({ type: 'error', text: error.message });
      return;
    }
    setEditing(false);
    await invalidateHrRecordCaches().catch(() => null);
    setMsg({ type: 'success', text: 'HR record saved.' });
    router.refresh();
  }

  async function markProbationComplete(clear: boolean) {
    if (clear && !canManage) return;
    if (!clear && !canMarkProbationCheck) return;
    setProbationBusy(true);
    setMsg(null);
    const { error } = await supabase.rpc('employee_probation_check_set', {
      p_user_id: employee.user_id,
      p_clear: clear,
    });
    setProbationBusy(false);
    if (error) {
      setMsg({ type: 'error', text: error.message });
      return;
    }
    setMsg({
      type: 'success',
      text: clear ? 'Probation completion cleared.' : 'Probation review marked complete.',
    });
    await invalidateHrRecordCaches().catch(() => null);
    router.refresh();
  }

  async function uploadHrDocument(file: File) {
    const isPhoto = docCategory === 'employee_photo';
    const isId = docCategory === 'id_document';
    const canUpload =
      (!isPhoto && !isId && canManage) ||
      (isPhoto && canManageEmployeePhotos) ||
      (isId && canManageIdDocuments);
    if (!canUpload) return;
    setDocBusy(true);
    setMsg(null);
    if (file.size > DOC_MAX_BYTES) {
      setMsg({ type: 'error', text: 'File must be 20 MB or smaller.' });
      setDocBusy(false);
      return;
    }
    if (!isAllowedHrDocMime(file.type || '', docCategory)) {
      setMsg({
        type: 'error',
        text:
          docCategory === 'employee_photo'
            ? 'Employee photos must be image files.'
            : docCategory === 'id_document'
              ? 'ID documents must be PDF or image files.'
              : 'Use PDF, an image, Word, or Excel.',
      });
      setDocBusy(false);
      return;
    }
    const documentId = crypto.randomUUID();
    const safeName = safeFileSegment(file.name);
    const path = `${orgId}/${documentId}/${safeName}`;
    const bucket = isPhoto ? EMPLOYEE_PHOTO_BUCKET : isId ? EMPLOYEE_ID_BUCKET : HR_DOC_BUCKET;
    const kind = isPhoto ? 'employee_photo' : isId ? 'id_document' : 'supporting_document';
    const chosenCustomCategoryId = !isPhoto && !isId ? selectedCustomCategoryId || null : null;
    const idLast4 = isId ? idNumber.replace(/\D+/g, '').slice(-4) : '';
    if (isId && idNumber.trim() && idLast4.length < 4) {
      setMsg({ type: 'error', text: 'ID number must include at least 4 digits to mask safely.' });
      setDocBusy(false);
      return;
    }
    const { error: upErr } = await supabase.storage.from(bucket).upload(path, file, {
      upsert: false,
      cacheControl: '3600',
      contentType: file.type || 'application/octet-stream',
    });
    if (upErr) {
      setMsg({ type: 'error', text: upErr.message });
      setDocBusy(false);
      return;
    }
    const { error: insErr } = await supabase.from('employee_hr_documents').insert({
      id: documentId,
      org_id: orgId,
      user_id: employee.user_id,
      category: docCategory,
      document_kind: kind,
      bucket_id: bucket,
      custom_category_id: chosenCustomCategoryId,
      label: docLabel.trim(),
      storage_path: path,
      file_name: file.name,
      mime_type: file.type || 'application/octet-stream',
      byte_size: file.size,
      uploaded_by: currentUserId,
      id_document_type: isId ? idDocumentType.trim() || null : null,
      id_number_last4: isId ? idLast4 || null : null,
      expires_on: isId ? idExpiryDate || null : null,
    });
    if (insErr) {
      await supabase.storage.from(bucket).remove([path]);
      setMsg({ type: 'error', text: insErr.message });
      setDocBusy(false);
      return;
    }
    if (isPhoto || isId) {
      void supabase
        .from('employee_hr_documents')
        .update({ is_current: false, replaced_by_document_id: documentId })
        .eq('org_id', orgId)
        .eq('user_id', employee.user_id)
        .eq('document_kind', kind)
        .neq('id', documentId)
        .eq('is_current', true);
    }
    setDocLabel('');
    setSelectedCustomCategoryId('');
    setIdDocumentType('');
    setIdNumber('');
    setIdExpiryDate('');
    setMsg({ type: 'success', text: 'Document uploaded.' });
    setDocBusy(false);
    router.refresh();
  }

  async function downloadHrDocument(d: HrEvidenceDoc) {
    const { data, error } = await supabase.storage
      .from(d.bucket_id || HR_DOC_BUCKET)
      .createSignedUrl(d.storage_path, 3600);
    if (error || !data?.signedUrl) {
      setMsg({ type: 'error', text: error?.message ?? 'Could not open file.' });
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  }

  async function deleteHrDocument(d: HrEvidenceDoc) {
    const canDelete =
      (d.document_kind === 'employee_photo' && canManageEmployeePhotos) ||
      (d.document_kind === 'id_document' && canManageIdDocuments) ||
      (d.document_kind === 'supporting_document' && canManage);
    if (!canDelete) return;
    if (!window.confirm(`Remove “${d.file_name}” from this employee’s documents?`)) return;
    setDocBusy(true);
    setMsg(null);
    const { error: rmErr } = await supabase.storage
      .from(d.bucket_id || HR_DOC_BUCKET)
      .remove([d.storage_path]);
    if (rmErr) {
      setMsg({ type: 'error', text: rmErr.message });
      setDocBusy(false);
      return;
    }
    const { error: delErr } = await supabase.from('employee_hr_documents').delete().eq('id', d.id);
    if (delErr) {
      setMsg({ type: 'error', text: delErr.message });
      setDocBusy(false);
      return;
    }
    setDocuments((prev) => prev.filter((x) => x.id !== d.id));
    setMsg({ type: 'success', text: 'Document removed.' });
    setDocBusy(false);
    router.refresh();
  }

  async function createCustomCategory() {
    if (!canManage) return;
    const name = newCustomCategoryName.trim();
    if (!name) return;
    setDocBusy(true);
    setMsg(null);
    const { data, error } = await supabase
      .from('employee_document_categories')
      .insert({
        org_id: orgId,
        name,
        document_kind_scope: 'supporting_document',
        created_by: currentUserId,
      })
      .select('id')
      .single();
    setDocBusy(false);
    if (error) {
      setMsg({ type: 'error', text: error.message });
      return;
    }
    setSelectedCustomCategoryId((data?.id as string) ?? '');
    setNewCustomCategoryName('');
    setMsg({ type: 'success', text: 'Custom category added. You can now use it for uploads.' });
    router.refresh();
  }

  const canUploadCurrentCategory =
    (docCategory === 'employee_photo' && canManageEmployeePhotos) ||
    (docCategory === 'id_document' && canManageIdDocuments) ||
    (!['employee_photo', 'id_document'].includes(docCategory) && canManage);
  const visibleDocuments = documents.filter((d) => {
    if (d.document_kind === 'employee_photo')
      return canViewEmployeePhotos || canManageEmployeePhotos;
    if (d.document_kind === 'id_document') return canViewIdDocuments || canManageIdDocuments;
    return true;
  });

  function onDocFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (f) void uploadHrDocument(f);
  }

  const today = new Date().toISOString().slice(0, 10);
  const onProbation = employee.probation_end_date && employee.probation_end_date >= today;
  const pbLevel = useMemo(
    () =>
      probationAlertLevel(
        employee.probation_end_date ?? null,
        employee.probation_check_completed_at ?? null,
        today
      ),
    [employee.probation_end_date, employee.probation_check_completed_at, today]
  );

  const displayName = employee.display_name ?? employee.full_name;
  const deptLine = employee.department_names.length ? employee.department_names.join(', ') : '—';
  const emailDisplay = (employee.email ?? '').trim() || '—';
  const subtitleJobDept = [employee.job_title, deptLine !== '—' ? deptLine : null]
    .filter(Boolean)
    .join(' · ');
  const tenureLabel =
    typeof employee.length_of_service_years === 'number' &&
    typeof employee.length_of_service_months === 'number'
      ? `${employee.length_of_service_years}y ${employee.length_of_service_months}m`
      : '—';
  const annualEntitlementDays = employee.annual_leave_entitlement_exempt
    ? null
    : (leaveAllowance?.annual_entitlement_days ?? null);
  const toilDays = leaveAllowance?.toil_balance_days ?? null;
  const rtwExpiryDays = daysUntilDate(employee.rtw_expiry_date ?? null, today);
  const contractEndDays = daysUntilDate(employee.contract_end_date ?? null, today);
  const localOverviewWarnings = useMemo<OverviewWarning[]>(() => {
    const items: OverviewWarning[] = [];

    if (pbLevel) {
      items.push({
        id: 'probation',
        tone: pbLevel === 'critical' ? 'danger' : 'warning',
        title:
          pbLevel === 'critical'
            ? 'Probation review is more than one week overdue.'
            : pbLevel === 'overdue'
              ? 'Probation end date has passed.'
              : 'Probation is ending soon.',
        detail: employee.probation_end_date
          ? `Probation ends ${employee.probation_end_date}.`
          : 'Probation review needs attention.',
      });
    }

    if (absenceScore && absenceScore.bradford_score >= BRADFORD_ALERT_THRESHOLD) {
      items.push({
        id: 'absence-score',
        tone: 'danger',
        title: `Bradford score is ${absenceScore.bradford_score}.`,
        detail: `${absenceScore.spell_count} spell${absenceScore.spell_count === 1 ? '' : 's'} across ${absenceScore.total_days} day${absenceScore.total_days === 1 ? '' : 's'} recorded.`,
      });
    }

    if (employee.rtw_status === 'expired') {
      items.push({
        id: 'rtw-status',
        tone: 'danger',
        title: 'Right-to-work verification has expired.',
        detail: employee.rtw_expiry_date
          ? `Expiry date: ${employee.rtw_expiry_date}.`
          : 'Review and renew the employee record.',
      });
    } else if (rtwExpiryDays != null && rtwExpiryDays < 0) {
      items.push({
        id: 'rtw-expired',
        tone: 'danger',
        title: 'Right-to-work document has passed its expiry date.',
        detail: `Expired on ${employee.rtw_expiry_date}.`,
      });
    } else if (rtwExpiryDays != null && rtwExpiryDays <= 30) {
      items.push({
        id: 'rtw-expiring',
        tone: 'warning',
        title: 'Right-to-work document is expiring soon.',
        detail: `${employee.rtw_expiry_date} · ${rtwExpiryDays === 0 ? 'due today' : `${rtwExpiryDays} day${rtwExpiryDays === 1 ? '' : 's'} remaining`}.`,
      });
    } else if (['required', 'in_progress', 'unknown'].includes(employee.rtw_status ?? 'unknown')) {
      items.push({
        id: 'rtw-review',
        tone: 'warning',
        title: 'Right-to-work verification still needs review.',
        detail: `Current status: ${employee.rtw_status || 'unknown'}.`,
      });
    }

    if (employee.status === 'active' && contractEndDays != null && contractEndDays < 0) {
      items.push({
        id: 'contract-ended',
        tone: 'danger',
        title: 'Contract end date has passed.',
        detail: `Contract end date: ${employee.contract_end_date}.`,
      });
    } else if (employee.status === 'active' && contractEndDays != null && contractEndDays <= 30) {
      items.push({
        id: 'contract-ending',
        tone: 'warning',
        title: 'Contract end date is approaching.',
        detail: `${employee.contract_end_date} · ${contractEndDays === 0 ? 'ends today' : `${contractEndDays} day${contractEndDays === 1 ? '' : 's'} remaining`}.`,
      });
    }

    return items;
  }, [
    absenceScore,
    contractEndDays,
    employee.contract_end_date,
    employee.probation_end_date,
    employee.rtw_expiry_date,
    employee.rtw_status,
    employee.status,
    pbLevel,
    rtwExpiryDays,
  ]);
  const allOverviewWarnings = [...localOverviewWarnings, ...overviewWarnings];
  const tabItems = useMemo(() => {
    const items: Array<{ id: Tab; label: string; badge?: TabBadge }> = [
      { id: 'overview', label: 'Overview' },
      { id: 'job', label: 'Job' },
      { id: 'leave', label: 'Leave', badge: tabBadges.leave },
      { id: 'documents', label: 'Documents' },
      { id: 'emergency', label: 'Emergency' },
    ];
    if (payrollPanel) items.push({ id: 'payroll', label: 'Payroll', badge: tabBadges.payroll });
    if (taxPanel) items.push({ id: 'tax', label: 'Tax', badge: tabBadges.tax });
    if (historyPanel) items.push({ id: 'history', label: 'History', badge: tabBadges.history });
    if (casesPanel) items.push({ id: 'cases', label: 'Cases', badge: tabBadges.cases });
    if (medicalPanel) items.push({ id: 'medical', label: 'Medical', badge: tabBadges.medical });
    if (customFieldsPanel) items.push({ id: 'custom', label: 'Custom', badge: tabBadges.custom });
    items.push({ id: 'audit', label: 'Audit' });
    return items;
  }, [
    casesPanel,
    customFieldsPanel,
    historyPanel,
    medicalPanel,
    payrollPanel,
    tabBadges,
    taxPanel,
  ]);

  useEffect(() => {
    if (!tabItems.some((item) => item.id === activeTab)) setActiveTab('overview');
  }, [activeTab, tabItems]);

  return (
    <div className="mx-auto max-w-7xl px-5 py-8 sm:px-7 font-sans text-[#121212]">
      {/* Back — stays outside hero so the hero matches /profile card weight */}
      <Link
        href="/hr/records"
        className="text-[12.5px] text-[#6b6b6b] underline underline-offset-2 hover:text-[var(--org-brand-primary,#0f6e56)]"
      >
        ← Employee records
      </Link>

      <header className="mb-7 mt-4 overflow-hidden rounded-2xl border border-[#e8e8e8] bg-white shadow-sm [border-left-width:4px] [border-left-style:solid] [border-left-color:var(--org-brand-primary,#0f6e56)]">
        <div className="flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 items-start gap-3 sm:gap-4">
            {employee.avatar_url ? (
              <img
                src={employee.avatar_url}
                alt=""
                className="h-11 w-11 shrink-0 rounded-xl border border-[color-mix(in_oklab,var(--org-brand-primary,#0f6e56)_28%,#e8e8e8)] object-cover"
              />
            ) : (
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[color-mix(in_oklab,var(--org-brand-primary,#0f6e56)_28%,#e8e8e8)] bg-[color-mix(in_oklab,var(--org-brand-primary,#0f6e56)_10%,white)] text-[14px] font-semibold text-[var(--org-brand-primary,#0f6e56)]">
                {getProfileInitials(employee.full_name, employee.preferred_name ?? null)}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-semibold uppercase tracking-widest text-[#9b9b9b]">
                Employee record
              </p>
              <h1 className="mt-1 font-authSerif text-[28px] leading-tight tracking-[-0.03em] text-[#121212]">
                {displayName}
              </h1>
              <p className="mt-1 text-[13.5px] leading-relaxed text-[#6b6b6b]">
                {subtitleJobDept || '—'} <span className="text-[#d4d4d4]">·</span> {emailDisplay}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <span className="rounded-full border border-[color-mix(in_oklab,var(--org-brand-primary,#0f6e56)_30%,#e8e8e8)] bg-[color-mix(in_oklab,var(--org-brand-primary,#0f6e56)_8%,#faf9f6)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--org-brand-primary,#0f6e56)]">
                  {employee.role?.trim() ? employee.role : 'Member'}
                </span>
                <span className="rounded-full border border-[#e8e8e8] bg-white px-2.5 py-0.5 text-[11px] font-medium text-[#6b6b6b]">
                  HR view
                </span>
              </div>
            </div>
          </div>
          <div className="flex w-full min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-end lg:max-w-xl">
            <div className="grid shrink-0 grid-cols-3 gap-2 sm:max-w-md sm:gap-3">
              <div className="rounded-xl border border-[#e8e8e8] bg-white p-3">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-[#9b9b9b]">
                  Annual
                </p>
                <p className="mt-1 text-[22px] font-bold leading-none tracking-tight text-[var(--org-brand-primary,#0f6e56)]">
                  {annualEntitlementDays != null ? annualEntitlementDays : '—'}
                </p>
                <p className="mt-0.5 text-[10px] text-[#9b9b9b]">days / yr</p>
              </div>
              <div className="rounded-xl border border-[#e8e8e8] bg-white p-3">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-[#9b9b9b]">
                  TOIL
                </p>
                <p className="mt-1 text-[22px] font-bold leading-none tracking-tight text-[#121212]">
                  {toilDays != null ? toilDays : '—'}
                </p>
                <p className="mt-0.5 text-[10px] text-[#9b9b9b]">days</p>
              </div>
              <div className="rounded-xl border border-[#e8e8e8] bg-white p-3">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-[#9b9b9b]">
                  Tenure
                </p>
                <p className="mt-1 text-[15px] font-bold leading-tight text-[#121212]">
                  {tenureLabel}
                </p>
              </div>
            </div>
            <div className="flex flex-col sm:items-end sm:self-start">
              <EmployeeRecordHeroActionMenu
                subjectUserId={employee.user_id}
                showEdit={Boolean(canManage && !editing)}
                onEdit={() => {
                  setActiveTab('job');
                  setEditing(true);
                }}
                editLabel={employee.hr_record_id ? 'Edit record' : 'Create HR record'}
                canExportCsv={recordExport.canCsv}
                canExportPdf={recordExport.canPdf}
                canExportSensitive={recordExport.canSensitive}
              />
            </div>
          </div>
        </div>
      </header>

      {msg ? (
        <p
          className={[
            'mb-6 rounded-lg px-3 py-2 text-[13px]',
            msg.type === 'error'
              ? 'border border-[#fecaca] bg-[#fef2f2] text-[#b91c1c]'
              : 'border border-[#86efac] bg-[#f0fdf4] text-[#166534]',
          ].join(' ')}
        >
          {msg.text}
        </p>
      ) : null}

      {/* Tab bar — same pill language as /profile; section set is HR-specific */}
      <nav className="mb-7 flex flex-wrap gap-2" aria-label="HR record sections">
        {tabItems.map((item) => {
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setActiveTab(item.id);
                if (item.id !== 'job') setEditing(false);
              }}
              className={hrRecordTabClass(activeTab === item.id)}
            >
              <span>{item.label}</span>
              {item.badge ? (
                <span
                  className={[
                    'ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none',
                    activeTab === item.id
                      ? 'bg-white/20 text-white'
                      : item.badge.tone === 'danger'
                        ? 'bg-[#fef2f2] text-[#b91c1c]'
                        : item.badge.tone === 'warning'
                          ? 'bg-[#fffbeb] text-[#b45309]'
                          : item.badge.tone === 'info'
                            ? 'bg-[#eff6ff] text-[#1d4ed8]'
                            : item.badge.tone === 'success'
                              ? 'bg-[#f0fdf4] text-[#15803d]'
                              : 'bg-[#f3f4f6] text-[#4b5563]',
                  ].join(' ')}
                >
                  {item.badge.text}
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>

      {/* Overview tab */}
      {activeTab === 'overview' && (
        <div className="mt-6 space-y-4">
          {allOverviewWarnings.length > 0 ? (
            <section className="rounded-xl border border-[#e8e8e8] bg-white p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-[#9b9b9b]">
                    Attention needed
                  </p>
                  <h2 className="mt-1 text-[16px] font-semibold text-[#121212]">
                    Warnings and follow-ups
                  </h2>
                </div>
                <span className="rounded-full border border-[#ececec] bg-[#faf9f6] px-2.5 py-1 text-[11px] font-medium text-[#6b6b6b]">
                  {allOverviewWarnings.length} item{allOverviewWarnings.length === 1 ? '' : 's'}
                </span>
              </div>
              <div className="mt-4 grid gap-3 lg:grid-cols-2">
                {allOverviewWarnings.map((warning) => (
                  <article
                    key={warning.id}
                    className={[
                      'rounded-xl border px-4 py-3 text-[13px]',
                      warning.tone === 'danger'
                        ? 'border-[#fecaca] bg-[#fef2f2] text-[#991b1b]'
                        : warning.tone === 'warning'
                          ? 'border-[#fde68a] bg-[#fffbeb] text-[#854d0e]'
                          : 'border-[#bfdbfe] bg-[#eff6ff] text-[#1d4ed8]',
                    ].join(' ')}
                    role="status"
                  >
                    <p className="font-medium">{warning.title}</p>
                    <p className="mt-1 text-[12px] opacity-90">{warning.detail}</p>
                  </article>
                ))}
              </div>
            </section>
          ) : null}

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,1fr)]">
            <section className="rounded-xl border border-[#e8e8e8] bg-white p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-[#9b9b9b]">
                    Core profile
                  </p>
                  <h2 className="mt-1 text-[16px] font-semibold text-[#121212]">
                    Employment snapshot
                  </h2>
                </div>
                <span
                  className={[
                    'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-medium',
                    employee.status === 'active'
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-[#f3f3f3] text-[#6b6b6b]',
                  ].join(' ')}
                >
                  <span
                    className={[
                      'h-1.5 w-1.5 rounded-full',
                      employee.status === 'active' ? 'bg-emerald-500' : 'bg-[#9b9b9b]',
                    ].join(' ')}
                  />
                  {employee.status === 'active' ? 'Active' : employee.status}
                </span>
              </div>
              <dl className="mt-4 grid gap-x-8 gap-y-4 text-[13px] sm:grid-cols-2 xl:grid-cols-3">
                <div>
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-[#9b9b9b]">
                    Department
                  </dt>
                  <dd className="mt-1 text-[#121212]">
                    {employee.department_names.length ? employee.department_names.join(', ') : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-[#9b9b9b]">
                    Manager
                  </dt>
                  <dd className="mt-1 text-[#121212]">{employee.reports_to_name ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-[#9b9b9b]">
                    Email
                  </dt>
                  <dd className="mt-1 text-[#121212]">{employee.email ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-[#9b9b9b]">
                    Job title
                  </dt>
                  <dd className="mt-1 text-[#121212]">{employee.job_title || '—'}</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-[#9b9b9b]">
                    Contract
                  </dt>
                  <dd className="mt-1 text-[#121212]">
                    {contractLabel(employee.contract_type ?? '')}
                    {employee.fte && employee.fte < 1
                      ? ` · ${Math.round(employee.fte * 100)}% FTE`
                      : ''}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-[#9b9b9b]">
                    Work location
                  </dt>
                  <dd className="mt-1 text-[#121212]">
                    {locationLabel(employee.work_location ?? '')}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-[#9b9b9b]">
                    Start date
                  </dt>
                  <dd className="mt-1 text-[#121212]">{employee.employment_start_date ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-[#9b9b9b]">
                    Tenure
                  </dt>
                  <dd className="mt-1 text-[#121212]">{tenureLabel}</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-[#9b9b9b]">
                    Right to work
                  </dt>
                  <dd className="mt-1 text-[#121212]">{employee.rtw_status || '—'}</dd>
                </div>
              </dl>
            </section>

            <section className="rounded-xl border border-[#e8e8e8] bg-white p-5">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-[#9b9b9b]">
                At a glance
              </p>
              <h2 className="mt-1 text-[16px] font-semibold text-[#121212]">Key numbers</h2>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-[#ececec] bg-[#faf9f6] p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[#9b9b9b]">
                    Annual leave
                  </p>
                  <p className="mt-2 text-[24px] font-bold leading-none text-[#121212]">
                    {annualEntitlementDays != null ? annualEntitlementDays : '—'}
                  </p>
                  <p className="mt-1 text-[11px] text-[#9b9b9b]">days / year</p>
                </div>
                <div className="rounded-xl border border-[#ececec] bg-[#faf9f6] p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[#9b9b9b]">
                    TOIL
                  </p>
                  <p className="mt-2 text-[24px] font-bold leading-none text-[#121212]">
                    {toilDays != null ? toilDays : '—'}
                  </p>
                  <p className="mt-1 text-[11px] text-[#9b9b9b]">days available</p>
                </div>
                <div className="rounded-xl border border-[#ececec] bg-[#faf9f6] p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[#9b9b9b]">
                    Absence score
                  </p>
                  <p className="mt-2 text-[24px] font-bold leading-none text-[#121212]">
                    {absenceScore ? absenceScore.bradford_score : '—'}
                  </p>
                  <p className="mt-1 text-[11px] text-[#9b9b9b]">
                    {absenceScore
                      ? `${absenceScore.spell_count} spell${absenceScore.spell_count === 1 ? '' : 's'}`
                      : 'No absences'}
                  </p>
                </div>
                <div className="rounded-xl border border-[#ececec] bg-[#faf9f6] p-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-[#9b9b9b]">
                    Probation
                  </p>
                  <p className="mt-2 text-[15px] font-bold leading-tight text-[#121212]">
                    {employee.probation_end_date ?? '—'}
                  </p>
                  <p className="mt-1 text-[11px] text-[#9b9b9b]">
                    {employee.probation_check_completed_at
                      ? 'Review completed'
                      : onProbation
                        ? 'Currently active'
                        : 'No active probation'}
                  </p>
                </div>
              </div>
            </section>
          </div>
        </div>
      )}

      {/* HR record — view or edit (Job tab) */}
      {activeTab === 'job' &&
        (editing ? (
          <form
            className="mt-6 rounded-xl border border-[#d8d8d8] bg-white p-5"
            onSubmit={(e) => void save(e)}
          >
            <h2 className="text-[15px] font-semibold text-[#121212]">HR record</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="block text-[12.5px] font-medium text-[#6b6b6b]">
                Job title
                <input
                  type="text"
                  value={jobTitle}
                  onChange={(e) => setJobTitle(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2 text-[13px]"
                  placeholder="e.g. Senior Engineer"
                />
              </label>
              {canViewGrading ? (
                <>
                  <label className="block text-[12.5px] font-medium text-[#6b6b6b]">
                    Grade / level
                    <input
                      type="text"
                      value={gradeLevel}
                      onChange={(e) => setGradeLevel(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2 text-[13px]"
                      placeholder="e.g. L4, Senior"
                    />
                  </label>
                  <label className="block text-[12.5px] font-medium text-[#6b6b6b]">
                    Pay grade (e.g. after pay spine)
                    <input
                      type="text"
                      value={payGrade}
                      onChange={(e) => setPayGrade(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2 text-[13px]"
                      placeholder="e.g. spinal point, band"
                    />
                  </label>
                </>
              ) : null}
              <label className="block text-[12.5px] font-medium text-[#6b6b6b]">
                Position type
                <input
                  type="text"
                  value={positionType}
                  onChange={(e) => setPositionType(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2 text-[13px]"
                  placeholder="e.g. permanent, secondment"
                />
              </label>
              <label className="block text-[12.5px] font-medium text-[#6b6b6b]">
                Employment basis
                <input
                  type="text"
                  value={employmentBasis}
                  onChange={(e) => setEmploymentBasis(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2 text-[13px]"
                  placeholder="e.g. permanent, fixed-term"
                />
              </label>
              <label className="block text-[12.5px] font-medium text-[#6b6b6b]">
                Contract type
                <select
                  value={contractType}
                  onChange={(e) => setContractType(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2 text-[13px]"
                >
                  <option value="full_time">Full-time</option>
                  <option value="part_time">Part-time</option>
                  <option value="contractor">Contractor</option>
                  <option value="zero_hours">Zero hours</option>
                </select>
              </label>
              <label className="block text-[12.5px] font-medium text-[#6b6b6b]">
                FTE (0.1 – 1.0)
                <input
                  type="number"
                  min="0.1"
                  max="1"
                  step="0.05"
                  value={fte}
                  onChange={(e) => setFte(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2 text-[13px]"
                />
              </label>
              <label className="block text-[12.5px] font-medium text-[#6b6b6b]">
                Weekly hours (contracted)
                <input
                  type="number"
                  min="0.5"
                  max="168"
                  step="0.5"
                  value={weeklyHours}
                  onChange={(e) => setWeeklyHours(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2 text-[13px]"
                  placeholder="e.g. 37.5"
                />
              </label>
              <label className="block text-[12.5px] font-medium text-[#6b6b6b]">
                Pay frequency
                <select
                  value={payFrequency}
                  onChange={(e) => setPayFrequency(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2 text-[13px]"
                >
                  <option value="monthly">Monthly</option>
                  <option value="weekly">Weekly</option>
                  <option value="four_weekly">Four-weekly</option>
                </select>
                <span className="mt-0.5 block text-[11px] text-[#9b9b9b]">
                  Weekly + contracted days drive statutory annual leave when enabled in leave
                  settings.
                </span>
              </label>
              <label className="block text-[12.5px] font-medium text-[#6b6b6b]">
                Contracted working days per week
                <input
                  type="number"
                  min="0.5"
                  max="7"
                  step="0.5"
                  value={contractedDaysPerWeek}
                  onChange={(e) => setContractedDaysPerWeek(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2 text-[13px]"
                  placeholder="e.g. 5 (full-time), 3 (part-time)"
                />
              </label>
              <label className="block text-[12.5px] font-medium text-[#6b6b6b]">
                Average weekly earnings — AWE (£)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={averageWeeklyEarnings}
                  onChange={(e) => setAverageWeeklyEarnings(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2 text-[13px]"
                  placeholder="For Statutory Sick Pay (8-week basis)"
                />
              </label>
              <label className="flex cursor-pointer items-center gap-2 text-[12.5px] font-medium text-[#6b6b6b]">
                <input
                  type="checkbox"
                  checked={timesheetClockEnabled}
                  onChange={(e) => setTimesheetClockEnabled(e.target.checked)}
                  className="rounded border-[#d8d8d8]"
                />
                Enable timesheet clock (mobile / web attendance)
              </label>
              <label className="block text-[12.5px] font-medium text-[#6b6b6b]">
                Hourly pay (£)
                <input
                  type="number"
                  min="0"
                  step="0.0001"
                  value={hourlyPayGbp}
                  onChange={(e) => setHourlyPayGbp(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2 text-[13px]"
                  placeholder="For wagesheet basic pay"
                />
              </label>
              <label className="flex cursor-pointer items-start gap-2 text-[12.5px] font-medium text-[#6b6b6b] sm:col-span-2">
                <input
                  type="checkbox"
                  checked={annualLeaveEntitlementExempt}
                  onChange={(e) => setAnnualLeaveEntitlementExempt(e.target.checked)}
                  className="mt-0.5 rounded border-[#d8d8d8]"
                />
                <span>
                  No paid annual leave entitlement
                  <span className="mt-0.5 block text-[11px] font-normal text-[#9b9b9b]">
                    Use for roles that do not accrue holiday (e.g. some hourly or casual contracts).
                    Bulk leave defaults and pro-rata will show 0 days; turning this off does not
                    restore entitlement automatically — use Leave settings or set an allowance
                    manually.
                  </span>
                </span>
              </label>
              <label className="block text-[12.5px] font-medium text-[#6b6b6b]">
                No. of positions (headcount lines)
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={positionsCount}
                  onChange={(e) => setPositionsCount(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2 text-[13px]"
                />
              </label>
              <label className="block text-[12.5px] font-medium text-[#6b6b6b]">
                Salary band
                <input
                  type="text"
                  value={salaryBand}
                  onChange={(e) => setSalaryBand(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2 text-[13px]"
                  placeholder="e.g. Band C, £40–50k"
                />
              </label>
              <label className="block text-[12.5px] font-medium text-[#6b6b6b]">
                Budget amount
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={budgetAmount}
                  onChange={(e) => setBudgetAmount(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2 text-[13px]"
                  placeholder="e.g. annual FTE budget"
                />
              </label>
              <label className="block text-[12.5px] font-medium text-[#6b6b6b]">
                Budget currency
                <input
                  type="text"
                  value={budgetCurrency}
                  onChange={(e) => setBudgetCurrency(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2 text-[13px]"
                  placeholder="e.g. GBP, USD"
                />
              </label>
              <label className="block text-[12.5px] font-medium text-[#6b6b6b]">
                Work location
                <select
                  value={workLocation}
                  onChange={(e) => setWorkLocation(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2 text-[13px]"
                >
                  <option value="office">Office</option>
                  <option value="remote">Remote</option>
                  <option value="hybrid">Hybrid</option>
                </select>
              </label>
              <label className="block text-[12.5px] font-medium text-[#6b6b6b]">
                Employment start date
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2 text-[13px]"
                />
              </label>
              <label className="block text-[12.5px] font-medium text-[#6b6b6b]">
                Start date in current department
                <input
                  type="date"
                  value={departmentStart}
                  onChange={(e) => setDepartmentStart(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2 text-[13px]"
                />
              </label>
              <label className="block text-[12.5px] font-medium text-[#6b6b6b]">
                Continuous employment start
                <input
                  type="date"
                  value={continuousEmploymentStart}
                  onChange={(e) => setContinuousEmploymentStart(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2 text-[13px]"
                  title="Unbroken service date for leave / legacy HR, if different from employment start"
                />
              </label>
              <label className="block text-[12.5px] font-medium text-[#6b6b6b]">
                Probation end date
                <input
                  type="date"
                  value={probationEnd}
                  onChange={(e) => setProbationEnd(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2 text-[13px]"
                />
              </label>
              <label className="block text-[12.5px] font-medium text-[#6b6b6b]">
                Notice period (weeks)
                <input
                  type="number"
                  min="0"
                  value={noticePeriod}
                  onChange={(e) => setNoticePeriod(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2 text-[13px]"
                  placeholder="e.g. 4"
                />
              </label>
              <label className="block text-[12.5px] font-medium text-[#6b6b6b]">
                Contract start date
                <input
                  type="date"
                  value={contractStartDate}
                  onChange={(e) => setContractStartDate(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2 text-[13px]"
                />
              </label>
              <label className="block text-[12.5px] font-medium text-[#6b6b6b]">
                Contract end date
                <input
                  type="date"
                  value={contractEndDate}
                  onChange={(e) => setContractEndDate(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2 text-[13px]"
                />
              </label>
              <label className="block text-[12.5px] font-medium text-[#6b6b6b]">
                Contract signed on
                <input
                  type="date"
                  value={contractSignedOn}
                  onChange={(e) => setContractSignedOn(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2 text-[13px]"
                />
              </label>
              <label className="block text-[12.5px] font-medium text-[#6b6b6b]">
                Contract review date
                <input
                  type="date"
                  value={contractReviewDate}
                  onChange={(e) => setContractReviewDate(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2 text-[13px]"
                />
              </label>
              <label className="block text-[12.5px] font-medium text-[#6b6b6b] sm:col-span-2">
                Contract document URL
                <input
                  type="url"
                  value={contractDocumentUrl}
                  onChange={(e) => setContractDocumentUrl(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2 text-[13px]"
                  placeholder="https://..."
                />
                <span className="mt-0.5 block text-[11px] text-[#9b9b9b]">
                  Optional external link — use Documents below to upload files to secure storage.
                </span>
              </label>
              <label className="block text-[12.5px] font-medium text-[#6b6b6b]">
                Right-to-work status
                <select
                  value={rtwStatus}
                  onChange={(e) => setRtwStatus(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2 text-[13px]"
                >
                  <option value="unknown">Unknown</option>
                  <option value="required">Required</option>
                  <option value="in_progress">In progress</option>
                  <option value="verified">Verified</option>
                  <option value="expired">Expired</option>
                  <option value="not_required">Not required</option>
                </select>
              </label>
              <label className="block text-[12.5px] font-medium text-[#6b6b6b]">
                RTW checked on
                <input
                  type="date"
                  value={rtwCheckedOn}
                  onChange={(e) => setRtwCheckedOn(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2 text-[13px]"
                />
              </label>
              <label className="block text-[12.5px] font-medium text-[#6b6b6b]">
                RTW expiry date
                <input
                  type="date"
                  value={rtwExpiryDate}
                  onChange={(e) => setRtwExpiryDate(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2 text-[13px]"
                />
              </label>
              <label className="block text-[12.5px] font-medium text-[#6b6b6b]">
                RTW check method
                <input
                  type="text"
                  value={rtwCheckMethod}
                  onChange={(e) => setRtwCheckMethod(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2 text-[13px]"
                  placeholder="e.g. online share code"
                />
              </label>
              <label className="block text-[12.5px] font-medium text-[#6b6b6b]">
                Visa type
                <input
                  type="text"
                  value={visaType}
                  onChange={(e) => setVisaType(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2 text-[13px]"
                  placeholder="e.g. Skilled Worker"
                />
              </label>
              <label className="block text-[12.5px] font-medium text-[#6b6b6b] sm:col-span-2">
                RTW document URL
                <input
                  type="url"
                  value={rtwDocumentUrl}
                  onChange={(e) => setRtwDocumentUrl(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2 text-[13px]"
                  placeholder="https://..."
                />
                <span className="mt-0.5 block text-[11px] text-[#9b9b9b]">
                  Optional external link — use Documents below for passport / RTW scans.
                </span>
              </label>
              <label className="block text-[12.5px] font-medium text-[#6b6b6b] sm:col-span-2">
                Home address line 1
                <input
                  type="text"
                  value={homeAddressLine1}
                  onChange={(e) => setHomeAddressLine1(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2 text-[13px]"
                />
              </label>
              <label className="block text-[12.5px] font-medium text-[#6b6b6b] sm:col-span-2">
                Home address line 2
                <input
                  type="text"
                  value={homeAddressLine2}
                  onChange={(e) => setHomeAddressLine2(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2 text-[13px]"
                />
              </label>
              <label className="block text-[12.5px] font-medium text-[#6b6b6b]">
                Home city / town
                <input
                  type="text"
                  value={homeCity}
                  onChange={(e) => setHomeCity(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2 text-[13px]"
                />
              </label>
              <label className="block text-[12.5px] font-medium text-[#6b6b6b]">
                Home county / state
                <input
                  type="text"
                  value={homeCounty}
                  onChange={(e) => setHomeCounty(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2 text-[13px]"
                />
              </label>
              <label className="block text-[12.5px] font-medium text-[#6b6b6b]">
                Home postcode / ZIP
                <input
                  type="text"
                  value={homePostcode}
                  onChange={(e) => setHomePostcode(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2 text-[13px]"
                />
              </label>
              <label className="block text-[12.5px] font-medium text-[#6b6b6b]">
                Home country
                <input
                  type="text"
                  value={homeCountry}
                  onChange={(e) => setHomeCountry(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2 text-[13px]"
                />
              </label>
              <label className="block text-[12.5px] font-medium text-[#6b6b6b]">
                Emergency contact name
                <input
                  type="text"
                  value={emergencyContactName}
                  onChange={(e) => setEmergencyContactName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2 text-[13px]"
                />
              </label>
              <label className="block text-[12.5px] font-medium text-[#6b6b6b]">
                Emergency contact relationship
                <input
                  type="text"
                  value={emergencyContactRelationship}
                  onChange={(e) => setEmergencyContactRelationship(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2 text-[13px]"
                />
              </label>
              <label className="block text-[12.5px] font-medium text-[#6b6b6b]">
                Emergency contact phone
                <input
                  type="text"
                  value={emergencyContactPhone}
                  onChange={(e) => setEmergencyContactPhone(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2 text-[13px]"
                />
              </label>
              <label className="block text-[12.5px] font-medium text-[#6b6b6b]">
                Emergency contact email
                <input
                  type="email"
                  value={emergencyContactEmail}
                  onChange={(e) => setEmergencyContactEmail(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2 text-[13px]"
                />
              </label>
              <label className="block text-[12.5px] font-medium text-[#6b6b6b]">
                Linked application (hired from)
                <select
                  value={hiredFromApp}
                  onChange={(e) => setHiredFromApp(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2 text-[13px]"
                >
                  <option value="">None</option>
                  {applications.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.candidate_name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="mt-6 border-t border-[#ececec] pt-4">
              <h3 className="text-[13px] font-semibold text-[#121212]">Custom fields</h3>
              <p className="mt-1 text-[12px] text-[#9b9b9b]">
                Add any labels your organisation uses (e.g. cost centre, payroll ID). Stored as
                key–value pairs.
              </p>
              <ul className="mt-3 space-y-2">
                {customFieldRows.map((row, i) => (
                  <li key={i} className="flex flex-wrap gap-2 sm:flex-nowrap">
                    <input
                      type="text"
                      value={row.key}
                      onChange={(e) => {
                        const next = [...customFieldRows];
                        next[i] = { ...next[i]!, key: e.target.value };
                        setCustomFieldRows(next);
                      }}
                      placeholder="Field name"
                      className="min-w-[140px] flex-1 rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2 text-[13px]"
                    />
                    <input
                      type="text"
                      value={row.value}
                      onChange={(e) => {
                        const next = [...customFieldRows];
                        next[i] = { ...next[i]!, value: e.target.value };
                        setCustomFieldRows(next);
                      }}
                      placeholder="Value"
                      className="min-w-[160px] flex-[2] rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2 text-[13px]"
                    />
                    <button
                      type="button"
                      className="rounded-lg border border-[#d8d8d8] px-2 py-1 text-[12px] text-[#6b6b6b]"
                      onClick={() => setCustomFieldRows(customFieldRows.filter((_, j) => j !== i))}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                className="mt-2 text-[12px] font-medium text-[#6b6b6b] underline underline-offset-2"
                onClick={() => setCustomFieldRows([...customFieldRows, { key: '', value: '' }])}
              >
                Add field
              </button>
            </div>
            <label className="mt-4 block text-[12.5px] font-medium text-[#6b6b6b]">
              Private HR notes
              <textarea
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2 text-[13px]"
                placeholder="Visible only to HR managers."
              />
            </label>
            <div className="mt-5 flex gap-3">
              <button
                type="submit"
                disabled={busy}
                className="rounded-lg bg-[#121212] px-4 py-2 text-[13px] font-medium text-[#faf9f6] disabled:opacity-50"
              >
                {busy ? 'Saving…' : 'Save record'}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={cancelEdit}
                className="rounded-lg border border-[#d8d8d8] bg-white px-4 py-2 text-[13px] font-medium text-[#6b6b6b] hover:bg-[#f5f4f1] disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <section className="mt-6 rounded-xl border border-[#d8d8d8] bg-white p-5">
            <h2 className="text-[15px] font-semibold text-[#121212]">HR record</h2>
            {!employee.hr_record_id ? (
              <p className="mt-2 text-[13px] text-[#9b9b9b]">
                No HR record yet.
                {canManage ? ' Use "Create HR record" above to add one.' : ''}
              </p>
            ) : (
              <>
                <dl className="mt-4 grid gap-x-6 gap-y-3 text-[13px] sm:grid-cols-2">
                  <div>
                    <dt className="text-[11.5px] font-medium uppercase tracking-wide text-[#9b9b9b]">
                      Job title
                    </dt>
                    <dd className="mt-0.5 text-[#121212]">{employee.job_title || '—'}</dd>
                  </div>
                  {canViewGrading ? (
                    <div>
                      <dt className="text-[11.5px] font-medium uppercase tracking-wide text-[#9b9b9b]">
                        Grade
                      </dt>
                      <dd className="mt-0.5 text-[#121212]">{employee.grade_level || '—'}</dd>
                    </div>
                  ) : null}
                  <div>
                    <dt className="text-[11.5px] font-medium uppercase tracking-wide text-[#9b9b9b]">
                      Contract
                    </dt>
                    <dd className="mt-0.5 text-[#121212]">
                      {contractLabel(employee.contract_type ?? '')}
                      {employee.fte && employee.fte < 1
                        ? ` · ${Math.round(employee.fte * 100)}% FTE`
                        : ''}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11.5px] font-medium uppercase tracking-wide text-[#9b9b9b]">
                      Salary band
                    </dt>
                    <dd className="mt-0.5 text-[#121212]">{employee.salary_band || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-[11.5px] font-medium uppercase tracking-wide text-[#9b9b9b]">
                      Location
                    </dt>
                    <dd className="mt-0.5 text-[#121212]">
                      {locationLabel(employee.work_location ?? '')}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11.5px] font-medium uppercase tracking-wide text-[#9b9b9b]">
                      Notice period
                    </dt>
                    <dd className="mt-0.5 text-[#121212]">
                      {employee.notice_period_weeks !== null &&
                      employee.notice_period_weeks !== undefined
                        ? `${employee.notice_period_weeks} week${employee.notice_period_weeks === 1 ? '' : 's'}`
                        : '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11.5px] font-medium uppercase tracking-wide text-[#9b9b9b]">
                      Start date
                    </dt>
                    <dd className="mt-0.5 text-[#121212]">
                      {employee.employment_start_date ?? '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11.5px] font-medium uppercase tracking-wide text-[#9b9b9b]">
                      Length of service
                    </dt>
                    <dd className="mt-0.5 text-[#121212]">
                      {employee.length_of_service_years != null &&
                      employee.length_of_service_months != null
                        ? `${employee.length_of_service_years} years, ${employee.length_of_service_months} months (from employment start)`
                        : '—'}
                    </dd>
                  </div>
                  {canViewGrading ? (
                    <div>
                      <dt className="text-[11.5px] font-medium uppercase tracking-wide text-[#9b9b9b]">
                        Pay grade
                      </dt>
                      <dd className="mt-0.5 text-[#121212]">{employee.pay_grade || '—'}</dd>
                    </div>
                  ) : null}
                  <div>
                    <dt className="text-[11.5px] font-medium uppercase tracking-wide text-[#9b9b9b]">
                      Position type
                    </dt>
                    <dd className="mt-0.5 text-[#121212]">{employee.position_type || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-[11.5px] font-medium uppercase tracking-wide text-[#9b9b9b]">
                      Employment basis
                    </dt>
                    <dd className="mt-0.5 text-[#121212]">{employee.employment_basis || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-[11.5px] font-medium uppercase tracking-wide text-[#9b9b9b]">
                      Weekly hours
                    </dt>
                    <dd className="mt-0.5 text-[#121212]">
                      {employee.weekly_hours != null ? `${employee.weekly_hours}` : '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11.5px] font-medium uppercase tracking-wide text-[#9b9b9b]">
                      Pay frequency
                    </dt>
                    <dd className="mt-0.5 text-[#121212]">
                      {payFrequencyLabel(employee.pay_frequency ?? 'monthly')}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11.5px] font-medium uppercase tracking-wide text-[#9b9b9b]">
                      Contracted days / week
                    </dt>
                    <dd className="mt-0.5 text-[#121212]">
                      {employee.contracted_days_per_week != null
                        ? String(employee.contracted_days_per_week)
                        : '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11.5px] font-medium uppercase tracking-wide text-[#9b9b9b]">
                      AWE (£/week)
                    </dt>
                    <dd className="mt-0.5 text-[#121212]">
                      {employee.average_weekly_earnings_gbp != null
                        ? `£${Number(employee.average_weekly_earnings_gbp).toFixed(2)}`
                        : '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11.5px] font-medium uppercase tracking-wide text-[#9b9b9b]">
                      Timesheet clock
                    </dt>
                    <dd className="mt-0.5 text-[#121212]">
                      {employee.timesheet_clock_enabled ? 'Enabled' : 'Off'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11.5px] font-medium uppercase tracking-wide text-[#9b9b9b]">
                      Hourly pay
                    </dt>
                    <dd className="mt-0.5 text-[#121212]">
                      {employee.hourly_pay_gbp != null
                        ? `£${Number(employee.hourly_pay_gbp).toFixed(4)}`
                        : '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11.5px] font-medium uppercase tracking-wide text-[#9b9b9b]">
                      Annual leave entitlement
                    </dt>
                    <dd className="mt-0.5 text-[#121212]">
                      {employee.annual_leave_entitlement_exempt
                        ? 'Not eligible (no paid annual leave)'
                        : 'Standard'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11.5px] font-medium uppercase tracking-wide text-[#9b9b9b]">
                      No. of positions
                    </dt>
                    <dd className="mt-0.5 text-[#121212]">
                      {employee.positions_count != null ? String(employee.positions_count) : '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11.5px] font-medium uppercase tracking-wide text-[#9b9b9b]">
                      Budget
                    </dt>
                    <dd className="mt-0.5 text-[#121212]">
                      {employee.budget_amount != null
                        ? `${employee.budget_amount}${employee.budget_currency ? ` ${employee.budget_currency}` : ''}`
                        : '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11.5px] font-medium uppercase tracking-wide text-[#9b9b9b]">
                      Dept. start
                    </dt>
                    <dd className="mt-0.5 text-[#121212]">
                      {employee.department_start_date ?? '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11.5px] font-medium uppercase tracking-wide text-[#9b9b9b]">
                      Continuous employment
                    </dt>
                    <dd className="mt-0.5 text-[#121212]">
                      {employee.continuous_employment_start_date ?? '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11.5px] font-medium uppercase tracking-wide text-[#9b9b9b]">
                      Contract start
                    </dt>
                    <dd className="mt-0.5 text-[#121212]">{employee.contract_start_date ?? '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-[11.5px] font-medium uppercase tracking-wide text-[#9b9b9b]">
                      Contract end
                    </dt>
                    <dd className="mt-0.5 text-[#121212]">{employee.contract_end_date ?? '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-[11.5px] font-medium uppercase tracking-wide text-[#9b9b9b]">
                      Contract signed
                    </dt>
                    <dd className="mt-0.5 text-[#121212]">{employee.contract_signed_on ?? '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-[11.5px] font-medium uppercase tracking-wide text-[#9b9b9b]">
                      Contract review
                    </dt>
                    <dd className="mt-0.5 text-[#121212]">
                      {employee.contract_review_date ?? '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[11.5px] font-medium uppercase tracking-wide text-[#9b9b9b]">
                      RTW status
                    </dt>
                    <dd className="mt-0.5 text-[#121212]">{employee.rtw_status || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-[11.5px] font-medium uppercase tracking-wide text-[#9b9b9b]">
                      RTW checked
                    </dt>
                    <dd className="mt-0.5 text-[#121212]">{employee.rtw_checked_on ?? '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-[11.5px] font-medium uppercase tracking-wide text-[#9b9b9b]">
                      RTW expiry
                    </dt>
                    <dd className="mt-0.5 text-[#121212]">{employee.rtw_expiry_date ?? '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-[11.5px] font-medium uppercase tracking-wide text-[#9b9b9b]">
                      Visa type
                    </dt>
                    <dd className="mt-0.5 text-[#121212]">{employee.visa_type || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-[11.5px] font-medium uppercase tracking-wide text-[#9b9b9b]">
                      Probation end
                    </dt>
                    <dd className="mt-0.5">
                      {employee.probation_end_date ? (
                        <span
                          className={onProbation ? 'font-medium text-[#c2410c]' : 'text-[#121212]'}
                        >
                          {employee.probation_end_date}
                          {onProbation ? ' (active)' : ' (passed)'}
                        </span>
                      ) : (
                        '—'
                      )}
                      {employee.probation_check_completed_at ? (
                        <p className="mt-1 text-[12px] text-[#166534]">
                          Probation review recorded
                          {employee.probation_check_completed_at.includes('T')
                            ? ` · ${employee.probation_check_completed_at.slice(0, 10)}`
                            : ''}
                        </p>
                      ) : null}
                      {canMarkProbationCheck && employee.probation_end_date && !editing ? (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {!employee.probation_check_completed_at ? (
                            <button
                              type="button"
                              disabled={probationBusy}
                              onClick={() => void markProbationComplete(false)}
                              className="rounded-lg border border-[#d8d8d8] bg-white px-2.5 py-1 text-[12px] font-medium text-[#121212] hover:bg-[#fafafa] disabled:opacity-60"
                            >
                              {probationBusy ? 'Saving…' : 'Mark probation review complete'}
                            </button>
                          ) : canManage ? (
                            <button
                              type="button"
                              disabled={probationBusy}
                              onClick={() => void markProbationComplete(true)}
                              className="rounded-lg border border-[#fecaca] bg-white px-2.5 py-1 text-[12px] text-[#991b1b] hover:bg-[#fef2f2] disabled:opacity-60"
                            >
                              Clear completion (HR)
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </dd>
                  </div>
                </dl>
                {employee.contract_document_url ? (
                  <p className="mt-4 text-[12px] text-[#6b6b6b]">
                    Contract document:{' '}
                    <a
                      href={employee.contract_document_url}
                      target="_blank"
                      rel="noreferrer"
                      className="underline underline-offset-2 hover:text-[#121212]"
                    >
                      Open link
                    </a>
                  </p>
                ) : null}
                {employee.custom_fields &&
                typeof employee.custom_fields === 'object' &&
                !Array.isArray(employee.custom_fields) &&
                Object.keys(employee.custom_fields).length > 0 ? (
                  <div className="mt-4 rounded-lg border border-[#ececec] bg-[#faf9f6] p-3">
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#9b9b9b]">
                      Custom fields
                    </p>
                    <dl className="grid gap-2 text-[13px] sm:grid-cols-2">
                      {Object.entries(employee.custom_fields as Record<string, unknown>).map(
                        ([k, v]) => (
                          <div key={k}>
                            <dt className="text-[11px] text-[#9b9b9b]">{k}</dt>
                            <dd className="text-[#121212]">{v == null ? '—' : String(v)}</dd>
                          </div>
                        )
                      )}
                    </dl>
                  </div>
                ) : null}
                {employee.notes ? (
                  <div className="mt-4 rounded-lg border border-[#ececec] bg-[#faf9f6] p-3 text-[13px] text-[#4a4a4a]">
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[#9b9b9b]">
                      HR notes
                    </p>
                    <p className="whitespace-pre-wrap">{employee.notes}</p>
                  </div>
                ) : null}
                {employee.hired_from_application_id ? (
                  <p className="mt-3 text-[12px] text-[#6b6b6b]">
                    Hired via platform ·{' '}
                    <Link
                      href="/hr/applications"
                      className="underline underline-offset-2 hover:text-[#121212]"
                    >
                      View application
                    </Link>
                  </p>
                ) : null}
                <p className="mt-3 text-[11.5px] text-[#c8c8c8]">
                  Last updated{' '}
                  {employee.record_updated_at ? formatDateStable(employee.record_updated_at) : '—'}
                </p>
              </>
            )}
          </section>
        ))}

      {/* Emergency tab */}
      {activeTab === 'emergency' && (
        <div className="mt-6 space-y-4">
          {employee.emergency_contact_name ||
          employee.emergency_contact_relationship ||
          employee.emergency_contact_phone ||
          employee.emergency_contact_email ? (
            <div className="rounded-xl border border-[#e8e8e8] bg-white p-5">
              <h2 className="text-[14px] font-semibold text-[#121212]">Emergency contact</h2>
              <dl className="mt-3 grid gap-x-8 gap-y-3 text-[13px] sm:grid-cols-2">
                <div>
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-[#9b9b9b]">
                    Name
                  </dt>
                  <dd className="mt-1 text-[#121212]">
                    {employee.emergency_contact_name || '—'}
                    {employee.emergency_contact_relationship
                      ? ` (${employee.emergency_contact_relationship})`
                      : ''}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-[#9b9b9b]">
                    Phone
                  </dt>
                  <dd className="mt-1 text-[#121212]">{employee.emergency_contact_phone || '—'}</dd>
                </div>
                {employee.emergency_contact_email ? (
                  <div>
                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-[#9b9b9b]">
                      Email
                    </dt>
                    <dd className="mt-1 text-[#121212]">{employee.emergency_contact_email}</dd>
                  </div>
                ) : null}
              </dl>
            </div>
          ) : null}
          {employee.home_address_line1 ||
          employee.home_address_line2 ||
          employee.home_city ||
          employee.home_county ||
          employee.home_postcode ||
          employee.home_country ? (
            <div className="rounded-xl border border-[#e8e8e8] bg-white p-5">
              <h2 className="text-[14px] font-semibold text-[#121212]">Home address</h2>
              <address className="mt-3 not-italic text-[13px] text-[#4a4a4a] leading-relaxed">
                <p>{employee.home_address_line1 || '—'}</p>
                {employee.home_address_line2 ? <p>{employee.home_address_line2}</p> : null}
                <p>
                  {[employee.home_city, employee.home_county].filter(Boolean).join(', ') || '—'}
                </p>
                <p>
                  {[employee.home_postcode, employee.home_country].filter(Boolean).join(', ') ||
                    '—'}
                </p>
              </address>
            </div>
          ) : null}
          {!employee.emergency_contact_name &&
          !employee.emergency_contact_phone &&
          !employee.home_address_line1 ? (
            <p className="rounded-xl border border-[#e8e8e8] bg-white p-5 text-[13px] text-[#9b9b9b]">
              No emergency contact or home address on record.
              {canManage ? ' Edit the HR record (Job tab) to add this information.' : ''}
            </p>
          ) : null}
        </div>
      )}

      {/* Documents & evidence */}
      {activeTab === 'documents' && (
        <>
          <section className="mt-6 rounded-xl border border-[#d8d8d8] bg-white p-5">
            <h2 className="text-[15px] font-semibold text-[#121212]">Documents &amp; evidence</h2>
            <p className="mt-1 text-[12px] text-[#9b9b9b]">
              Private files for this employee, including sensitive photo and identity records. PDF,
              images, Word, or Excel — max 20 MB each.
            </p>
            {canManage || canManageEmployeePhotos || canManageIdDocuments ? (
              <div className="mt-4 flex flex-wrap items-end gap-3 rounded-lg border border-[#ececec] bg-[#faf9f6] p-3">
                <label className="block min-w-[160px] text-[12.5px] font-medium text-[#6b6b6b]">
                  Category
                  <select
                    value={docCategory}
                    onChange={(e) => setDocCategory(e.target.value)}
                    disabled={docBusy}
                    className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px]"
                  >
                    <option value="right_to_work">Right to work</option>
                    <option value="passport">Passport / ID</option>
                    <option value="contract">Contract</option>
                    <option value="signed_other">Signed document</option>
                    <option value="other">Other</option>
                    <option value="employee_photo">Employee photo</option>
                    <option value="id_document">ID document</option>
                  </select>
                </label>
                <label className="block min-w-[180px] flex-1 text-[12.5px] font-medium text-[#6b6b6b]">
                  Label (optional)
                  <input
                    type="text"
                    value={docLabel}
                    onChange={(e) => setDocLabel(e.target.value)}
                    disabled={docBusy}
                    placeholder="e.g. 2026 visa scan"
                    className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px]"
                  />
                </label>
                {docCategory === 'other' ? (
                  <label className="block min-w-[220px] text-[12.5px] font-medium text-[#6b6b6b]">
                    Custom category
                    <select
                      value={selectedCustomCategoryId}
                      onChange={(e) => setSelectedCustomCategoryId(e.target.value)}
                      disabled={docBusy}
                      className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px]"
                    >
                      <option value="">No custom category</option>
                      {customCategories
                        .filter(
                          (c) =>
                            c.document_kind_scope === 'supporting_document' ||
                            c.document_kind_scope === 'any'
                        )
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                    </select>
                  </label>
                ) : null}
                {docCategory === 'other' && canManage ? (
                  <div className="flex min-w-[260px] flex-1 items-end gap-2">
                    <label className="block flex-1 text-[12.5px] font-medium text-[#6b6b6b]">
                      Add category
                      <input
                        type="text"
                        value={newCustomCategoryName}
                        onChange={(e) => setNewCustomCategoryName(e.target.value)}
                        disabled={docBusy}
                        placeholder="e.g. Right to work share code"
                        className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px]"
                      />
                    </label>
                    <button
                      type="button"
                      disabled={docBusy || !newCustomCategoryName.trim()}
                      onClick={() => void createCustomCategory()}
                      className="rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[12.5px] text-[#121212] hover:bg-[#fafafa] disabled:opacity-50"
                    >
                      Save
                    </button>
                  </div>
                ) : null}
                {docCategory === 'id_document' ? (
                  <>
                    <label className="block min-w-[140px] text-[12.5px] font-medium text-[#6b6b6b]">
                      ID type
                      <input
                        type="text"
                        value={idDocumentType}
                        onChange={(e) => setIdDocumentType(e.target.value)}
                        disabled={docBusy}
                        placeholder="Passport, national ID, licence..."
                        className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px]"
                      />
                    </label>
                    <label className="block min-w-[120px] text-[12.5px] font-medium text-[#6b6b6b]">
                      ID number
                      <input
                        type="text"
                        value={idNumber}
                        onChange={(e) => setIdNumber(e.target.value)}
                        disabled={docBusy}
                        placeholder="Stored as last 4 only"
                        className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px]"
                      />
                    </label>
                    <label className="block min-w-[140px] text-[12.5px] font-medium text-[#6b6b6b]">
                      Expiry date
                      <input
                        type="date"
                        value={idExpiryDate}
                        onChange={(e) => setIdExpiryDate(e.target.value)}
                        disabled={docBusy}
                        className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px]"
                      />
                    </label>
                  </>
                ) : null}
                <label className="inline-flex cursor-pointer items-center rounded-lg bg-[#121212] px-4 py-2 text-[13px] font-medium text-[#faf9f6] disabled:opacity-50">
                  <input
                    type="file"
                    className="sr-only"
                    disabled={docBusy || !canUploadCurrentCategory}
                    accept={
                      docCategory === 'employee_photo'
                        ? 'image/*'
                        : docCategory === 'id_document'
                          ? '.pdf,image/*'
                          : '.pdf,.doc,.docx,.xls,.xlsx,image/*'
                    }
                    onChange={onDocFileChange}
                  />
                  {docBusy
                    ? 'Uploading…'
                    : canUploadCurrentCategory
                      ? 'Choose file'
                      : 'No upload permission'}
                </label>
              </div>
            ) : null}
            {visibleDocuments.length === 0 ? (
              <p className="mt-4 text-[13px] text-[#9b9b9b]">No documents uploaded yet.</p>
            ) : (
              <ul className="mt-4 divide-y divide-[#ececec] rounded-lg border border-[#ececec]">
                {visibleDocuments.map((d) => (
                  <li
                    key={d.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-3 py-3 text-[13px]"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-[#121212]">
                        {d.custom_category_name || categoryLabel(d.category)}
                        {d.label ? (
                          <span className="font-normal text-[#6b6b6b]"> · {d.label}</span>
                        ) : null}
                        {!d.is_current ? (
                          <span className="ml-1 rounded bg-[#f3f3f3] px-1.5 py-0.5 text-[10.5px] text-[#6b6b6b]">
                            Superseded
                          </span>
                        ) : null}
                      </p>
                      <p className="mt-0.5 truncate text-[12px] text-[#6b6b6b]">
                        {d.file_name} · {formatFileSize(d.byte_size)}
                      </p>
                      {d.document_kind === 'id_document' ? (
                        <p className="mt-0.5 text-[11px] text-[#9b9b9b]">
                          {d.id_document_type ? `${d.id_document_type}` : 'ID document'}
                          {d.id_number_last4 ? ` · ****${d.id_number_last4}` : ''}
                          {d.expires_on ? ` · Expires ${d.expires_on}` : ''}
                        </p>
                      ) : null}
                      <p className="mt-0.5 text-[11px] text-[#9b9b9b]">
                        {d.uploader_name} · {formatDateTimeStable(d.created_at)}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => void downloadHrDocument(d)}
                        className="rounded-lg border border-[#d8d8d8] bg-white px-3 py-1.5 text-[12.5px] font-medium text-[#121212] hover:bg-[#fafafa]"
                      >
                        Open
                      </button>
                      {(d.document_kind === 'employee_photo' && canManageEmployeePhotos) ||
                      (d.document_kind === 'id_document' && canManageIdDocuments) ||
                      (d.document_kind === 'supporting_document' && canManage) ? (
                        <button
                          type="button"
                          disabled={docBusy}
                          onClick={() => void deleteHrDocument(d)}
                          className="rounded-lg border border-[#fecaca] bg-white px-3 py-1.5 text-[12.5px] text-[#991b1b] hover:bg-[#fef2f2] disabled:opacity-50"
                        >
                          Remove
                        </button>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <DependantsEditorClient
            title="Dependants & beneficiaries"
            subjectUserId={employee.user_id}
            initialDependants={initialDependants}
            canEdit={canManage}
          />
        </>
      )}

      {/* Leave tab */}
      {activeTab === 'leave' && (
        <div className="mt-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[15px] font-semibold text-[#121212]">
              Leave ({leaveEntitlementYearLabel})
            </h2>
            <div className="flex flex-wrap gap-3">
              {showAbsenceReportingLink ? (
                <Link
                  href="/hr/absence-reporting"
                  className="text-[12px] text-[#6b6b6b] underline underline-offset-2 hover:text-[#121212]"
                >
                  Absence reporting
                </Link>
              ) : null}
              <Link
                href="/hr/leave"
                className="text-[12px] text-[#6b6b6b] underline underline-offset-2 hover:text-[#121212]"
              >
                Manage allowances
              </Link>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-[#e8e8e8] bg-white p-5">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-[#9b9b9b]">
                Annual entitlement
              </p>
              <p className="mt-2 text-[34px] font-bold leading-none tracking-tight text-[#121212]">
                {employee.annual_leave_entitlement_exempt
                  ? '—'
                  : leaveAllowance
                    ? leaveAllowance.annual_entitlement_days
                    : '—'}
              </p>
              <p className="mt-1.5 text-[12px] text-[#9b9b9b]">
                {employee.annual_leave_entitlement_exempt
                  ? 'Not eligible for paid annual leave'
                  : 'days / year'}
              </p>
            </div>
            <div className="rounded-2xl border border-[#e8e8e8] bg-white p-5">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-[#9b9b9b]">
                TOIL balance
              </p>
              <p className="mt-2 text-[34px] font-bold leading-none tracking-tight text-[#121212]">
                {leaveAllowance ? leaveAllowance.toil_balance_days : '—'}
              </p>
              <p className="mt-1.5 text-[12px] text-[#9b9b9b]">days remaining</p>
            </div>
            <div
              className={[
                'rounded-2xl border p-5',
                absenceScore && absenceScore.bradford_score >= BRADFORD_ALERT_THRESHOLD
                  ? 'border-[#fecaca] bg-[#fef2f2]'
                  : 'border-[#e8e8e8] bg-white',
              ].join(' ')}
            >
              <p className="text-[11px] font-semibold uppercase tracking-widest text-[#9b9b9b]">
                Absence score (Bradford)
              </p>
              <p
                className={[
                  'mt-2 text-[34px] font-bold leading-none tracking-tight',
                  absenceScore && absenceScore.bradford_score >= BRADFORD_ALERT_THRESHOLD
                    ? 'text-[#b91c1c]'
                    : 'text-[#121212]',
                ].join(' ')}
              >
                {absenceScore ? absenceScore.bradford_score : '—'}
              </p>
              {absenceScore ? (
                <p className="mt-1.5 text-[12px] text-[#9b9b9b]">
                  {absenceScore.spell_count} spell{absenceScore.spell_count === 1 ? '' : 's'} ·{' '}
                  {absenceScore.total_days} day{absenceScore.total_days === 1 ? '' : 's'}
                </p>
              ) : (
                <p className="mt-1.5 text-[12px] text-[#9b9b9b]">No absences recorded</p>
              )}
            </div>
          </div>
          {canManage && absenceScore && absenceScore.bradford_score >= BRADFORD_ALERT_THRESHOLD ? (
            <div className="mt-4 rounded-lg border border-[#fecaca] bg-[#fef2f2] px-3 py-2 text-[12.5px] text-[#b91c1c]">
              <strong>HR warning:</strong> Bradford score is {absenceScore.bradford_score}{' '}
              (threshold {BRADFORD_ALERT_THRESHOLD}). Please review this employee&apos;s leave and
              sickness history.
            </div>
          ) : null}
        </div>
      )}

      {/* Audit tab */}
      {activeTab === 'payroll' && payrollPanel ? payrollPanel : null}

      {activeTab === 'tax' && taxPanel ? taxPanel : null}

      {activeTab === 'history' && historyPanel ? historyPanel : null}

      {activeTab === 'cases' && casesPanel ? casesPanel : null}

      {activeTab === 'medical' && medicalPanel ? medicalPanel : null}

      {activeTab === 'custom' && customFieldsPanel ? customFieldsPanel : null}

      {activeTab === 'audit' && (
        <div className="mt-6">
          {auditEvents.length > 0 ? (
            <section className="rounded-xl border border-[#e8e8e8] bg-white p-5">
              <h2 className="text-[15px] font-semibold text-[#121212]">Change history</h2>
              <ul className="mt-3 divide-y divide-[#ececec]">
                {auditEvents.map((ev) => (
                  <li key={ev.id} className="py-2.5 text-[12.5px]">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <span className="font-medium text-[#121212]">
                          {fieldLabel(ev.field_name)}
                        </span>
                        {ev.field_name !== 'record' ? (
                          <>
                            <span className="mx-1 text-[#9b9b9b]">·</span>
                            <span className="text-[#6b6b6b]">
                              {fmt(ev.old_value)} → {fmt(ev.new_value)}
                            </span>
                          </>
                        ) : (
                          <span className="ml-1 text-[#6b6b6b]">created</span>
                        )}
                      </div>
                      <div className="shrink-0 text-right text-[11.5px] text-[#9b9b9b]">
                        <div>{ev.changer_name}</div>
                        <div>{formatDateStable(ev.created_at)}</div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ) : (
            <p className="rounded-xl border border-[#e8e8e8] bg-white p-5 text-[13px] text-[#9b9b9b]">
              No audit events recorded yet.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
