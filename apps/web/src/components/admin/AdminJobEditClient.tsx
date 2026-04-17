'use client';

import {
  archiveJobListing,
  publishJobListing,
  replaceJobScreeningQuestions,
  unarchiveJobListing,
  updateJobListing,
  type JobScreeningQuestionPersist,
} from '@/app/(main)/admin/jobs/actions';
import { JobScreeningQuestionsSection } from '@/components/admin/JobScreeningQuestionsSection';
import { recruitmentContractLabel } from '@/lib/recruitment/labels';
import { tenantJobPublicUrl } from '@/lib/tenant/adminUrl';
import { jobApplicationModeLabel, jobListingStatusLabel } from '@/lib/jobs/labels';
import { JOB_APPLICATION_MODES, RECRUITMENT_CONTRACT_TYPES } from '@campsite/types';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, useTransition } from 'react';

function formatDatetimeLocalValue(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
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
  initialScreeningQuestions = [],
}: {
  job: JobEditRow;
  orgSlug: string;
  requestHref: string;
  /** Careers-site funnel counts (live listings only). */
  publicMetrics?: JobPublicMetrics | null;
  /** From org HR metric settings — used for diversity target codes. */
  eqCategoryOptions?: { code: string; label: string }[];
  initialScreeningQuestions?: JobScreeningQuestionPersist[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const [title, setTitle] = useState(job.title);
  const [gradeLevel, setGradeLevel] = useState(job.grade_level);
  const [salaryBand, setSalaryBand] = useState(job.salary_band);
  const [contractType, setContractType] = useState(job.contract_type);
  const [advertCopy, setAdvertCopy] = useState(job.advert_copy);
  const [requirements, setRequirements] = useState(job.requirements);
  const [benefits, setBenefits] = useState(job.benefits);
  const [applicationMode, setApplicationMode] = useState(job.application_mode);
  const [allowCv, setAllowCv] = useState(job.allow_cv);
  const [allowLoom, setAllowLoom] = useState(job.allow_loom);
  const [allowStaffsavvy, setAllowStaffsavvy] = useState(job.allow_staffsavvy);
  const [allowApplicationQuestions, setAllowApplicationQuestions] = useState(
    Boolean(job.allow_application_questions),
  );
  const [diversityTargetPct, setDiversityTargetPct] = useState(
    job.diversity_target_pct != null ? String(job.diversity_target_pct) : '',
  );
  const [diversityCodes, setDiversityCodes] = useState<string[]>(
    Array.isArray(job.diversity_included_codes) ? [...job.diversity_included_codes] : [],
  );
  const [applicationsCloseAtInput, setApplicationsCloseAtInput] = useState(() =>
    formatDatetimeLocalValue(job.applications_close_at),
  );
  const [screeningQuestions, setScreeningQuestions] =
    useState<JobScreeningQuestionPersist[]>(initialScreeningQuestions);

  useEffect(() => {
    setApplicationsCloseAtInput(formatDatetimeLocalValue(job.applications_close_at));
  }, [job.applications_close_at]);

  useEffect(() => {
    setScreeningQuestions(initialScreeningQuestions);
  }, [initialScreeningQuestions]);

  const fieldClass =
    'mt-0 w-full rounded-xl border border-[#d8d8d8] bg-white px-4 py-3 text-[14px] leading-relaxed text-[#121212] outline-none transition-[box-shadow,border-color] focus:border-[#121212] focus:shadow-[0_0_0_3px_rgba(18,18,18,0.07)]';
  const labelClass = 'mb-2 block text-[12px] font-semibold text-[#6b6b6b]';

  const showPublic = job.status === 'live' && job.slug && !job.slug.startsWith('draft-');
  const publicUrl = showPublic ? tenantJobPublicUrl(orgSlug, job.slug) : '';
  const isArchived = job.status === 'archived';
  const previewApplySummary = useMemo(() => {
    if (applicationMode !== 'combination') {
      return jobApplicationModeLabel(applicationMode);
    }
    const bits: string[] = [];
    if (allowCv) bits.push(jobApplicationModeLabel('cv'));
    if (allowLoom) bits.push(jobApplicationModeLabel('loom'));
    if (allowStaffsavvy) bits.push(jobApplicationModeLabel('staffsavvy'));
    if (allowApplicationQuestions) bits.push('Role application questions');
    return bits.length > 0 ? bits.join(', ') : jobApplicationModeLabel('combination');
  }, [applicationMode, allowCv, allowLoom, allowStaffsavvy, allowApplicationQuestions]);

  function save() {
    setMsg(null);
    startTransition(async () => {
      const tp = diversityTargetPct.trim();
      const targetNum = tp === '' ? null : Number.parseFloat(tp);
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
      });
      if (!res.ok) {
        setMsg({ type: 'err', text: res.error });
        return;
      }
      const sq = await replaceJobScreeningQuestions(
        job.id,
        screeningQuestions.map((q, i) => ({ ...q, sortOrder: i })),
      );
      if (!sq.ok) {
        setMsg({ type: 'err', text: sq.error });
        return;
      }
      setMsg({ type: 'ok', text: 'Saved.' });
      router.refresh();
    });
  }

  function publish() {
    setMsg(null);
    startTransition(async () => {
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
    <div className="mx-auto min-w-0 w-full space-y-10 py-10 lg:space-y-12 lg:py-12 font-sans text-[#121212]">
      <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 max-w-3xl">
          <nav aria-label="Breadcrumb" className="text-[13px] font-medium text-[#6b6b6b]">
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
          <h1 className="mt-4 font-authSerif text-[28px] leading-tight tracking-[-0.03em] text-[#121212]">
            {title || 'Job'}
          </h1>
          {job.status === 'live' ? (
            <p className="mt-4 flex items-center gap-2 text-[13px] font-semibold text-[#121212]">
              <span className="h-2 w-2 shrink-0 rounded-full bg-[#16a34a]" aria-hidden />
              Live
            </p>
          ) : null}
          <p className={`max-w-2xl text-[13.5px] leading-relaxed text-[#6b6b6b] ${job.status === 'live' ? 'mt-2' : 'mt-4'}`}>
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
          <p className="mt-3 max-w-2xl text-[13.5px] leading-relaxed text-[#6b6b6b]">
            Prefilled from approved recruitment brief — title, grade / level, salary band, and contract type.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-3">
          {showPublic ? (
            <button
              type="button"
              onClick={() => void navigator.clipboard.writeText(publicUrl)}
              className="inline-flex h-10 items-center justify-center rounded-full border border-[#d8d8d8] bg-white px-5 text-[13px] font-medium text-[#121212] transition-colors hover:bg-[#faf9f6]"
            >
              Copy public link
            </button>
          ) : null}
          <Link
            href={requestHref}
            className="inline-flex h-10 items-center justify-center rounded-full border border-[#d8d8d8] bg-white px-5 text-[13px] font-medium text-[#121212] transition-colors hover:bg-[#faf9f6]"
          >
            Recruitment request
          </Link>
          {job.status === 'live' ? (
            <Link
              href={`/hr/jobs/${job.id}/applications`}
              className="inline-flex h-10 items-center justify-center rounded-full border border-[#d8d8d8] bg-white px-5 text-[13px] font-medium text-[#121212] transition-colors hover:bg-[#faf9f6]"
            >
              View pipeline
            </Link>
          ) : null}
        </div>
      </div>

      {msg ? (
        <div
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
        <section className="rounded-2xl border border-[#e8e8e8] bg-white p-8 shadow-sm">
          <h2 className="text-[12px] font-semibold uppercase tracking-widest text-[#9b9b9b]">Diversity monitoring (optional)</h2>
          <p className="mt-3 max-w-3xl text-[13.5px] leading-relaxed text-[#6b6b6b]">
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

      <div className="grid gap-8 lg:grid-cols-2 lg:gap-10">
        <div className="space-y-6 rounded-2xl border border-[#e8e8e8] bg-white p-8 shadow-sm">
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
        </div>

        <div className="space-y-6 rounded-2xl border border-[#e8e8e8] bg-white p-8 shadow-sm">
          <h2 className="text-[12px] font-semibold uppercase tracking-widest text-[#9b9b9b]">Application options</h2>
          <p className="text-[13.5px] leading-relaxed text-[#6b6b6b]">
            Choose how applicants apply for this job.
          </p>
          <div className="space-y-3">
            {JOB_APPLICATION_MODES.map((m) => (
              <label
                key={m}
                className="flex cursor-pointer items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 text-[14px] transition-colors hover:border-[#ececec] hover:bg-[#faf9f6]"
              >
                <input
                  type="radio"
                  name="appMode"
                  checked={applicationMode === m}
                  disabled={isArchived}
                  onChange={() => {
                    setApplicationMode(m);
                    if (m === 'cv') {
                      setAllowCv(true);
                      setAllowLoom(false);
                      setAllowStaffsavvy(false);
                      setAllowApplicationQuestions(false);
                    } else if (m === 'loom') {
                      setAllowCv(false);
                      setAllowLoom(true);
                      setAllowStaffsavvy(false);
                      setAllowApplicationQuestions(false);
                    } else if (m === 'staffsavvy') {
                      setAllowCv(false);
                      setAllowLoom(false);
                      setAllowStaffsavvy(true);
                      setAllowApplicationQuestions(false);
                    }
                    /* combination: keep current toggles */
                  }}
                />
                {jobApplicationModeLabel(m)}
              </label>
            ))}
          </div>
          <div className="rounded-xl border border-[#e8e8e8] bg-[#faf9f6] p-4 text-[13px] leading-relaxed text-[#6b6b6b]">
            Modes: CV upload, Loom 1-minute link, StaffSavvy score (out of 5), combination (pick any enabled options),
            or role application questions alone when that option is enabled.
          </div>
          {applicationMode === 'combination' ? (
            <div className="mt-6 space-y-3 border-t border-[#f0f0f0] pt-6">
              <p className="text-[12px] font-semibold text-[#6b6b6b]">Enable for this role</p>
              <label className="flex items-center gap-2 text-[13px]">
                <input
                  type="checkbox"
                  checked={allowCv}
                  disabled={isArchived}
                  onChange={(e) => setAllowCv(e.target.checked)}
                />
                CV upload
              </label>
              <label className="flex items-center gap-2 text-[13px]">
                <input
                  type="checkbox"
                  checked={allowLoom}
                  disabled={isArchived}
                  onChange={(e) => setAllowLoom(e.target.checked)}
                />
                Loom video (1 minute)
              </label>
              <label className="flex items-center gap-2 text-[13px]">
                <input
                  type="checkbox"
                  checked={allowStaffsavvy}
                  disabled={isArchived}
                  onChange={(e) => setAllowStaffsavvy(e.target.checked)}
                />
                StaffSavvy score (1–5)
              </label>
              <label className="flex items-center gap-2 text-[13px]">
                <input
                  type="checkbox"
                  checked={allowApplicationQuestions}
                  disabled={isArchived}
                  onChange={(e) => setAllowApplicationQuestions(e.target.checked)}
                />
                Role application questions (no CV required when used alone)
              </label>
              <p className="text-[12px] leading-relaxed text-[#9b9b9b]">
                Turn this on when answers to the questions below should qualify someone without a CV, Loom, or
                StaffSavvy score. You must add at least one question before publishing.
              </p>
            </div>
          ) : null}
          {!isArchived ? (
            <div className="mt-6 border-t border-[#f0f0f0] pt-6">
              <label className={labelClass} htmlFor="applications_close_at">
                Stop accepting applications (optional)
              </label>
              <p className="mb-2 text-[12px] text-[#9b9b9b]">
                When this date-time passes, new applications are blocked. Leave empty for no deadline.
              </p>
              <input
                id="applications_close_at"
                type="datetime-local"
                className={fieldClass}
                value={applicationsCloseAtInput}
                onChange={(e) => setApplicationsCloseAtInput(e.target.value)}
              />
            </div>
          ) : null}
        </div>
      </div>

      <JobScreeningQuestionsSection
        disabled={isArchived}
        currentJobId={job.id}
        questions={screeningQuestions}
        onQuestionsChange={setScreeningQuestions}
      />

      <div className="space-y-6 rounded-2xl border border-[#e8e8e8] bg-white p-8 shadow-sm">
        <h2 className="text-[12px] font-semibold uppercase tracking-widest text-[#9b9b9b]">Listing copy</h2>
        <div>
          <label className={labelClass} htmlFor="advert">
            Advert / overview
          </label>
          <textarea
            id="advert"
            rows={10}
            className={`${fieldClass} min-h-[12rem]`}
            value={advertCopy}
            disabled={isArchived}
            onChange={(e) => setAdvertCopy(e.target.value)}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="reqs">
            Requirements
          </label>
          <textarea
            id="reqs"
            rows={7}
            className={`${fieldClass} min-h-[9rem]`}
            value={requirements}
            disabled={isArchived}
            onChange={(e) => setRequirements(e.target.value)}
          />
        </div>
        <div>
          <label className={labelClass} htmlFor="benefits">
            Benefits
          </label>
          <textarea
            id="benefits"
            rows={6}
            className={`${fieldClass} min-h-[7rem]`}
            value={benefits}
            disabled={isArchived}
            onChange={(e) => setBenefits(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-6 rounded-2xl border border-[#e8e8e8] bg-white p-8 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <h2 className="text-[12px] font-semibold uppercase tracking-widest text-[#9b9b9b]">Job listing preview</h2>
          <span className="rounded-full border border-[#e8e8e8] bg-[#faf9f6] px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-[#6b6b6b]">
            {job.status === 'live' ? 'Live format' : 'Draft preview'}
          </span>
        </div>
        <div className="overflow-hidden rounded-2xl border border-[#ececec] bg-[#faf9f6]">
          <header className="border-b border-[#ececec] bg-white px-8 py-6">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-[#9b9b9b]">Your organisation</p>
            <h3 className="mt-2 font-authSerif text-[26px] leading-tight tracking-[-0.03em] text-[#121212]">
              {title || 'Untitled role'}
            </h3>
            <p className="mt-2 text-[13.5px] text-[#6b6b6b]">
              {gradeLevel || 'Grade / level'}
              {' · '}
              {recruitmentContractLabel(contractType)}
              {' · '}
              {salaryBand || 'Salary band'}
            </p>
          </header>
          <div className="mx-auto max-w-3xl px-6 py-10 sm:px-10 sm:py-12">
            <section className="rounded-xl border border-[#e8e8e8] bg-white p-6 shadow-sm sm:p-8">
              <h4 className="text-[11px] font-semibold uppercase tracking-widest text-[#9b9b9b]">About the role</h4>
              <div className="mt-3 whitespace-pre-wrap text-[15px] leading-relaxed text-[#242424]">
                {advertCopy?.trim() || 'Details coming soon.'}
              </div>
            </section>

            {requirements?.trim() ? (
              <section className="mt-6 rounded-xl border border-[#e8e8e8] bg-white p-6 shadow-sm sm:p-8">
                <h4 className="text-[11px] font-semibold uppercase tracking-widest text-[#9b9b9b]">Requirements</h4>
                <div className="mt-3 whitespace-pre-wrap text-[14px] leading-relaxed text-[#242424]">{requirements}</div>
              </section>
            ) : null}

            {benefits?.trim() ? (
              <section className="mt-6 rounded-xl border border-[#e8e8e8] bg-white p-6 shadow-sm sm:p-8">
                <h4 className="text-[11px] font-semibold uppercase tracking-widest text-[#9b9b9b]">Benefits</h4>
                <div className="mt-3 whitespace-pre-wrap text-[14px] leading-relaxed text-[#242424]">{benefits}</div>
              </section>
            ) : null}

            <section className="mt-6 rounded-xl border border-[#d8ece5] bg-[#f0fdf9] p-6 sm:p-8">
              <h4 className="text-[11px] font-semibold uppercase tracking-widest text-[#0f5132]">How to apply</h4>
              <p className="mt-3 text-[13.5px] leading-relaxed text-[#14532d]">
                Apply online - this vacancy accepts: {previewApplySummary}.
              </p>
              {screeningQuestions.length > 0 ? (
                <div className="mt-4 rounded-lg border border-[#bbf7d0] bg-white/90 p-4">
                  <p className="text-[12px] font-semibold text-[#14532d]">
                    Draft role questions ({screeningQuestions.length}) — not live until you save
                  </p>
                  <ul className="mt-2 list-disc space-y-1.5 pl-5 text-[13px] leading-snug text-[#166534]">
                    {screeningQuestions.map((q) => {
                      const raw = q.prompt?.trim() || 'Untitled question';
                      const short = raw.length > 120 ? `${raw.slice(0, 117)}…` : raw;
                      return (
                        <li key={q.id}>
                          {short}
                          {q.required ? <span className="text-[11px] font-medium text-[#b45309]"> (required)</span> : null}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}
              <button
                type="button"
                disabled
                className="mt-3 inline-flex h-10 items-center justify-center rounded-lg bg-[#008B60] px-4 text-[13px] font-medium text-white opacity-70"
              >
                Apply now
              </button>
            </section>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-4 pt-2">
        {isArchived ? (
          <button
            type="button"
            disabled={pending}
            onClick={restoreToDraft}
            className="inline-flex h-11 min-w-[10rem] items-center justify-center rounded-full bg-[#121212] px-6 text-[13px] font-medium text-[#faf9f6] transition-opacity hover:opacity-90 disabled:opacity-60"
          >
            {pending ? 'Restoring…' : 'Restore to draft'}
          </button>
        ) : (
          <>
            <button
              type="button"
              disabled={pending}
              onClick={save}
              className="inline-flex h-11 min-w-[10rem] items-center justify-center rounded-full bg-[#121212] px-6 text-[13px] font-medium text-[#faf9f6] transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {pending ? 'Saving…' : 'Save draft'}
            </button>
            {job.status === 'draft' ? (
              <button
                type="button"
                disabled={pending}
                onClick={publish}
                className="inline-flex h-11 min-w-[10rem] items-center justify-center rounded-full border border-[#d8d8d8] bg-white px-6 text-[13px] font-medium text-[#121212] transition-colors hover:bg-[#faf9f6] disabled:opacity-60"
              >
                Publish
              </button>
            ) : null}
            {job.status === 'live' ? (
              <button
                type="button"
                disabled={pending}
                onClick={archive}
                className="inline-flex h-11 min-w-[10rem] items-center justify-center rounded-full border border-[#fecaca] bg-white px-6 text-[13px] font-medium text-[#b91c1c] hover:bg-red-50 disabled:opacity-60"
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
