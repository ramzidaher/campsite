'use client';

import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

const MIN_PENDING_MS = 450;

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
};

type AuditEvent = {
  id: string;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
  changer_name: string;
};

function contractLabel(ct: string) {
  switch (ct) {
    case 'full_time': return 'Full-time';
    case 'part_time': return 'Part-time';
    case 'contractor': return 'Contractor';
    case 'zero_hours': return 'Zero hours';
    default: return ct;
  }
}

function locationLabel(wl: string) {
  switch (wl) {
    case 'office': return 'Office';
    case 'remote': return 'Remote';
    case 'hybrid': return 'Hybrid';
    default: return wl;
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

function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

function fmt(v: string | null) {
  if (!v || v === 'null') return '—';
  if (v === 'created') return 'Record created';
  return v;
}

export function EmployeeHRFileClient({
  orgId: _orgId,
  canManage,
  employee,
  auditEvents,
  leaveAllowance,
  absenceScore,
  applications,
}: {
  orgId: string;
  canManage: boolean;
  employee: Employee;
  auditEvents: AuditEvent[];
  leaveAllowance: { annual_entitlement_days: number; toil_balance_days: number } | null;
  absenceScore: { spell_count: number; total_days: number; bradford_score: number } | null;
  applications: { id: string; candidate_name: string; job_listing_id: string }[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
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
      : '',
  );
  const [hiredFromApp, setHiredFromApp] = useState(employee.hired_from_application_id ?? '');
  const [notes, setNotes] = useState(employee.notes ?? '');
  const [positionType, setPositionType] = useState(employee.position_type ?? '');
  const [payGrade, setPayGrade] = useState(employee.pay_grade ?? '');
  const [employmentBasis, setEmploymentBasis] = useState(employee.employment_basis ?? '');
  const [weeklyHours, setWeeklyHours] = useState(
    employee.weekly_hours != null ? String(employee.weekly_hours) : '',
  );
  const [positionsCount, setPositionsCount] = useState(
    employee.positions_count != null ? String(employee.positions_count) : '1',
  );
  const [budgetAmount, setBudgetAmount] = useState(
    employee.budget_amount != null ? String(employee.budget_amount) : '',
  );
  const [budgetCurrency, setBudgetCurrency] = useState(employee.budget_currency ?? '');
  const [departmentStart, setDepartmentStart] = useState(employee.department_start_date ?? '');
  const [continuousEmploymentStart, setContinuousEmploymentStart] = useState(
    employee.continuous_employment_start_date ?? '',
  );
  const [customFieldRows, setCustomFieldRows] = useState<CustomFieldRow[]>(() =>
    customFieldRowsFromEmployee(employee.custom_fields),
  );

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
      emp.notice_period_weeks !== null && emp.notice_period_weeks !== undefined ? String(emp.notice_period_weeks) : '',
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
        : '',
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
      })
    );
    const error = (response as { error: { message: string } | null }).error;
    setBusy(false);
    if (error) {
      setMsg({ type: 'error', text: error.message });
      return;
    }
    setEditing(false);
    setMsg({ type: 'success', text: 'HR record saved.' });
    router.refresh();
  }

  const today = new Date().toISOString().slice(0, 10);
  const onProbation = employee.probation_end_date && employee.probation_end_date >= today;

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-7">
      {/* Back */}
      <Link
        href="/hr/records"
        className="text-[12.5px] text-[#6b6b6b] underline underline-offset-2 hover:text-[#121212]"
      >
        ← Employee records
      </Link>

      {/* Header */}
      <div className="mt-4 flex items-start gap-4">
        {employee.avatar_url ? (
          <img
            src={employee.avatar_url}
            alt=""
            className="h-14 w-14 shrink-0 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#e8e4dc] text-[16px] font-bold text-[#6b6b6b]">
            {initials(employee.full_name)}
          </div>
        )}
        <div className="flex-1">
          <h1 className="font-authSerif text-[26px] leading-tight tracking-[-0.03em] text-[#121212]">
            {employee.full_name}
          </h1>
          <p className="mt-0.5 text-[13px] text-[#6b6b6b]">
            {employee.email ?? ''}
            {employee.department_names.length > 0
              ? ` · ${employee.department_names.join(', ')}`
              : ''}
          </p>
          {employee.reports_to_name ? (
            <p className="mt-0.5 text-[12px] text-[#9b9b9b]">
              Line manager: {employee.reports_to_name}
            </p>
          ) : null}
        </div>
        {canManage && !editing ? (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="mt-1 rounded-lg border border-[#d8d8d8] bg-white px-3 py-1.5 text-[12.5px] font-medium text-[#6b6b6b] hover:bg-[#f5f4f1]"
          >
            {employee.hr_record_id ? 'Edit record' : 'Create HR record'}
          </button>
        ) : null}
      </div>

      {msg ? (
        <p
          className={[
            'mt-4 rounded-lg px-3 py-2 text-[13px]',
            msg.type === 'error'
              ? 'border border-[#fecaca] bg-[#fef2f2] text-[#b91c1c]'
              : 'border border-[#86efac] bg-[#f0fdf4] text-[#166534]',
          ].join(' ')}
        >
          {msg.text}
        </p>
      ) : null}

      {/* HR record — view or edit */}
      {editing ? (
        <form className="mt-6 rounded-xl border border-[#d8d8d8] bg-white p-5" onSubmit={(e) => void save(e)}>
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
              Add any labels your organisation uses (e.g. cost centre, payroll ID). Stored as key–value pairs.
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
                  <dt className="text-[11.5px] font-medium uppercase tracking-wide text-[#9b9b9b]">Job title</dt>
                  <dd className="mt-0.5 text-[#121212]">{employee.job_title || '—'}</dd>
                </div>
                <div>
                  <dt className="text-[11.5px] font-medium uppercase tracking-wide text-[#9b9b9b]">Grade</dt>
                  <dd className="mt-0.5 text-[#121212]">{employee.grade_level || '—'}</dd>
                </div>
                <div>
                  <dt className="text-[11.5px] font-medium uppercase tracking-wide text-[#9b9b9b]">Contract</dt>
                  <dd className="mt-0.5 text-[#121212]">
                    {contractLabel(employee.contract_type ?? '')}
                    {employee.fte && employee.fte < 1
                      ? ` · ${Math.round(employee.fte * 100)}% FTE`
                      : ''}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11.5px] font-medium uppercase tracking-wide text-[#9b9b9b]">Salary band</dt>
                  <dd className="mt-0.5 text-[#121212]">{employee.salary_band || '—'}</dd>
                </div>
                <div>
                  <dt className="text-[11.5px] font-medium uppercase tracking-wide text-[#9b9b9b]">Location</dt>
                  <dd className="mt-0.5 text-[#121212]">{locationLabel(employee.work_location ?? '')}</dd>
                </div>
                <div>
                  <dt className="text-[11.5px] font-medium uppercase tracking-wide text-[#9b9b9b]">Notice period</dt>
                  <dd className="mt-0.5 text-[#121212]">
                    {employee.notice_period_weeks !== null && employee.notice_period_weeks !== undefined
                      ? `${employee.notice_period_weeks} week${employee.notice_period_weeks === 1 ? '' : 's'}`
                      : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11.5px] font-medium uppercase tracking-wide text-[#9b9b9b]">Start date</dt>
                  <dd className="mt-0.5 text-[#121212]">{employee.employment_start_date ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-[11.5px] font-medium uppercase tracking-wide text-[#9b9b9b]">Length of service</dt>
                  <dd className="mt-0.5 text-[#121212]">
                    {employee.length_of_service_years != null && employee.length_of_service_months != null
                      ? `${employee.length_of_service_years} years, ${employee.length_of_service_months} months (from employment start)`
                      : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11.5px] font-medium uppercase tracking-wide text-[#9b9b9b]">Pay grade</dt>
                  <dd className="mt-0.5 text-[#121212]">{employee.pay_grade || '—'}</dd>
                </div>
                <div>
                  <dt className="text-[11.5px] font-medium uppercase tracking-wide text-[#9b9b9b]">Position type</dt>
                  <dd className="mt-0.5 text-[#121212]">{employee.position_type || '—'}</dd>
                </div>
                <div>
                  <dt className="text-[11.5px] font-medium uppercase tracking-wide text-[#9b9b9b]">Employment basis</dt>
                  <dd className="mt-0.5 text-[#121212]">{employee.employment_basis || '—'}</dd>
                </div>
                <div>
                  <dt className="text-[11.5px] font-medium uppercase tracking-wide text-[#9b9b9b]">Weekly hours</dt>
                  <dd className="mt-0.5 text-[#121212]">
                    {employee.weekly_hours != null ? `${employee.weekly_hours}` : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11.5px] font-medium uppercase tracking-wide text-[#9b9b9b]">No. of positions</dt>
                  <dd className="mt-0.5 text-[#121212]">
                    {employee.positions_count != null ? String(employee.positions_count) : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11.5px] font-medium uppercase tracking-wide text-[#9b9b9b]">Budget</dt>
                  <dd className="mt-0.5 text-[#121212]">
                    {employee.budget_amount != null
                      ? `${employee.budget_amount}${employee.budget_currency ? ` ${employee.budget_currency}` : ''}`
                      : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11.5px] font-medium uppercase tracking-wide text-[#9b9b9b]">Dept. start</dt>
                  <dd className="mt-0.5 text-[#121212]">{employee.department_start_date ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-[11.5px] font-medium uppercase tracking-wide text-[#9b9b9b]">Continuous employment</dt>
                  <dd className="mt-0.5 text-[#121212]">{employee.continuous_employment_start_date ?? '—'}</dd>
                </div>
                <div>
                  <dt className="text-[11.5px] font-medium uppercase tracking-wide text-[#9b9b9b]">
                    Probation end
                  </dt>
                  <dd className="mt-0.5">
                    {employee.probation_end_date ? (
                      <span className={onProbation ? 'font-medium text-[#c2410c]' : 'text-[#121212]'}>
                        {employee.probation_end_date}
                        {onProbation ? ' (active)' : ' (passed)'}
                      </span>
                    ) : (
                      '—'
                    )}
                  </dd>
                </div>
              </dl>
              {employee.custom_fields &&
              typeof employee.custom_fields === 'object' &&
              !Array.isArray(employee.custom_fields) &&
              Object.keys(employee.custom_fields).length > 0 ? (
                <div className="mt-4 rounded-lg border border-[#ececec] bg-[#faf9f6] p-3">
                  <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#9b9b9b]">
                    Custom fields
                  </p>
                  <dl className="grid gap-2 text-[13px] sm:grid-cols-2">
                    {Object.entries(employee.custom_fields as Record<string, unknown>).map(([k, v]) => (
                      <div key={k}>
                        <dt className="text-[11px] text-[#9b9b9b]">{k}</dt>
                        <dd className="text-[#121212]">{v == null ? '—' : String(v)}</dd>
                      </div>
                    ))}
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
                Last updated {employee.record_updated_at ? new Date(employee.record_updated_at).toLocaleDateString() : '—'}
              </p>
            </>
          )}
        </section>
      )}

      {/* Leave & sickness summary */}
      <section className="mt-6 rounded-xl border border-[#d8d8d8] bg-white p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-semibold text-[#121212]">
            Leave ({new Date().getFullYear()})
          </h2>
          <Link
            href="/hr/leave"
            className="text-[12px] text-[#6b6b6b] underline underline-offset-2 hover:text-[#121212]"
          >
            Manage allowances
          </Link>
        </div>
        <div className="mt-3 grid gap-4 text-[13px] sm:grid-cols-3">
          <div>
            <p className="text-[11.5px] font-medium uppercase tracking-wide text-[#9b9b9b]">Annual entitlement</p>
            <p className="mt-0.5 text-[#121212]">
              {leaveAllowance ? `${leaveAllowance.annual_entitlement_days} days` : '—'}
            </p>
          </div>
          <div>
            <p className="text-[11.5px] font-medium uppercase tracking-wide text-[#9b9b9b]">TOIL balance</p>
            <p className="mt-0.5 text-[#121212]">
              {leaveAllowance ? `${leaveAllowance.toil_balance_days} days` : '—'}
            </p>
          </div>
          <div>
            <p className="text-[11.5px] font-medium uppercase tracking-wide text-[#9b9b9b]">Sickness absence score</p>
            {absenceScore ? (
              <p className="mt-0.5 text-[#121212]">
                {absenceScore.bradford_score}{' '}
                <span className="text-[11.5px] text-[#9b9b9b]">
                  ({absenceScore.spell_count} spell{absenceScore.spell_count === 1 ? '' : 's'} · {absenceScore.total_days} day{absenceScore.total_days === 1 ? '' : 's'})
                </span>
              </p>
            ) : (
              <p className="mt-0.5 text-[#9b9b9b]">—</p>
            )}
          </div>
        </div>
      </section>

      {/* Audit trail */}
      {auditEvents.length > 0 ? (
        <section className="mt-6 rounded-xl border border-[#d8d8d8] bg-white p-5">
          <h2 className="text-[15px] font-semibold text-[#121212]">Change history</h2>
          <ul className="mt-3 divide-y divide-[#ececec]">
            {auditEvents.map((ev) => (
              <li key={ev.id} className="py-2.5 text-[12.5px]">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <span className="font-medium text-[#121212]">{fieldLabel(ev.field_name)}</span>
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
                    <div>{new Date(ev.created_at).toLocaleDateString()}</div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
