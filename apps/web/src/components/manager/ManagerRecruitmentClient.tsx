'use client';

import { createRecruitmentRequest } from '@/app/(main)/manager/recruitment/actions';
import {
  recruitmentContractLabel,
  recruitmentHireReasonLabel,
  recruitmentStatusLabel,
  recruitmentUrgencyLabel,
} from '@/lib/recruitment/labels';
import {
  RECRUITMENT_CONTRACT_TYPES,
  RECRUITMENT_HIRE_REASONS,
  RECRUITMENT_URGENCY_LEVELS,
} from '@campsite/types';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';

export type ManagedDeptOption = { id: string; name: string };

export type ManagerRecruitmentRow = {
  id: string;
  job_title: string;
  status: string;
  urgency: string;
  archived_at: string | null;
  created_at: string;
  department_id: string;
  departments: { name: string } | { name: string }[] | null;
};

export function ManagerRecruitmentClient({
  managedDepartments,
  initialRequests,
  canRaise,
  showHrAdminLink,
  hiringHubRaise = false,
}: {
  managedDepartments: ManagedDeptOption[];
  initialRequests: ManagerRecruitmentRow[];
  canRaise: boolean;
  showHrAdminLink: boolean;
  /** When true, omit the default “Requests” hero — used under `/hr/hiring` chrome. */
  hiringHubRaise?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [sortBy, setSortBy] = useState<'date' | 'urgency' | 'status'>('date');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const filteredRequests = useMemo(() => {
    const filtered = initialRequests.filter((r) => (showArchived ? Boolean(r.archived_at) : !r.archived_at));
    const dir = sortDir === 'asc' ? 1 : -1;
    const rank: Record<string, number> = {
      pending_review: 0,
      approved: 1,
      in_progress: 2,
      filled: 3,
      rejected: 4,
      high: 0,
      normal: 1,
      low: 2,
    };
    return [...filtered].sort((a, b) => {
      if (sortBy === 'date') {
        return dir * (new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      }
      if (sortBy === 'urgency') {
        return dir * ((rank[a.urgency] ?? 99) - (rank[b.urgency] ?? 99));
      }
      return dir * ((rank[a.status] ?? 99) - (rank[b.status] ?? 99));
    });
  }, [initialRequests, showArchived, sortBy, sortDir]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    const fd = new FormData(e.currentTarget);
    startTransition(async () => {
      const res = await createRecruitmentRequest({
        departmentId: String(fd.get('departmentId') ?? ''),
        jobTitle: String(fd.get('jobTitle') ?? ''),
        gradeLevel: String(fd.get('gradeLevel') ?? ''),
        salaryBand: String(fd.get('salaryBand') ?? ''),
        reasonForHire: String(fd.get('reasonForHire') ?? ''),
        startDateNeeded: String(fd.get('startDateNeeded') ?? ''),
        contractType: String(fd.get('contractType') ?? ''),
        idealCandidateProfile: String(fd.get('idealCandidateProfile') ?? ''),
        specificRequirements: String(fd.get('specificRequirements') ?? ''),
        urgency: String(fd.get('urgency') ?? ''),
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      (e.target as HTMLFormElement).reset();
      setSuccess('Recruitment request submitted. HR has been notified in-app and by email.');
      router.refresh();
    });
  }

  const labelClass = 'mb-1 block text-[12px] font-medium text-[#505050]';
  const fieldClass =
    'mt-0 w-full rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px] text-[#121212] outline-none focus:border-[#008B60] focus:ring-1 focus:ring-[#008B60]';

  return (
    <div className={`space-y-10 ${hiringHubRaise ? 'font-sans text-[#121212]' : ''}`}>
      {hiringHubRaise ? (
        <header className="space-y-2">
          <Link
            href="/hr/hiring/requests"
            prefetch={false}
            className="inline-flex text-[13px] font-medium text-[#6b6b6b] underline-offset-2 hover:text-[#121212] hover:underline"
          >
            ← Hiring requests
          </Link>
          <h1 className="font-authSerif text-[26px] leading-tight tracking-[-0.03em] text-[#121212]">New request</h1>
          <p className="max-w-2xl text-[13.5px] text-[#6b6b6b]">
            Raise a recruitment request to HR using a structured brief. Submissions keep full history.
          </p>
        </header>
      ) : (
        <header>
          <h1 className="font-authSerif text-[22px] tracking-tight text-[#121212]">Requests</h1>
          <p className="mt-1 text-[13px] text-[#6b6b6b]">
            Raise a recruitment request to HR using a structured brief. Your submissions are never deleted and keep full history.
          </p>
        </header>
      )}

      {!canRaise ? (
        <div
          role="status"
          className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-950"
        >
          Only <strong>department managers</strong> can submit recruitment requests. Coordinators can ask an
          assigned manager to raise one on behalf of your department.
        </div>
      ) : managedDepartments.length === 0 ? (
        <div
          role="status"
          className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-950"
        >
          You are not assigned to any departments as a manager yet.
        </div>
      ) : (
        <section className="rounded-xl border border-[#e8e8e8] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <h2 className={hiringHubRaise ? 'text-[15px] font-semibold text-[#121212]' : 'font-authSerif text-lg text-[#121212]'}>
            Raise recruitment request
          </h2>
          <form className="mt-5 space-y-4" onSubmit={onSubmit}>
            {success ? (
              <div
                role="status"
                className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[13px] text-emerald-900"
              >
                {success}
              </div>
            ) : null}
            {error ? (
              <div
                role="alert"
                className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-900"
              >
                {error}
              </div>
            ) : null}
            <div>
              <label className={labelClass} htmlFor="departmentId">
                Department
              </label>
              <select id="departmentId" name="departmentId" required className={fieldClass}>
                <option value="">Select department…</option>
                {managedDepartments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className={labelClass} htmlFor="jobTitle">
                  Job title
                </label>
                <input id="jobTitle" name="jobTitle" required className={fieldClass} autoComplete="off" />
              </div>
              <div>
                <label className={labelClass} htmlFor="gradeLevel">
                  Grade / level
                </label>
                <input id="gradeLevel" name="gradeLevel" required className={fieldClass} autoComplete="off" />
              </div>
              <div>
                <label className={labelClass} htmlFor="salaryBand">
                  Salary band
                </label>
                <input id="salaryBand" name="salaryBand" required className={fieldClass} autoComplete="off" />
              </div>
              <div>
                <label className={labelClass} htmlFor="reasonForHire">
                  Reason for hire
                </label>
                <select id="reasonForHire" name="reasonForHire" required className={fieldClass}>
                  {RECRUITMENT_HIRE_REASONS.map((v) => (
                    <option key={v} value={v}>
                      {recruitmentHireReasonLabel(v)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass} htmlFor="urgency">
                  Urgency
                </label>
                <select id="urgency" name="urgency" required className={fieldClass}>
                  {RECRUITMENT_URGENCY_LEVELS.map((v) => (
                    <option key={v} value={v}>
                      {recruitmentUrgencyLabel(v)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass} htmlFor="startDateNeeded">
                  Start date needed
                </label>
                <input id="startDateNeeded" name="startDateNeeded" type="date" required className={fieldClass} />
              </div>
              <div>
                <label className={labelClass} htmlFor="contractType">
                  Contract type
                </label>
                <select id="contractType" name="contractType" required className={fieldClass}>
                  {RECRUITMENT_CONTRACT_TYPES.map((v) => (
                    <option key={v} value={v}>
                      {recruitmentContractLabel(v)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className={labelClass} htmlFor="idealCandidateProfile">
                Ideal candidate profile
              </label>
              <textarea
                id="idealCandidateProfile"
                name="idealCandidateProfile"
                required
                rows={5}
                className={fieldClass}
                placeholder="Describe the person you are looking for…"
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="specificRequirements">
                Specific requirements <span className="font-normal text-[#9b9b9b]">(optional)</span>
              </label>
              <textarea
                id="specificRequirements"
                name="specificRequirements"
                rows={3}
                className={fieldClass}
                placeholder="Certifications, schedule constraints, compliance notes…"
              />
            </div>
            <div className="pt-1">
              <button
                type="submit"
                disabled={pending}
                className="inline-flex h-10 items-center justify-center rounded-lg bg-[#008B60] px-4 text-[13px] font-medium text-white transition hover:bg-[#007a54] disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#008B60]"
              >
                {pending ? 'Submitting…' : 'Raise Recruitment Request'}
              </button>
            </div>
          </form>
        </section>
      )}

      <section>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className={hiringHubRaise ? 'text-[15px] font-semibold text-[#121212]' : 'font-authSerif text-lg text-[#121212]'}>
            My requests
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-2 rounded-lg border border-[#e8e8e8] bg-[#fafafa] p-1 text-[12px]">
              <button
                type="button"
                onClick={() => setShowArchived(false)}
                className={[
                  'rounded-md px-3 py-1.5 font-medium transition',
                  !showArchived ? 'bg-white text-[#121212] shadow-sm' : 'text-[#6b6b6b] hover:text-[#121212]',
                ].join(' ')}
              >
                Active
              </button>
              <button
                type="button"
                onClick={() => setShowArchived(true)}
                className={[
                  'rounded-md px-3 py-1.5 font-medium transition',
                  showArchived ? 'bg-white text-[#121212] shadow-sm' : 'text-[#6b6b6b] hover:text-[#121212]',
                ].join(' ')}
              >
                Archived
              </button>
            </div>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'date' | 'urgency' | 'status')}
              className="rounded-lg border border-[#d8d8d8] bg-white px-2 py-1.5 text-[12px]"
            >
              <option value="date">Sort: Date</option>
              <option value="urgency">Sort: Urgency</option>
              <option value="status">Sort: Status</option>
            </select>
            <select
              value={sortDir}
              onChange={(e) => setSortDir(e.target.value as 'asc' | 'desc')}
              className="rounded-lg border border-[#d8d8d8] bg-white px-2 py-1.5 text-[12px]"
            >
              <option value="desc">Desc</option>
              <option value="asc">Asc</option>
            </select>
          </div>
        </div>

        {filteredRequests.length === 0 ? (
          <p className="text-[13px] text-[#6b6b6b]">
            {showArchived ? 'No archived requests.' : 'No active requests yet.'}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[#e8e8e8] bg-white">
            <table className="min-w-full text-left text-[13px]">
              <thead className="border-b border-[#ececec] bg-[#fafafa] text-[11px] font-semibold uppercase tracking-wide text-[#7a7a7a]">
                <tr>
                  <th className="px-4 py-3">Job</th>
                  <th className="px-4 py-3">Department</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Urgency</th>
                  <th className="px-4 py-3">Submitted</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f0f0f0]">
                {filteredRequests.map((r) => {
                  const d = r.departments;
                  const deptName = Array.isArray(d) ? d[0]?.name : d?.name;
                  return (
                    <tr key={r.id} className="text-[#242424]">
                      <td className="px-4 py-3 font-medium">{r.job_title}</td>
                      <td className="px-4 py-3 text-[#505050]">{deptName ?? '—'}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex rounded-full border border-[#d8d8d8] px-2.5 py-1 text-[11px]">
                          {recruitmentStatusLabel(r.status)}
                        </span>
                      </td>
                      <td className="px-4 py-3">{recruitmentUrgencyLabel(r.urgency)}</td>
                      <td className="px-4 py-3 text-[#505050]">
                        {new Date(r.created_at).toLocaleDateString(undefined, {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {showHrAdminLink ? (
        <p className="text-[12px] text-[#9b9b9b]">
          Open the organisation hiring queue (requests):{' '}
          <Link
            href="/hr/hiring/requests"
            className="text-[#008B60] underline decoration-[#008B60]/30 hover:decoration-[#008B60]"
          >
            Hiring requests
          </Link>
          .
        </p>
      ) : (
        <p className="text-[12px] text-[#9b9b9b]">
          Your organisation&apos;s HR team is notified when you submit a request.
        </p>
      )}
    </div>
  );
}
