'use client';

import {
  archiveJobListing,
  publishJobListing,
  unarchiveJobListing,
  updateJobListing,
} from '@/app/(main)/admin/jobs/actions';
import { JobEditorTabNav } from '@/components/admin/JobEditorTabNav';
import { useTopPageFeedback } from '@/lib/ui/useTopPageFeedback';
import { recruitmentContractLabel } from '@/lib/recruitment/labels';
import { tenantJobPublicUrl } from '@/lib/tenant/adminUrl';
import { jobListingStatusLabel } from '@/lib/jobs/labels';
import { RECRUITMENT_CONTRACT_TYPES } from '@campsite/types';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';

function formatDatetimeLocalValue(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatDateOnlyValue(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseDateList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => String(v ?? '').trim()).filter(Boolean);
}

export type JobEditRow = {
  id: string;
  title: string;
  slug: string;
  status: string;
  grade_level: string;
  salary_band: string;
  contract_type: string;
  advert_copy: string;
  requirements: string;
  benefits: string;
  application_mode: string;
  allow_cv: boolean;
  allow_loom: boolean;
  allow_staffsavvy: boolean;
  allow_application_questions: boolean;
  recruitment_request_id: string;
  diversity_target_pct: number | null;
  diversity_included_codes: string[] | null;
  applications_close_at: string | null;
  application_question_set_id: string | null;
  hide_posted_date?: boolean | null;
  scheduled_publish_at?: string | null;
  shortlisting_dates?: unknown;
  interview_dates?: unknown;
  start_date_needed?: string | null;
  role_profile_link?: string | null;
};

export type JobPublicMetrics = {
  impressions: number;
  applyStarts: number;
  applySubmits: number;
};

export function AdminJobEditClient({
  job,
  orgSlug,
  requestHref,
  publicMetrics,
  eqCategoryOptions = [],
  applicationFormOptions = [],
}: {
  job: JobEditRow;
  orgSlug: string;
  requestHref: string;
  /** Careers-site funnel counts (live listings only). */
  publicMetrics?: JobPublicMetrics | null;
  /** From org HR metric settings — used for diversity target codes. */
  eqCategoryOptions?: { code: string; label: string }[];
  applicationFormOptions?: { id: string; name: string | null }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { feedback: msg, setFeedback: setMsg, feedbackRef } = useTopPageFeedback();

  const [title, setTitle] = useState(job.title);
  const [gradeLevel, setGradeLevel] = useState(job.grade_level);
  const [salaryBand, setSalaryBand] = useState(job.salary_band);
  const [contractType, setContractType] = useState(job.contract_type);
  const [advertCopy, setAdvertCopy] = useState(job.advert_copy);
  const [requirements, setRequirements] = useState(job.requirements);
  const [benefits, setBenefits] = useState(job.benefits);
  const applicationMode = job.application_mode;
  const allowCv = job.allow_cv;
  const allowLoom = job.allow_loom;
  const allowStaffsavvy = job.allow_staffsavvy;
  const allowApplicationQuestions = Boolean(job.allow_application_questions);
  const [diversityTargetPct, setDiversityTargetPct] = useState(
    job.diversity_target_pct != null ? String(job.diversity_target_pct) : '',
  );
  const [diversityCodes, setDiversityCodes] = useState<string[]>(
    Array.isArray(job.diversity_included_codes) ? [...job.diversity_included_codes] : [],
  );
  const [applicationsCloseAtInput, setApplicationsCloseAtInput] = useState(() =>
    formatDatetimeLocalValue(job.applications_close_at),
  );
  const [scheduledPublishAtInput, setScheduledPublishAtInput] = useState(() =>
    formatDatetimeLocalValue(job.scheduled_publish_at),
  );
  const [hidePostedDate, setHidePostedDate] = useState(Boolean(job.hide_posted_date));
  const [shortlistingDates, setShortlistingDates] = useState<string[]>(() => {
    const values = parseDateList(job.shortlisting_dates);
    return values.length > 0 ? values : [''];
  });
  const [interviewDates, setInterviewDates] = useState<string[]>(() => {
    const values = parseDateList(job.interview_dates);
    return values.length > 0 ? values : [''];
  });
  const [startDateNeeded, setStartDateNeeded] = useState(() => formatDateOnlyValue(job.start_date_needed));
  const [roleProfileLink, setRoleProfileLink] = useState(String(job.role_profile_link ?? '').trim());
  const [applicationQuestionSetId, setApplicationQuestionSetId] = useState(
    job.application_question_set_id ?? '',
  );

  useEffect(() => {
    setApplicationsCloseAtInput(formatDatetimeLocalValue(job.applications_close_at));
  }, [job.applications_close_at]);
  useEffect(() => {
    setScheduledPublishAtInput(formatDatetimeLocalValue(job.scheduled_publish_at));
  }, [job.scheduled_publish_at]);

  const fieldClass =
    'mt-0 h-11 w-full rounded-xl border border-[#d8d8d8] bg-white px-3.5 text-[13px] leading-normal text-[#121212] outline-none transition-[box-shadow,border-color] focus:border-[#121212] focus:shadow-[0_0_0_3px_rgba(18,18,18,0.07)]';
  const labelClass = 'mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-[#7a7a7a]';

  const showPublic = job.status === 'live' && job.slug && !job.slug.startsWith('draft-');
  const publicUrl = showPublic ? tenantJobPublicUrl(orgSlug, job.slug) : '';
  const isArchived = job.status === 'archived';
  function save() {
    setMsg(null);
    startTransition(async () => {
      const tp = diversityTargetPct.trim();
      const targetNum = tp === '' ? null : Number.parseFloat(tp);
      const nextShortlistingDates = shortlistingDates.map((d) => d.trim()).filter(Boolean);
      const nextInterviewDates = interviewDates.map((d) => d.trim()).filter(Boolean);
      const res = await updateJobListing(job.id, {
        title,
        gradeLevel,
        salaryBand,
        contractType,
        advertCopy,
        requirements,
        benefits,
        applicationMode,
        allowCv,
        allowLoom,
        allowStaffsavvy,
        allowApplicationQuestions,
        diversityTargetPct:
          tp === '' || !Number.isFinite(targetNum) ? null : targetNum,
        diversityIncludedCodes: diversityCodes,
        applicationsCloseAt: applicationsCloseAtInput.trim() || null,
        scheduledPublishAt: scheduledPublishAtInput.trim() || null,
        hidePostedDate,
        shortlistingDates: nextShortlistingDates,
        interviewDates: nextInterviewDates,
        startDateNeeded: startDateNeeded.trim() || null,
        roleProfileLink: roleProfileLink.trim() || null,
        applicationQuestionSetId: applicationQuestionSetId.trim() || null,
      });
      if (!res.ok) {
        setMsg({ type: 'err', text: res.error });
        return;
      }
      setMsg({ type: 'ok', text: 'Saved.' });
      router.refresh();
    });
  }

  function publish() {
    setMsg(null);
    startTransition(async () => {
      const tp = diversityTargetPct.trim();
      const targetNum = tp === '' ? null : Number.parseFloat(tp);
      const nextShortlistingDates = shortlistingDates.map((d) => d.trim()).filter(Boolean);
      const nextInterviewDates = interviewDates.map((d) => d.trim()).filter(Boolean);

      const saveRes = await updateJobListing(job.id, {
        title,
        gradeLevel,
        salaryBand,
        contractType,
        advertCopy,
        requirements,
        benefits,
        applicationMode,
        allowCv,
        allowLoom,
        allowStaffsavvy,
        allowApplicationQuestions,
        diversityTargetPct:
          tp === '' || !Number.isFinite(targetNum) ? null : targetNum,
        diversityIncludedCodes: diversityCodes,
        applicationsCloseAt: applicationsCloseAtInput.trim() || null,
        scheduledPublishAt: scheduledPublishAtInput.trim() || null,
        hidePostedDate,
        shortlistingDates: nextShortlistingDates,
        interviewDates: nextInterviewDates,
        startDateNeeded: startDateNeeded.trim() || null,
        roleProfileLink: roleProfileLink.trim() || null,
        applicationQuestionSetId: applicationQuestionSetId.trim() || null,
      });
      if (!saveRes.ok) {
        setMsg({ type: 'err', text: saveRes.error });
        return;
      }

      const res = await publishJobListing(job.id);
      if (!res.ok) {
        setMsg({ type: 'err', text: res.error });
        return;
      }
      router.refresh();
    });
  }

  function archive() {
    setMsg(null);
    startTransition(async () => {
      const res = await archiveJobListing(job.id);
      if (!res.ok) {
        setMsg({ type: 'err', text: res.error });
        return;
      }
      router.push('/hr/jobs');
    });
  }

  function restoreToDraft() {
    setMsg(null);
    startTransition(async () => {
      const res = await unarchiveJobListing(job.id);
      if (!res.ok) {
        setMsg({ type: 'err', text: res.error });
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="mx-auto min-w-0 w-full max-w-6xl space-y-6 px-5 py-7 font-sans text-[#121212] sm:px-7">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 max-w-3xl">
          <nav aria-label="Breadcrumb" className="text-[12px] font-medium uppercase tracking-wide text-[#9b9b9b]">
            <Link href="/hr/hiring/jobs" className="text-[#121212] underline-offset-2 hover:underline">
              Job listings
            </Link>
            <span aria-hidden className="mx-2 text-[#d0d0d0]">
              /
            </span>
            <span className="text-[#6b6b6b]">{title || 'Job'}</span>
            <span aria-hidden className="mx-2 text-[#d0d0d0]">
              /
            </span>
            <span className="text-[#6b6b6b]">Edit</span>
          </nav>
          <h1 className="mt-2 font-authSerif text-[26px] leading-tight tracking-[-0.03em] text-[#121212]">
            {title || 'Job'}
          </h1>
          {job.status === 'live' ? (
            <p className="mt-4 flex items-center gap-2 text-[13px] font-semibold text-[#121212]">
              <span className="h-2 w-2 shrink-0 rounded-full bg-[#16a34a]" aria-hidden />
              Live
            </p>
          ) : null}
          <p className={`max-w-2xl text-[12px] leading-relaxed text-[#6b6b6b] ${job.status === 'live' ? 'mt-1.5' : 'mt-2'}`}>
            {job.status === 'live' ? (
              <>
                Public listing is visible on your careers site. Anonymous and internal visits both count toward funnel
                metrics below.
              </>
            ) : (
              <>
                Status: {jobListingStatusLabel(job.status)}
                {job.status === 'draft' ? ' · Drafts use a temporary URL until you publish.' : null}
                {isArchived ? ' · Archived — restore to draft to edit or publish again.' : null}
              </>
            )}
          </p>
          <p className="mt-1.5 max-w-2xl text-[12px] leading-relaxed text-[#6b6b6b]">
            Prefilled from approved recruitment brief — title, grade / level, salary band, and contract type.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-3">
          {showPublic ? (
            <button
              type="button"
              onClick={() => void navigator.clipboard.writeText(publicUrl)}
              className="inline-flex h-9 items-center justify-center rounded-full border border-[#d8d8d8] bg-white px-4 text-[12px] font-medium text-[#121212] transition-colors hover:bg-[#faf9f6]"
            >
              Copy public link
            </button>
          ) : null}
          <Link
            href={requestHref}
            className="inline-flex h-9 items-center justify-center rounded-full border border-[#d8d8d8] bg-white px-4 text-[12px] font-medium text-[#121212] transition-colors hover:bg-[#faf9f6]"
          >
            Recruitment request
          </Link>
          {job.status === 'live' ? (
            <Link
              href={`/hr/jobs/${job.id}/applications`}
              className="inline-flex h-9 items-center justify-center rounded-full border border-[#d8d8d8] bg-white px-4 text-[12px] font-medium text-[#121212] transition-colors hover:bg-[#faf9f6]"
            >
              View pipeline
            </Link>
          ) : null}
        </div>
      </div>

      <JobEditorTabNav jobId={job.id} activeTab="information" />

      {msg ? (
        <div
          ref={feedbackRef}
          tabIndex={-1}
          role={msg.type === 'err' ? 'alert' : 'status'}
          className={[
            'rounded-xl border px-4 py-3 text-[13px]',
            msg.type === 'err'
              ? 'border-red-200 bg-red-50 text-red-900'
              : 'border-emerald-200 bg-emerald-50 text-emerald-950',
          ].join(' ')}
        >
          {msg.text}
        </div>
      ) : null}

      {job.status === 'live' && publicMetrics ? (
        <section aria-label="Public careers site analytics">
          <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-widest text-[#9b9b9b]">Public careers funnel</h2>
          <p className="max-w-3xl text-[13.5px] leading-relaxed text-[#6b6b6b]">
            Counts from the org-scoped job board and apply flow (anonymous visitors included). Internal preview traffic
            may appear if staff open the public URL.
          </p>
          <dl className="mt-8 grid gap-4 sm:grid-cols-3 lg:gap-6">
            <div className="rounded-xl border border-[#e8e8e8] bg-white p-6 shadow-sm">
              <dt className="text-[11px] font-semibold uppercase tracking-widest text-[#9b9b9b]">Listing views</dt>
              <dd className="mt-3 text-[30px] font-bold leading-none tracking-tight text-[#121212] tabular-nums">
                {publicMetrics.impressions}
              </dd>
            </div>
            <div className="rounded-xl border border-[#e8e8e8] bg-white p-6 shadow-sm">
              <dt className="text-[11px] font-semibold uppercase tracking-widest text-[#9b9b9b]">Apply starts</dt>
              <dd className="mt-3 text-[30px] font-bold leading-none tracking-tight text-[#121212] tabular-nums">
                {publicMetrics.applyStarts}
              </dd>
            </div>
            <div className="rounded-xl border border-[#e8e8e8] bg-white p-6 shadow-sm">
              <dt className="text-[11px] font-semibold uppercase tracking-widest text-[#9b9b9b]">Submitted</dt>
              <dd className="mt-3 text-[30px] font-bold leading-none tracking-tight text-[#121212] tabular-nums">
                {publicMetrics.applySubmits}
              </dd>
            </div>
          </dl>
        </section>
      ) : null}

      {eqCategoryOptions.length > 0 && !isArchived ? (
        <section className="rounded-2xl border border-[#e8e8e8] bg-white p-5 shadow-sm">
          <h2 className="text-[12px] font-semibold uppercase tracking-widest text-[#9b9b9b]">Diversity monitoring (optional)</h2>
          <p className="mt-2 max-w-3xl text-[12px] leading-relaxed text-[#6b6b6b]">
            When set, in-app alerts can fire if the share of applicants (with equality data) in the selected codes
            falls below the minimum % over the org&apos;s rolling window. Configure codes under HR metric alerts.
          </p>
          <div className="mt-8">
            <label className={labelClass} htmlFor="div_tgt">
              Minimum share of applicants (%)
            </label>
            <input
              id="div_tgt"
              type="number"
              min={0}
              max={100}
              step={0.1}
              className={fieldClass}
              placeholder="e.g. 15"
              value={diversityTargetPct}
              onChange={(e) => setDiversityTargetPct(e.target.value)}
            />
          </div>
          <p className={`${labelClass} mt-8`}>Count toward diversity share</p>
          <div className="mt-3 space-y-3">
            {eqCategoryOptions.map((o) => (
              <label key={o.code} className="flex items-center gap-2 text-[13px] text-[#121212]">
                <input
                  type="checkbox"
                  checked={diversityCodes.includes(o.code)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setDiversityCodes((prev) => [...new Set([...prev, o.code])]);
                    } else {
                      setDiversityCodes((prev) => prev.filter((c) => c !== o.code));
                    }
                  }}
                />
                <span>{o.label}</span>
                <span className="text-[11px] text-[#9b9b9b]">({o.code})</span>
              </label>
            ))}
          </div>
        </section>
      ) : null}

      <div className="space-y-8">
        <div className="space-y-5 rounded-2xl border border-[#e8e8e8] bg-white p-5 shadow-sm">
          <h2 className="text-[12px] font-semibold uppercase tracking-widest text-[#9b9b9b]">Core details</h2>
          <div>
            <label className={labelClass} htmlFor="title">
              Job title
            </label>
            <input
              id="title"
              className={fieldClass}
              value={title}
              disabled={isArchived}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="grade">
                Grade / level
              </label>
              <input
                id="grade"
                className={fieldClass}
                value={gradeLevel}
                disabled={isArchived}
                onChange={(e) => setGradeLevel(e.target.value)}
              />
            </div>
            <div>
              <label className={labelClass} htmlFor="salary">
                Salary band
              </label>
              <input
                id="salary"
                className={fieldClass}
                value={salaryBand}
                disabled={isArchived}
                onChange={(e) => setSalaryBand(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className={labelClass} htmlFor="contract">
              Contract type
            </label>
            <select
              id="contract"
              className={fieldClass}
              value={contractType}
              disabled={isArchived}
              onChange={(e) => setContractType(e.target.value)}
            >
              {RECRUITMENT_CONTRACT_TYPES.map((c) => (
                <option key={c} value={c}>
                  {recruitmentContractLabel(c)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelClass} htmlFor="role_profile_link">
              Job profile / description link
            </label>
            <input
              id="role_profile_link"
              className={fieldClass}
              value={roleProfileLink}
              disabled={isArchived}
              placeholder="https://..."
              onChange={(e) => setRoleProfileLink(e.target.value)}
            />
          </div>
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <label className={labelClass} htmlFor="scheduled_publish_at">
                Job posted (schedule)
              </label>
              <input
                id="scheduled_publish_at"
                type="datetime-local"
                className={fieldClass}
                value={scheduledPublishAtInput}
                disabled={isArchived}
                onChange={(e) => setScheduledPublishAtInput(e.target.value)}
              />
            </div>
            <div className="pt-8">
              <label className="flex items-center gap-2 text-[13px] text-[#121212]">
                <input
                  type="checkbox"
                  checked={hidePostedDate}
                  disabled={isArchived}
                  onChange={(e) => setHidePostedDate(e.target.checked)}
                />
                Hide posted date from applicants
              </label>
            </div>
          </div>
          <div>
            <label className={labelClass} htmlFor="applications_close_at">
              Closing date and time
            </label>
            <input
              id="applications_close_at"
              type="datetime-local"
              className={fieldClass}
              value={applicationsCloseAtInput}
              disabled={isArchived}
              onChange={(e) => setApplicationsCloseAtInput(e.target.value)}
            />
          </div>
          <div>
            <label className={labelClass}>
              Shortlisting dates
            </label>
            <div className="space-y-2">
              {shortlistingDates.map((value, idx) => (
                <div key={`shortlisting-${idx}`} className="flex items-center gap-2">
                  <input
                    type="date"
                    className={fieldClass}
                    value={value}
                    disabled={isArchived}
                    onChange={(e) => {
                      const next = [...shortlistingDates];
                      next[idx] = e.target.value;
                      setShortlistingDates(next);
                    }}
                  />
                  {shortlistingDates.length > 1 ? (
                    <button
                      type="button"
                      disabled={isArchived}
                      onClick={() => setShortlistingDates(shortlistingDates.filter((_, i) => i !== idx))}
                      className="inline-flex h-10 items-center justify-center rounded-lg border border-[#d8d8d8] bg-white px-3 text-[12px] text-[#6b6b6b] hover:bg-[#faf9f6]"
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
              ))}
              <button
                type="button"
                disabled={isArchived}
                onClick={() => setShortlistingDates((prev) => [...prev, ''])}
                className="inline-flex h-10 items-center justify-center rounded-lg border border-[#d8d8d8] bg-white px-3 text-[12px] text-[#121212] hover:bg-[#faf9f6]"
              >
                + Add shortlisting date
              </button>
            </div>
          </div>
          <div>
            <label className={labelClass}>
              Interview dates
            </label>
            <div className="space-y-2">
              {interviewDates.map((value, idx) => (
                <div key={`interview-${idx}`} className="flex items-center gap-2">
                  <input
                    type="date"
                    className={fieldClass}
                    value={value}
                    disabled={isArchived}
                    onChange={(e) => {
                      const next = [...interviewDates];
                      next[idx] = e.target.value;
                      setInterviewDates(next);
                    }}
                  />
                  {interviewDates.length > 1 ? (
                    <button
                      type="button"
                      disabled={isArchived}
                      onClick={() => setInterviewDates(interviewDates.filter((_, i) => i !== idx))}
                      className="inline-flex h-10 items-center justify-center rounded-lg border border-[#d8d8d8] bg-white px-3 text-[12px] text-[#6b6b6b] hover:bg-[#faf9f6]"
                    >
                      Remove
                    </button>
                  ) : null}
                </div>
              ))}
              <button
                type="button"
                disabled={isArchived}
                onClick={() => setInterviewDates((prev) => [...prev, ''])}
                className="inline-flex h-10 items-center justify-center rounded-lg border border-[#d8d8d8] bg-white px-3 text-[12px] text-[#121212] hover:bg-[#faf9f6]"
              >
                + Add interview date
              </button>
            </div>
          </div>
          <div>
            <label className={labelClass} htmlFor="start_date_needed">
              Start date
            </label>
            <input
              id="start_date_needed"
              type="date"
              className={fieldClass}
              value={startDateNeeded}
              disabled={isArchived}
              onChange={(e) => setStartDateNeeded(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-5 rounded-2xl border border-[#e8e8e8] bg-white p-5 shadow-sm">
          <h2 className="text-[12px] font-semibold uppercase tracking-widest text-[#9b9b9b]">Application options</h2>
          {!isArchived ? (
            <div>
              <label className={labelClass} htmlFor="application_form">
                Application form for this advert
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  id="application_form"
                  className={fieldClass}
                  value={applicationQuestionSetId}
                  onChange={(e) => setApplicationQuestionSetId(e.target.value)}
                >
                  <option value="">No linked form</option>
                  {applicationFormOptions.map((form) => (
                    <option key={form.id} value={form.id}>
                      {String(form.name ?? '').trim() || 'Untitled form'}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="space-y-5 rounded-2xl border border-[#e8e8e8] bg-white p-5 shadow-sm">
        <h2 className="text-[12px] font-semibold uppercase tracking-widest text-[#9b9b9b]">Listing copy</h2>
        <div>
          <label className={labelClass} htmlFor="advert">
            Job overview (optional)
          </label>
          <textarea
            id="advert"
            rows={10}
            className={`${fieldClass} min-h-[10rem] h-auto py-2.5`}
            value={advertCopy}
            disabled={isArchived}
            onChange={(e) => setAdvertCopy(e.target.value)}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="reqs">
            Job description
          </label>
          <textarea
            id="reqs"
            rows={7}
            className={`${fieldClass} min-h-[8rem] h-auto py-2.5`}
            value={requirements}
            disabled={isArchived}
            onChange={(e) => setRequirements(e.target.value)}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="benefits">
            About the organisation
          </label>
          <textarea
            id="benefits"
            rows={6}
            className={`${fieldClass} min-h-[6rem] h-auto py-2.5`}
            value={benefits}
            disabled={isArchived}
            onChange={(e) => setBenefits(e.target.value)}
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-4 pt-2">
        {isArchived ? (
          <button
            type="button"
            disabled={pending}
            onClick={restoreToDraft}
            className="inline-flex h-10 min-w-[9rem] items-center justify-center rounded-full bg-[#121212] px-5 text-[12px] font-medium text-[#faf9f6] transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {pending ? 'Restoring…' : 'Restore to draft'}
          </button>
        ) : (
          <>
            <Link
              href={`/hr/jobs/${job.id}/preview`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-10 min-w-[9rem] items-center justify-center rounded-full border border-[#d8d8d8] bg-white px-5 text-[12px] font-medium text-[#121212] transition-colors hover:bg-[#faf9f6]"
            >
              Preview
            </Link>
            <button
              type="button"
              disabled={pending}
              onClick={save}
              className="inline-flex h-10 min-w-[9rem] items-center justify-center rounded-full bg-[#121212] px-5 text-[12px] font-medium text-[#faf9f6] transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {pending ? 'Saving…' : 'Save draft'}
            </button>
            {job.status === 'draft' ? (
              <button
                type="button"
                disabled={pending}
                onClick={publish}
                className="inline-flex h-10 min-w-[9rem] items-center justify-center rounded-full border border-[#d8d8d8] bg-white px-5 text-[12px] font-medium text-[#121212] transition-colors hover:bg-[#faf9f6] disabled:opacity-60"
              >
                Publish
              </button>
            ) : null}
            {job.status === 'live' ? (
              <button
                type="button"
                disabled={pending}
                onClick={archive}
                className="inline-flex h-10 min-w-[9rem] items-center justify-center rounded-full border border-[#fecaca] bg-white px-5 text-[12px] font-medium text-[#b91c1c] hover:bg-red-50 disabled:opacity-60"
              >
                Archive
              </button>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
