'use client';

import {
  archiveJobListing,
  publishJobListing,
  updateJobListing,
} from '@/app/(main)/admin/jobs/actions';
import { recruitmentContractLabel } from '@/lib/recruitment/labels';
import { tenantJobPublicUrl } from '@/lib/tenant/adminUrl';
import { jobApplicationModeLabel, jobListingStatusLabel } from '@/lib/jobs/labels';
import { JOB_APPLICATION_MODES, RECRUITMENT_CONTRACT_TYPES } from '@campsite/types';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

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
  recruitment_request_id: string;
};

export function AdminJobEditClient({
  job,
  orgSlug,
  requestHref,
}: {
  job: JobEditRow;
  orgSlug: string;
  requestHref: string;
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

  const fieldClass =
    'mt-0 w-full rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px] text-[#121212] outline-none transition-[box-shadow,border-color] focus:border-[#121212] focus:shadow-[0_0_0_3px_rgba(18,18,18,0.07)]';
  const labelClass = 'mb-1 block text-[12px] font-medium text-[#505050]';

  const showPublic = job.status === 'live' && job.slug && !job.slug.startsWith('draft-');
  const publicUrl = showPublic ? tenantJobPublicUrl(orgSlug, job.slug) : '';
  const isArchived = job.status === 'archived';
  const previewApplyBits: string[] = [];
  if (allowCv) previewApplyBits.push(jobApplicationModeLabel('cv'));
  if (allowLoom) previewApplyBits.push(jobApplicationModeLabel('loom'));
  if (allowStaffsavvy) previewApplyBits.push(jobApplicationModeLabel('staffsavvy'));
  const previewApplySummary =
    previewApplyBits.length > 0 ? previewApplyBits.join(', ') : jobApplicationModeLabel(applicationMode);

  function save() {
    setMsg(null);
    startTransition(async () => {
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

  return (
    <div className="mx-auto max-w-6xl space-y-8 px-5 py-7 sm:px-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[12px] font-medium uppercase tracking-wide text-[#9b9b9b]">
            <Link href="/hr/jobs" className="text-[#6b6b6b] underline underline-offset-2 hover:text-[#121212]">
              Job listings
            </Link>
            <span aria-hidden className="mx-1.5 text-[#cfcfcf]">
              /
            </span>
            Edit
          </p>
          <h1 className="mt-1 font-authSerif text-[26px] leading-tight tracking-[-0.03em] text-[#121212]">
            {title || 'Job'}
          </h1>
          <p className="mt-1 text-[13px] text-[#6b6b6b]">
            Status: {jobListingStatusLabel(job.status)}
            {job.status === 'draft' ? ' · Drafts use a temporary URL until you publish.' : null}
            {isArchived ? ' · This listing is archived (read-only).' : null}
          </p>
          <p className="mt-2 text-[12px] text-[#9b9b9b]">
            Prefilled from approved recruitment brief: title, grade/level, salary band, contract type.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {showPublic ? (
            <button
              type="button"
              onClick={() => void navigator.clipboard.writeText(publicUrl)}
              className="inline-flex h-9 items-center justify-center rounded-lg border border-[#d8d8d8] bg-white px-3 text-[13px] font-medium text-[#6b6b6b] transition-colors hover:bg-[#f5f4f1] hover:text-[#121212]"
            >
              Copy public link
            </button>
          ) : null}
          <Link
            href={requestHref}
            className="inline-flex h-9 items-center justify-center rounded-lg border border-[#d8d8d8] bg-white px-3 text-[13px] font-medium text-[#6b6b6b] transition-colors hover:bg-[#f5f4f1] hover:text-[#121212]"
          >
            Recruitment request
          </Link>
          {job.status === 'live' ? (
            <Link
              href={`/hr/jobs/${job.id}/applications`}
              className="inline-flex h-9 items-center justify-center rounded-lg border border-[#d8d8d8] bg-white px-3 text-[13px] font-medium text-[#121212] transition-colors hover:bg-[#f5f4f1]"
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
            'rounded-lg border px-3 py-2 text-[13px]',
            msg.type === 'err'
              ? 'border-red-200 bg-red-50 text-red-900'
              : 'border-emerald-200 bg-emerald-50 text-emerald-950',
          ].join(' ')}
        >
          {msg.text}
        </div>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-4 rounded-xl border border-[#d8d8d8] bg-white p-5">
          <h2 className="font-authSerif text-lg text-[#121212]">Core details</h2>
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
          <div className="grid gap-4 sm:grid-cols-2">
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

        <div className="space-y-4 rounded-xl border border-[#d8d8d8] bg-white p-5">
          <h2 className="font-authSerif text-lg text-[#121212]">Application options</h2>
          <p className="text-[12px] text-[#6b6b6b]">
            Choose exactly how applicants apply for this job.
          </p>
          <div className="space-y-2">
            {JOB_APPLICATION_MODES.map((m) => (
              <label key={m} className="flex cursor-pointer items-center gap-2 rounded-lg border border-transparent px-2 py-1 text-[13px] transition-colors hover:border-[#ececec] hover:bg-[#faf9f6]">
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
                    } else if (m === 'loom') {
                      setAllowCv(false);
                      setAllowLoom(true);
                      setAllowStaffsavvy(false);
                    } else if (m === 'staffsavvy') {
                      setAllowCv(false);
                      setAllowLoom(false);
                      setAllowStaffsavvy(true);
                    }
                  }}
                />
                {jobApplicationModeLabel(m)}
              </label>
            ))}
          </div>
          <div className="rounded-lg border border-[#e8e8e8] bg-[#faf9f6] p-3 text-[12px] text-[#6b6b6b]">
            Modes: CV upload, Loom 1-minute link, StaffSavvy score (out of 5), or Combination.
          </div>
          {applicationMode === 'combination' ? (
            <div className="mt-3 space-y-2 border-t border-[#f0f0f0] pt-3">
              <p className="text-[12px] font-medium text-[#505050]">Enable for this role</p>
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
            </div>
          ) : null}
        </div>
      </div>

      <div className="space-y-4 rounded-xl border border-[#d8d8d8] bg-white p-5">
        <h2 className="font-authSerif text-lg text-[#121212]">Listing copy</h2>
        <div>
          <label className={labelClass} htmlFor="advert">
            Advert / overview
          </label>
          <textarea
            id="advert"
            rows={8}
            className={fieldClass}
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
            rows={5}
            className={fieldClass}
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
            rows={4}
            className={fieldClass}
            value={benefits}
            disabled={isArchived}
            onChange={(e) => setBenefits(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-4 rounded-xl border border-[#d8d8d8] bg-white p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-authSerif text-lg text-[#121212]">Job listing preview</h2>
          <span className="rounded-full border border-[#e8e8e8] bg-[#faf9f6] px-2.5 py-1 text-[11px] font-medium text-[#6b6b6b]">
            {job.status === 'live' ? 'Live format' : 'Draft preview'}
          </span>
        </div>
        <div className="overflow-hidden rounded-xl border border-[#ececec] bg-[#faf9f6]">
          <header className="border-b border-[#ececec] bg-white px-5 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#9b9b9b]">Your organisation</p>
            <h3 className="font-authSerif text-[24px] tracking-tight text-[#121212]">{title || 'Untitled role'}</h3>
            <p className="mt-1 text-[13px] text-[#6b6b6b]">
              {gradeLevel || 'Grade / level'}
              {' · '}
              {recruitmentContractLabel(contractType)}
              {' · '}
              {salaryBand || 'Salary band'}
            </p>
          </header>
          <div className="mx-auto max-w-2xl px-5 py-8">
            <section className="rounded-xl border border-[#e8e8e8] bg-white p-5 shadow-sm">
              <h4 className="text-[11px] font-semibold uppercase tracking-wide text-[#9b9b9b]">About the role</h4>
              <div className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed text-[#242424]">
                {advertCopy?.trim() || 'Details coming soon.'}
              </div>
            </section>

            {requirements?.trim() ? (
              <section className="mt-5 rounded-xl border border-[#e8e8e8] bg-white p-5 shadow-sm">
                <h4 className="text-[11px] font-semibold uppercase tracking-wide text-[#9b9b9b]">Requirements</h4>
                <div className="mt-2 whitespace-pre-wrap text-[14px] leading-relaxed text-[#242424]">{requirements}</div>
              </section>
            ) : null}

            {benefits?.trim() ? (
              <section className="mt-5 rounded-xl border border-[#e8e8e8] bg-white p-5 shadow-sm">
                <h4 className="text-[11px] font-semibold uppercase tracking-wide text-[#9b9b9b]">Benefits</h4>
                <div className="mt-2 whitespace-pre-wrap text-[14px] leading-relaxed text-[#242424]">{benefits}</div>
              </section>
            ) : null}

            <section className="mt-5 rounded-xl border border-[#d8ece5] bg-[#f0fdf9] p-5">
              <h4 className="text-[11px] font-semibold uppercase tracking-wide text-[#0f5132]">How to apply</h4>
              <p className="mt-2 text-[13px] leading-relaxed text-[#14532d]">
                Apply online - this vacancy accepts: {previewApplySummary}.
              </p>
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

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={pending || isArchived}
          onClick={save}
          className="inline-flex h-10 items-center justify-center rounded-lg bg-[#121212] px-4 text-[13px] font-medium text-[#faf9f6] transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {pending ? 'Saving…' : 'Save draft'}
        </button>
        {job.status === 'draft' ? (
          <button
            type="button"
            disabled={pending}
            onClick={publish}
            className="inline-flex h-10 items-center justify-center rounded-lg border border-[#d8d8d8] bg-white px-4 text-[13px] font-medium text-[#6b6b6b] transition-colors hover:bg-[#f5f4f1] hover:text-[#121212] disabled:opacity-60"
          >
            Publish
          </button>
        ) : null}
        {job.status === 'live' ? (
          <button
            type="button"
            disabled={pending}
            onClick={archive}
            className="inline-flex h-10 items-center justify-center rounded-lg border border-[#d8d8d8] bg-white px-4 text-[13px] font-medium text-[#b91c1c] hover:bg-red-50 disabled:opacity-60"
          >
            Archive
          </button>
        ) : null}
      </div>
    </div>
  );
}
