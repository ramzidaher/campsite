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
    'mt-0 w-full rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px] text-[#121212] outline-none focus:border-[#008B60] focus:ring-1 focus:ring-[#008B60]';
  const labelClass = 'mb-1 block text-[12px] font-medium text-[#505050]';

  const showPublic = job.status === 'live' && job.slug && !job.slug.startsWith('draft-');
  const publicUrl = showPublic ? tenantJobPublicUrl(orgSlug, job.slug) : '';
  const isArchived = job.status === 'archived';

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
      router.push('/admin/jobs');
    });
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[12px] font-medium uppercase tracking-wide text-[#9b9b9b]">
            <Link href="/admin/jobs" className="text-[#008B60] hover:underline">
              Job listings
            </Link>
            <span aria-hidden className="mx-1.5 text-[#cfcfcf]">
              /
            </span>
            Edit
          </p>
          <h1 className="mt-1 font-authSerif text-[22px] tracking-tight text-[#121212]">{title || 'Job'}</h1>
          <p className="mt-1 text-[13px] text-[#6b6b6b]">
            Status: {jobListingStatusLabel(job.status)}
            {job.status === 'draft' ? ' · Drafts use a temporary URL until you publish.' : null}
            {isArchived ? ' · This listing is archived (read-only).' : null}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {showPublic ? (
            <button
              type="button"
              onClick={() => void navigator.clipboard.writeText(publicUrl)}
              className="inline-flex h-9 items-center justify-center rounded-lg border border-[#d8d8d8] bg-white px-3 text-[13px] font-medium text-[#121212] hover:bg-[#fafafa]"
            >
              Copy public link
            </button>
          ) : null}
          <Link
            href={requestHref}
            className="inline-flex h-9 items-center justify-center rounded-lg border border-[#d8d8d8] bg-white px-3 text-[13px] font-medium text-[#121212] hover:bg-[#fafafa]"
          >
            Recruitment request
          </Link>
          {job.status === 'live' ? (
            <Link
              href={`/admin/jobs/${job.id}/applications`}
              className="inline-flex h-9 items-center justify-center rounded-lg border border-[#008B60] bg-[#f0fdf9] px-3 text-[13px] font-medium text-[#008B60] hover:bg-[#e6faf4]"
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
        <div className="space-y-4 rounded-xl border border-[#e8e8e8] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
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

        <div className="space-y-4 rounded-xl border border-[#e8e8e8] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <h2 className="font-authSerif text-lg text-[#121212]">Application options</h2>
          <p className="text-[12px] text-[#6b6b6b]">
            These settings control what candidates submit on the public apply form for this listing.
          </p>
          <div className="space-y-2">
            {JOB_APPLICATION_MODES.map((m) => (
              <label key={m} className="flex cursor-pointer items-center gap-2 text-[13px]">
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

      <div className="space-y-4 rounded-xl border border-[#e8e8e8] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
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

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={pending || isArchived}
          onClick={save}
          className="inline-flex h-10 items-center justify-center rounded-lg bg-[#008B60] px-4 text-[13px] font-medium text-white transition hover:bg-[#007a54] disabled:opacity-60"
        >
          {pending ? 'Saving…' : 'Save draft'}
        </button>
        {job.status === 'draft' ? (
          <button
            type="button"
            disabled={pending}
            onClick={publish}
            className="inline-flex h-10 items-center justify-center rounded-lg border border-[#008B60] bg-white px-4 text-[13px] font-medium text-[#008B60] hover:bg-[#f0fdf9] disabled:opacity-60"
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
