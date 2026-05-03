'use client';

import { FormSelect } from '@campsite/ui/web';
import { Copy, Eye, Pencil, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import {
  createApplicationForm,
  deleteApplicationForms,
  duplicateApplicationForm,
} from '@/app/(main)/hr/hiring/application-forms/actions';

type LinkedJob = {
  id: string;
  title: string;
  grade: string | null;
  status: string | null;
  department: string | null;
};

type FormRow = {
  id: string;
  name: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  formJobTitle: string | null;
  formGrade: string | null;
  formDepartment: string | null;
  questionCount: number;
  linkedJobs: LinkedJob[];
};

function yearFromDate(value: string | null): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return String(d.getUTCFullYear());
}

function monthYear(value: string | null): string {
  if (!value) return '--/--';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '--/--';
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const yy = String(d.getUTCFullYear()).slice(-2);
  return `${mm}/${yy}`;
}

export function HiringApplicationFormsTableClient({ rows }: { rows: FormRow[] }) {
  const router = useRouter();
  const [search, setSearch] = useState('');
  const [yearFilter, setYearFilter] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [gradeFilter, setGradeFilter] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isPending, startTransition] = useTransition();

  const years = useMemo(() => {
    return [...new Set(rows.map((r) => yearFromDate(r.updatedAt)).filter(Boolean))].sort((a, b) => Number(b) - Number(a));
  }, [rows]);

  const roleOptions = useMemo(() => {
    const allTitles = rows.flatMap((r) => {
      const linked = r.linkedJobs.map((job) => (job.title ?? '').trim()).filter(Boolean);
      const formTitle = (r.formJobTitle ?? '').trim();
      return formTitle ? [formTitle, ...linked] : linked;
    });
    return [...new Set(allTitles)].sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const departmentOptions = useMemo(() => {
    const allDepts = rows.flatMap((r) => {
      const linked = r.linkedJobs.map((job) => (job.department ?? '').trim()).filter(Boolean);
      const formDept = (r.formDepartment ?? '').trim();
      return formDept ? [formDept, ...linked] : linked;
    });
    return [...new Set(allDepts)].sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const gradeOptions = useMemo(() => {
    const allGrades = rows.flatMap((r) => {
      const linked = r.linkedJobs.map((job) => (job.grade ?? '').trim()).filter(Boolean);
      const formGrade = (r.formGrade ?? '').trim();
      return formGrade ? [formGrade, ...linked] : linked;
    });
    return [...new Set(allGrades)].sort((a, b) => a.localeCompare(b));
  }, [rows]);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((form) => {
      const formName = (form.name ?? '').trim() || 'Untitled application form';
      const formTitle = (form.formJobTitle ?? '').trim();
      const formGrade = (form.formGrade ?? '').trim();
      const formDept = (form.formDepartment ?? '').trim();
      const jobTitles = form.linkedJobs.map((j) => (j.title ?? '').trim());
      const departments = form.linkedJobs.map((j) => (j.department ?? '').trim()).filter(Boolean);
      const grades = form.linkedJobs.map((j) => (j.grade ?? '').trim()).filter(Boolean);
      const formYear = yearFromDate(form.updatedAt);
      const effectiveJobTitles = formTitle ? [formTitle, ...jobTitles] : jobTitles;
      const effectiveDepartments = formDept ? [formDept, ...departments] : departments;
      const effectiveGrades = formGrade ? [formGrade, ...grades] : grades;

      if (q) {
        const searchable = [formName, ...effectiveJobTitles, ...effectiveDepartments, ...effectiveGrades].join(' ').toLowerCase();
        if (!searchable.includes(q)) return false;
      }
      if (yearFilter && formYear !== yearFilter) return false;
      if (roleFilter && !effectiveJobTitles.includes(roleFilter)) return false;
      if (gradeFilter && !effectiveGrades.includes(gradeFilter)) return false;
      if (departmentFilter && !effectiveDepartments.includes(departmentFilter)) return false;
      return true;
    });
  }, [rows, search, yearFilter, roleFilter, gradeFilter, departmentFilter]);

  const filterSelectWrap = '!w-auto max-w-[220px] shrink-0';
  const filterSelectClass = 'pl-2.5';
  const actionCircle =
    'inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#d8d8d8] bg-white text-[#505050] transition-colors hover:border-[#121212] hover:text-[#121212] disabled:cursor-not-allowed disabled:opacity-50';
  const allVisibleSelected =
    filteredRows.length > 0 && filteredRows.every((form) => selectedIds.includes(form.id));

  function toggleOne(id: string, checked: boolean) {
    setSelectedIds((prev) => {
      if (checked) return prev.includes(id) ? prev : [...prev, id];
      return prev.filter((x) => x !== id);
    });
  }

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2 sm:gap-3">
        <div className="flex h-9 w-full max-w-[260px] items-center gap-2 rounded-lg border border-[#d8d8d8] bg-[#f5f4f1] px-3 transition-[box-shadow,border-color] focus-within:border-[#121212] focus-within:shadow-[0_0_0_3px_rgba(18,18,18,0.07)]">
          <span className="text-[13px] text-[#9b9b9b]" aria-hidden>
            🔍
          </span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search form, role, department, or grade..."
            className="min-w-0 flex-1 border-0 bg-transparent text-[13px] text-[#121212] outline-none placeholder:text-[#9b9b9b]"
          />
        </div>
        <FormSelect
          wrapperClassName={filterSelectWrap}
          className={filterSelectClass}
          value={departmentFilter}
          onChange={(e) => setDepartmentFilter(e.target.value)}
          aria-label="Department filter"
        >
          <option value="">All departments</option>
          {departmentOptions.map((dept) => (
            <option key={dept} value={dept}>
              {dept}
            </option>
          ))}
        </FormSelect>
        <FormSelect
          wrapperClassName={filterSelectWrap}
          className={filterSelectClass}
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          aria-label="Role filter"
        >
          <option value="">All roles</option>
          {roleOptions.map((role) => (
            <option key={role} value={role}>
              {role}
            </option>
          ))}
        </FormSelect>
        <FormSelect
          wrapperClassName={filterSelectWrap}
          className={filterSelectClass}
          value={gradeFilter}
          onChange={(e) => setGradeFilter(e.target.value)}
          aria-label="Grade filter"
        >
          <option value="">All grades</option>
          {gradeOptions.map((grade) => (
            <option key={grade} value={grade}>
              {grade}
            </option>
          ))}
        </FormSelect>
        <FormSelect
          wrapperClassName={filterSelectWrap}
          className={filterSelectClass}
          value={yearFilter}
          onChange={(e) => setYearFilter(e.target.value)}
          aria-label="Year filter"
        >
          <option value="">All years</option>
          {years.map((year) => (
            <option key={year} value={year}>
              {year}
            </option>
          ))}
        </FormSelect>
      </div>

      {error ? <p className="mb-3 text-[12px] text-[#b42318]">{error}</p> : null}

      <div className="overflow-x-auto rounded-xl border border-[#d8d8d8] bg-white">
        <table className="min-w-full text-left text-[13px]">
          <thead className="border-b border-[#ececec] bg-[#f7fbf8] text-[11px] font-semibold uppercase tracking-wide text-[#6a6a6a]">
            <tr>
              <th className="px-4 py-3">
                <input
                  type="checkbox"
                  aria-label="Select all visible application forms"
                  checked={allVisibleSelected}
                  onChange={(e) =>
                    setSelectedIds(
                      e.target.checked
                        ? Array.from(new Set([...selectedIds, ...filteredRows.map((form) => form.id)]))
                        : selectedIds.filter((id) => !filteredRows.some((form) => form.id === id)),
                    )
                  }
                  className="h-4 w-4 rounded border-[#c2c2c2]"
                />
              </th>
              <th className="px-4 py-3">Application form</th>
              <th className="px-4 py-3">Questions</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3">Edited</th>
              <th className="px-4 py-3 text-right">
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    aria-label="Delete selected application forms"
                    title="Delete selected forms"
                    className={actionCircle}
                    disabled={isPending || selectedIds.length === 0}
                    onClick={() =>
                      startTransition(async () => {
                        setError(null);
                        const res = await deleteApplicationForms(selectedIds);
                        if (!res.ok) {
                          setError(res.error);
                          return;
                        }
                        setSelectedIds([]);
                        router.refresh();
                      })
                    }
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="Add application form"
                    title="Add application form"
                    className={actionCircle}
                    disabled={isPending}
                    onClick={() =>
                      startTransition(async () => {
                        setError(null);
                        const res = await createApplicationForm();
                        if (!res.ok) {
                          setError(res.error);
                          return;
                        }
                        if (res.id) {
                          router.push(`/hr/hiring/application-forms/${res.id}/edit`);
                          return;
                        }
                        router.refresh();
                      })
                    }
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f0f0f0]">
            {filteredRows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-[#9b9b9b]">
                  No application forms match these filters.
                </td>
              </tr>
            ) : (
              filteredRows.map((form) => {
                const formName = (form.name ?? '').trim() || 'Untitled application form';
                return (
                  <tr key={form.id} className="align-top hover:bg-[#faf9f6]">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        aria-label={`Select ${formName}`}
                        checked={selectedIds.includes(form.id)}
                        onChange={(e) => toggleOne(form.id, e.target.checked)}
                        className="h-4 w-4 rounded border-[#c2c2c2]"
                      />
                    </td>
                    <td className="px-4 py-3 font-medium text-[#121212]">{formName}</td>
                    <td className="px-4 py-3 text-[#505050]">{form.questionCount}</td>
                    <td className="px-4 py-3 text-[#505050]">{monthYear(form.createdAt)}</td>
                    <td className="px-4 py-3 text-[#505050]">{monthYear(form.updatedAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        <Link
                          href={`/hr/hiring/application-forms/${form.id}/preview`}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label={`Preview ${formName}`}
                          title="Preview form"
                          className={actionCircle}
                        >
                          <Eye className="h-4 w-4" />
                        </Link>
                        <button
                          type="button"
                          aria-label={`Duplicate ${formName}`}
                          title="Duplicate form"
                          className={actionCircle}
                          disabled={isPending}
                          onClick={() =>
                            startTransition(async () => {
                              setError(null);
                              const res = await duplicateApplicationForm(form.id);
                              if (!res.ok) setError(res.error);
                            })
                          }
                        >
                          <Copy className="h-4 w-4" />
                        </button>
                        <Link
                          href={`/hr/hiring/application-forms/${form.id}/edit`}
                          aria-label={`Edit ${formName}`}
                          title="Edit form"
                          className={actionCircle}
                        >
                          <Pencil className="h-4 w-4" />
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
