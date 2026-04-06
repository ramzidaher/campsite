'use client';

import { jobApplicationModeLabel } from '@/lib/jobs/labels';
import { tenantJobListingRelativePathClient } from '@/lib/tenant/adminUrl';
import Link from 'next/link';
import { useActionState, useMemo, useState } from 'react';
import { submitPublicJobApplication, type SubmitJobApplicationState } from './actions';

type Listing = {
  org_name: string;
  title: string;
  application_mode: string;
  allow_cv: boolean;
  allow_loom: boolean;
  allow_staffsavvy: boolean;
};

export function ApplyJobFormClient({
  jobSlug,
  listing,
  orgSlug,
}: {
  jobSlug: string;
  listing: Listing;
  orgSlug: string;
}) {
  const [state, formAction, pending] = useActionState<
    SubmitJobApplicationState | undefined,
    FormData
  >(submitPublicJobApplication, undefined);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [location, setLocation] = useState('');
  const [currentTitle, setCurrentTitle] = useState('');
  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [portfolioUrl, setPortfolioUrl] = useState('');
  const [motivationText, setMotivationText] = useState('');
  const [loomUrl, setLoomUrl] = useState('');
  const [score, setScore] = useState('');
  const [cvName, setCvName] = useState('');

  const done = state?.ok === true;
  const bits: string[] = [];
  if (listing.allow_cv) bits.push(jobApplicationModeLabel('cv'));
  if (listing.allow_loom) bits.push(jobApplicationModeLabel('loom'));
  if (listing.allow_staffsavvy) bits.push(jobApplicationModeLabel('staffsavvy'));

  const requiredCount = useMemo(() => {
    let count = 2;
    if (listing.application_mode === 'combination') count += 1;
    if (listing.application_mode !== 'combination') {
      if (listing.allow_cv && !listing.allow_loom && !listing.allow_staffsavvy) count += 1;
      if (listing.allow_loom && !listing.allow_cv && !listing.allow_staffsavvy) count += 1;
      if (listing.allow_staffsavvy && !listing.allow_cv && !listing.allow_loom) count += 1;
    }
    return count;
  }, [listing]);

  const channelsFilled = useMemo(() => {
    let count = 0;
    if (listing.allow_cv && cvName.trim()) count += 1;
    if (listing.allow_loom && loomUrl.trim()) count += 1;
    if (listing.allow_staffsavvy && score.trim()) count += 1;
    return count;
  }, [listing, cvName, loomUrl, score]);

  const completedCount = useMemo(() => {
    let count = 0;
    if (name.trim()) count += 1;
    if (email.trim()) count += 1;
    if (listing.application_mode === 'combination') {
      if (channelsFilled > 0) count += 1;
    } else {
      if (listing.allow_cv && !listing.allow_loom && !listing.allow_staffsavvy && cvName.trim()) count += 1;
      if (listing.allow_loom && !listing.allow_cv && !listing.allow_staffsavvy && loomUrl.trim()) count += 1;
      if (listing.allow_staffsavvy && !listing.allow_cv && !listing.allow_loom && score.trim()) count += 1;
    }
    return Math.min(count, requiredCount);
  }, [name, email, listing, channelsFilled, cvName, loomUrl, score, requiredCount]);

  const completionPct = Math.round((completedCount / Math.max(requiredCount, 1)) * 100);

  const fieldClass =
    'mt-0 w-full rounded-xl border border-[#d8d8d8] bg-white px-3 py-2.5 text-[15px] text-[#121212] outline-none transition focus:border-[#008B60] focus:ring-2 focus:ring-[#b8e8d7] disabled:opacity-60';
  const labelClass = 'mb-1 block text-[12px] font-medium text-[#505050]';

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#eefaf4_0%,#faf9f6_45%,#faf9f6_100%)] text-[#121212]">
      <header className="border-b border-[#ececec] bg-white/90 px-5 py-5 backdrop-blur">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#9b9b9b]">{listing.org_name}</p>
            <h1 className="font-authSerif text-[24px] tracking-tight text-[#121212]">Apply for {listing.title}</h1>
            <p className="mt-1 text-[13px] text-[#6b6b6b]">
              A short, guided form designed to reduce friction and repetition.
            </p>
          </div>
          <p className="text-[13px] text-[#6b6b6b]">
            <Link
              href={tenantJobListingRelativePathClient(jobSlug, orgSlug)}
              className="text-[#008B60] hover:underline"
            >
              Back to job
            </Link>
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-8">
        <section className="mb-5 rounded-2xl border border-[#dff2e9] bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-[13px] font-medium text-[#0f5135]">Application progress: {completionPct}% complete</p>
            <p className="text-[12px] text-[#6b6b6b]">
              {completedCount}/{requiredCount} key steps done
            </p>
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-[#e8f4ef]">
            <div
              className="h-full rounded-full bg-[#008B60] transition-all duration-300"
              style={{ width: `${completionPct}%` }}
              aria-hidden
            />
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-[11px] text-[#5f5f5f]">
            <span className="rounded-full border border-[#e4e4e4] bg-[#f7f7f7] px-2.5 py-1">~2-4 minutes</span>
            <span className="rounded-full border border-[#e4e4e4] bg-[#f7f7f7] px-2.5 py-1">No account required</span>
            <span className="rounded-full border border-[#e4e4e4] bg-[#f7f7f7] px-2.5 py-1">
              Private status portal after submit
            </span>
          </div>
        </section>

        {done ? (
          <div
            role="status"
            className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-[14px] text-emerald-950"
          >
            <p>{state.message}</p>
            <p className="mt-1 text-[12px] text-emerald-900">
              You cannot edit this application after submission. Use your portal link for updates.
            </p>
          </div>
        ) : null}

        {state?.ok === false ? (
          <div role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[14px] text-red-900">
            {state.error}
          </div>
        ) : null}

        <form action={formAction} className="space-y-5 rounded-2xl border border-[#e8e8e8] bg-white p-5 shadow-sm sm:p-6">
          <input type="hidden" name="job_slug" value={jobSlug} />
          <section className="rounded-xl border border-[#ececec] bg-[#fcfcfc] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#7a7a7a]">Step 1</p>
            <h2 className="mt-1 text-[16px] font-semibold text-[#121212]">Tell us who you are</h2>
            <p className="mt-1 text-[13px] text-[#5f5f5f]">
              We only ask for essentials so your application stays quick and clear.
            </p>
            <div className="mt-4 space-y-4">
              <div>
                <label className={labelClass} htmlFor="candidate_name">
                  Full name
                </label>
                <input
                  id="candidate_name"
                  name="candidate_name"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
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
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
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
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  disabled={pending || done}
                  autoComplete="tel"
                  className={fieldClass}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelClass} htmlFor="candidate_location">
                    Current location <span className="font-normal text-[#9b9b9b]">(optional)</span>
                  </label>
                  <input
                    id="candidate_location"
                    name="candidate_location"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    disabled={pending || done}
                    autoComplete="address-level2"
                    className={fieldClass}
                    placeholder="e.g. London, UK"
                  />
                </div>
                <div>
                  <label className={labelClass} htmlFor="current_title">
                    Current role <span className="font-normal text-[#9b9b9b]">(optional)</span>
                  </label>
                  <input
                    id="current_title"
                    name="current_title"
                    value={currentTitle}
                    onChange={(e) => setCurrentTitle(e.target.value)}
                    disabled={pending || done}
                    className={fieldClass}
                    placeholder="e.g. Senior Support Manager"
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelClass} htmlFor="linkedin_url">
                    LinkedIn profile <span className="font-normal text-[#9b9b9b]">(optional)</span>
                  </label>
                  <input
                    id="linkedin_url"
                    name="linkedin_url"
                    type="url"
                    value={linkedinUrl}
                    onChange={(e) => setLinkedinUrl(e.target.value)}
                    disabled={pending || done}
                    className={fieldClass}
                    placeholder="https://linkedin.com/in/..."
                  />
                </div>
                <div>
                  <label className={labelClass} htmlFor="portfolio_url">
                    Portfolio / website <span className="font-normal text-[#9b9b9b]">(optional)</span>
                  </label>
                  <input
                    id="portfolio_url"
                    name="portfolio_url"
                    type="url"
                    value={portfolioUrl}
                    onChange={(e) => setPortfolioUrl(e.target.value)}
                    disabled={pending || done}
                    className={fieldClass}
                    placeholder="https://your-portfolio.com"
                  />
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-[#ececec] bg-[#fcfcfc] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#7a7a7a]">Step 2</p>
            <h2 className="mt-1 text-[16px] font-semibold text-[#121212]">Share your application materials</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-[#505050]">
              This role accepts: {bits.length ? bits.join(', ') : jobApplicationModeLabel(listing.application_mode)}.
            </p>
            {listing.application_mode === 'combination' ? (
              <p className="mt-1 text-[12px] text-[#7a7a7a]">Provide at least one of the options below.</p>
            ) : null}
            <div className="mt-4 space-y-4">
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
                    onChange={(e) => setCvName(e.target.files?.[0]?.name ?? '')}
                    className={fieldClass}
                  />
                  {cvName ? <p className="mt-1 text-[12px] text-[#0f5135]">Attached: {cvName}</p> : null}
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
                    placeholder="https://www.loom.com/share/..."
                    value={loomUrl}
                    onChange={(e) => setLoomUrl(e.target.value)}
                    disabled={pending || done}
                    className={fieldClass}
                  />
                </div>
              ) : null}

              {listing.allow_staffsavvy ? (
                <div>
                  <label className={labelClass} htmlFor="staffsavvy_score">
                    StaffSavvy score (1-5)
                  </label>
                  <select
                    id="staffsavvy_score"
                    name="staffsavvy_score"
                    value={score}
                    onChange={(e) => setScore(e.target.value)}
                    disabled={pending || done}
                    className={fieldClass}
                  >
                    <option value="">Select...</option>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
            </div>
          </section>

          <section className="rounded-xl border border-[#ececec] bg-[#fcfcfc] p-4">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#7a7a7a]">Step 3</p>
            <h2 className="mt-1 text-[16px] font-semibold text-[#121212]">Submit with confidence</h2>
            <label className={`${labelClass} mt-3`} htmlFor="motivation_text">
              Why this role? <span className="font-normal text-[#9b9b9b]">(optional, but recommended)</span>
            </label>
            <textarea
              id="motivation_text"
              name="motivation_text"
              value={motivationText}
              onChange={(e) => setMotivationText(e.target.value)}
              disabled={pending || done}
              rows={4}
              className={fieldClass}
              placeholder="In 3-5 lines, share what excites you about this role and your strongest fit."
            />
            <p className="mt-1 text-[13px] text-[#5f5f5f]">
              After submitting, your application is locked and tracked in your private status portal.
            </p>
          </section>

          <div className="rounded-xl border border-[#e7efe9] bg-[#f5fbf8] px-4 py-3 text-[12px] text-[#355a4a]">
            Tip: clear, specific applications are usually reviewed faster.
          </div>

          <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
            <p className="text-[12px] text-[#7a7a7a]">You are almost done - one click to submit.</p>
            <button
              type="submit"
              disabled={pending || done}
              className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-[#008B60] px-5 text-[14px] font-medium text-white transition hover:bg-[#007a54] disabled:opacity-60 sm:w-auto sm:min-w-[220px]"
            >
              {pending ? 'Submitting...' : done ? 'Submitted' : 'Submit application'}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
