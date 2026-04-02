'use client';

import { jobApplicationModeLabel } from '@/lib/jobs/labels';
import Link from 'next/link';
import { useActionState } from 'react';
import { submitPublicJobApplication, type SubmitJobApplicationState } from './actions';

type Listing = {
  org_name: string;
  title: string;
  application_mode: string;
  allow_cv: boolean;
  allow_loom: boolean;
  allow_staffsavvy: boolean;
};

export function ApplyJobFormClient({ jobSlug, listing }: { jobSlug: string; listing: Listing }) {
  const [state, formAction, pending] = useActionState<
    SubmitJobApplicationState | undefined,
    FormData
  >(submitPublicJobApplication, undefined);

  const done = state?.ok === true;
  const bits: string[] = [];
  if (listing.allow_cv) bits.push(jobApplicationModeLabel('cv'));
  if (listing.allow_loom) bits.push(jobApplicationModeLabel('loom'));
  if (listing.allow_staffsavvy) bits.push(jobApplicationModeLabel('staffsavvy'));

  const fieldClass =
    'mt-0 w-full rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[15px] text-[#121212] outline-none focus:border-[#008B60] focus:ring-1 focus:ring-[#008B60] disabled:opacity-60';
  const labelClass = 'mb-1 block text-[12px] font-medium text-[#505050]';

  return (
    <div className="min-h-screen bg-[#faf9f6] text-[#121212]">
      <header className="border-b border-[#ececec] bg-white px-5 py-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[#9b9b9b]">{listing.org_name}</p>
        <h1 className="font-authSerif text-[22px] tracking-tight text-[#121212]">Apply — {listing.title}</h1>
        <p className="mt-1 text-[13px] text-[#6b6b6b]">
          <Link href={`/jobs/${encodeURIComponent(jobSlug)}`} className="text-[#008B60] hover:underline">
            Back to job
          </Link>
        </p>
      </header>

      <main className="mx-auto max-w-lg px-5 py-8">
        {done ? (
          <div
            role="status"
            className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[14px] text-emerald-950"
          >
            <p>{state.message}</p>
            <p className="mt-1 text-[12px] text-emerald-900">
              You cannot edit this application after submission. Use your portal link for updates.
            </p>
          </div>
        ) : null}

        {state?.ok === false ? (
          <div role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[14px] text-red-900">
            {state.error}
          </div>
        ) : null}

        <form action={formAction} className="space-y-4 rounded-xl border border-[#e8e8e8] bg-white p-5 shadow-sm">
          <input type="hidden" name="job_slug" value={jobSlug} />
          <p className="text-[13px] leading-relaxed text-[#505050]">
            This role accepts: {bits.length ? bits.join(', ') : jobApplicationModeLabel(listing.application_mode)}.
          </p>
          <p className="text-[12px] text-[#9b9b9b]">After submitting, your application is locked and tracked in your private status portal.</p>

          <div>
            <label className={labelClass} htmlFor="candidate_name">
              Full name
            </label>
            <input
              id="candidate_name"
              name="candidate_name"
              required
              disabled={pending || done}
              autoComplete="name"
              className={fieldClass}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="candidate_email">
              Email
            </label>
            <input
              id="candidate_email"
              name="candidate_email"
              type="email"
              required
              disabled={pending || done}
              autoComplete="email"
              className={fieldClass}
            />
          </div>
          <div>
            <label className={labelClass} htmlFor="candidate_phone">
              Phone <span className="font-normal text-[#9b9b9b]">(optional)</span>
            </label>
            <input
              id="candidate_phone"
              name="candidate_phone"
              type="tel"
              disabled={pending || done}
              autoComplete="tel"
              className={fieldClass}
            />
          </div>

          {listing.allow_cv ? (
            <div>
              <label className={labelClass} htmlFor="cv">
                CV (PDF recommended)
              </label>
              <input
                id="cv"
                name="cv"
                type="file"
                accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                disabled={pending || done}
                className={fieldClass}
              />
            </div>
          ) : null}

          {listing.allow_loom ? (
            <div>
              <label className={labelClass} htmlFor="loom_url">
                Loom video URL
              </label>
              <input
                id="loom_url"
                name="loom_url"
                type="url"
                placeholder="https://www.loom.com/share/…"
                disabled={pending || done}
                className={fieldClass}
              />
            </div>
          ) : null}

          {listing.allow_staffsavvy ? (
            <div>
              <label className={labelClass} htmlFor="staffsavvy_score">
                StaffSavvy score (1–5)
              </label>
              <select
                id="staffsavvy_score"
                name="staffsavvy_score"
                defaultValue=""
                disabled={pending || done}
                className={fieldClass}
              >
                <option value="">Select…</option>
                {[1, 2, 3, 4, 5].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <button
            type="submit"
            disabled={pending || done}
            className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-[#008B60] px-4 text-[14px] font-medium text-white transition hover:bg-[#007a54] disabled:opacity-60"
          >
            {pending ? 'Submitting…' : done ? 'Submitted' : 'Submit application'}
          </button>
        </form>
      </main>
    </div>
  );
}
