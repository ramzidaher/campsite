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
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [location, setLocation] = useState('');
  const [currentTitle, setCurrentTitle] = useState('');
  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [portfolioUrl, setPortfolioUrl] = useState('');
  const [motivationText, setMotivationText] = useState('');
  const [loomUrl, setLoomUrl] = useState('');
  const [fitScore, setFitScore] = useState('');
  const [staffsavvyScore, setStaffsavvyScore] = useState('');
  const [cvName, setCvName] = useState('');
  const [coverLetter, setCoverLetter] = useState('');
  const [currentStep, setCurrentStep] = useState(0);
  const [consent, setConsent] = useState(false);
  const [toast, setToast] = useState('');
  const [selectedWorkStyle, setSelectedWorkStyle] = useState('');

  const done = state?.ok === true;
  const fullName = `${firstName} ${lastName}`.trim();
  const bits: string[] = [];
  if (listing.allow_cv) bits.push(jobApplicationModeLabel('cv'));
  if (listing.allow_loom) bits.push(jobApplicationModeLabel('loom'));
  if (listing.allow_staffsavvy) bits.push(jobApplicationModeLabel('staffsavvy'));

  const stepReady = useMemo(() => {
    const step0 = Boolean(firstName.trim() && lastName.trim() && email.includes('@'));
    const step1 = Boolean(motivationText.trim().length > 10 && (fitScore || selectedWorkStyle));
    const hasAnyChannel =
      (listing.allow_cv && cvName.trim()) ||
      (listing.allow_loom && loomUrl.trim()) ||
      (listing.allow_staffsavvy && staffsavvyScore.trim());
    const requiresAny = listing.application_mode === 'combination';
    const requiresCvOnly = listing.allow_cv && !listing.allow_loom && !listing.allow_staffsavvy;
    const requiresLoomOnly = listing.allow_loom && !listing.allow_cv && !listing.allow_staffsavvy;
    const requiresStaffsavvyOnly = listing.allow_staffsavvy && !listing.allow_cv && !listing.allow_loom;
    const step2 = requiresAny
      ? Boolean(hasAnyChannel)
      : (requiresCvOnly ? Boolean(cvName.trim()) : true) &&
        (requiresLoomOnly ? Boolean(loomUrl.trim()) : true) &&
        (requiresStaffsavvyOnly ? Boolean(staffsavvyScore.trim()) : true);
    const step3 = consent;
    return [step0, step1, step2, step3];
  }, [
    firstName,
    lastName,
    email,
    motivationText,
    fitScore,
    staffsavvyScore,
    selectedWorkStyle,
    listing,
    cvName,
    loomUrl,
    consent,
  ]);

  const progressLabel = ['barely started', 'making progress', 'halfway hero', 'almost there!', 'submitted!'];
  const progressPct = [5, 35, 65, 90, 100][done ? 4 : currentStep] ?? 5;
  const banters = [
    {
      icon: '👋',
      msg: "Hey! Applying should take just a few minutes.",
      em: 'We promise to keep this lightweight and straightforward.',
    },
    {
      icon: '🎯',
      msg: 'Great start. A couple of quick questions next.',
      em: 'Clear answers help us review faster.',
    },
    {
      icon: '📎',
      msg: 'Nice. Add your application materials and you are almost done.',
      em: 'One strong submission channel is enough for combination roles.',
    },
    {
      icon: '🏁',
      msg: 'Final check before submit.',
      em: 'Take a breath, review, and send it.',
    },
  ];

  function goNext() {
    if (!stepReady[currentStep]) return;
    setCurrentStep((s) => Math.min(3, s + 1));
    const messages = ['', 'Step 1 complete.', 'Questions complete.', 'Materials added.'];
    const nextMessage = messages[currentStep + 1];
    if (nextMessage) {
      setToast(nextMessage);
      setTimeout(() => setToast(''), 2400);
    }
  }

  function goBack() {
    setCurrentStep((s) => Math.max(0, s - 1));
  }

  function prefillLinkedIn() {
    setFirstName('Alex');
    setLastName('Taylor');
    setEmail('you@example.com');
    setPhone('+44 7700 000000');
    setLocation('Brighton, UK');
    setLinkedinUrl('https://linkedin.com/in/alextaylor');
    setPortfolioUrl('https://yoursite.com');
    setToast('Demo LinkedIn import complete.');
    setTimeout(() => setToast(''), 2400);
  }

  const baseField =
    'w-full rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2.5 text-[14px] text-[#121212] outline-none transition focus:border-[#121212]';
  const labelClass = 'mb-1 block text-[12px] font-medium uppercase tracking-[0.3px] text-[#6b6b6b]';

  return (
    <div className="min-h-screen bg-[#faf9f6] px-5 py-8 text-[#121212]">
      <main className="mx-auto w-full max-w-[660px]">
        <section className="mb-6 rounded-[11px] border border-[#d8d8d8] bg-[#f5f4f1] p-6">
          <div className="mb-2 inline-flex rounded-full border border-[#bbf7d0] bg-[#dcfce7] px-3 py-1 text-[12px] font-medium text-[#166534]">
            Accepting applications
          </div>
          <h1 className="font-authSerif text-[34px] leading-[1.15] text-[#121212]">{listing.title}</h1>
          <p className="mt-1 text-[13px] text-[#6b6b6b]">{listing.org_name}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="rounded-full border border-[#d8d8d8] bg-[#eeecea] px-3 py-1 text-[12px] font-medium text-[#6b6b6b]">
              {jobApplicationModeLabel(listing.application_mode)}
            </span>
            <span className="rounded-full border border-[#d8d8d8] bg-[#eeecea] px-3 py-1 text-[12px] font-medium text-[#6b6b6b]">
              {bits.length ? bits.join(' + ') : 'Guided application'}
            </span>
            <Link
              href={tenantJobListingRelativePathClient(jobSlug, orgSlug)}
              className="rounded-full border border-[#fde68a] bg-[#fef3c7] px-3 py-1 text-[12px] font-medium text-[#92400e]"
            >
              Back to job
            </Link>
          </div>
        </section>

        {!done ? (
          <section className="mb-6 rounded-[11px] border border-[#d8d8d8] bg-[#f5f4f1] px-6 py-5">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[13px] font-medium">Your application</span>
              <span className="text-[12px] text-[#9b9b9b]">Step {currentStep + 1} of 4</span>
            </div>
            <div className="mb-3 grid grid-cols-4 items-start">
              {['You', 'Questions', 'CV', 'Review'].map((label, idx) => (
                <div key={label} className="relative flex flex-col items-center">
                  <div
                    className={[
                      'z-10 flex h-7 w-7 items-center justify-center rounded-full border-2 text-[11px] font-semibold',
                      idx < currentStep ? 'border-[#15803d] bg-[#15803d] text-white' : '',
                      idx === currentStep ? 'border-[#121212] bg-[#121212] text-white' : '',
                      idx > currentStep ? 'border-[#d8d8d8] bg-[#faf9f6] text-[#9b9b9b]' : '',
                    ].join(' ')}
                  >
                    {idx < currentStep ? '✓' : idx + 1}
                  </div>
                  {idx < 3 ? (
                    <div
                      className={`absolute left-[calc(50%+14px)] top-[13px] h-[2px] w-[calc(100%-28px)] ${
                        idx < currentStep ? 'bg-[#15803d]' : 'bg-[#d8d8d8]'
                      }`}
                    />
                  ) : null}
                  <span
                    className={`mt-1 text-[10px] ${idx === currentStep ? 'font-medium text-[#121212]' : 'text-[#9b9b9b]'}`}
                  >
                    {label}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[12px] text-[#9b9b9b]">Application pain level:</span>
              <div className="h-1 flex-1 overflow-hidden rounded bg-[#d8d8d8]">
                <div className="h-full rounded bg-[#15803d] transition-all" style={{ width: `${progressPct}%` }} />
              </div>
              <span className="text-[12px] text-[#9b9b9b]">{progressLabel[currentStep]}</span>
            </div>
          </section>
        ) : null}

        {done ? (
          <section className="rounded-[11px] border border-[#d8d8d8] bg-white p-6 text-center">
            <div className="mx-auto mb-5 flex h-[72px] w-[72px] items-center justify-center rounded-full border-2 border-[#bbf7d0] bg-[#dcfce7] text-[28px]">
              ✓
            </div>
            <h2 className="font-authSerif text-[30px]">Application submitted</h2>
            <p className="mx-auto mt-2 max-w-[420px] text-[14px] leading-relaxed text-[#6b6b6b]">{state.message}</p>
          </section>
        ) : null}

        {state?.ok === false ? (
          <div role="alert" className="mb-5 rounded-[11px] border border-red-200 bg-red-50 px-4 py-3 text-[14px] text-red-900">
            {state.error}
          </div>
        ) : null}

        <form action={formAction}>
          <input type="hidden" name="job_slug" value={jobSlug} />
          <input type="hidden" name="candidate_name" value={fullName} />
          <input type="hidden" name="candidate_email" value={email} />
          <input type="hidden" name="candidate_phone" value={phone} />
          <input type="hidden" name="candidate_location" value={location} />
          <input type="hidden" name="current_title" value={currentTitle} />
          <input type="hidden" name="linkedin_url" value={linkedinUrl} />
          <input type="hidden" name="portfolio_url" value={portfolioUrl} />
          <input type="hidden" name="motivation_text" value={motivationText} />
          <input type="hidden" name="loom_url" value={loomUrl} />
          <input type="hidden" name="staffsavvy_score" value={listing.allow_staffsavvy ? staffsavvyScore : ''} />

          {!done ? (
            <div className="mb-4 flex items-start gap-3 rounded-[11px] bg-[#121212] px-4 py-3 text-[13px] text-[#faf9f6]">
              <span className="text-[16px]">{banters[currentStep]?.icon}</span>
              <div>
                <p>{banters[currentStep]?.msg}</p>
                <p className="mt-1 text-[12px] italic opacity-75">{banters[currentStep]?.em}</p>
              </div>
            </div>
          ) : null}

          <section className={`${currentStep === 0 && !done ? 'block' : 'hidden'}`}>
            <div className="rounded-[11px] border border-[#d8d8d8] bg-white p-6">
              <h2 className="mb-4 border-b border-[#d8d8d8] pb-2 font-authSerif text-[22px]">Your details</h2>
              <button
                type="button"
                onClick={prefillLinkedIn}
                className="mb-3 flex w-full items-center gap-3 rounded-[9px] border border-[#d8d8d8] bg-[#eeecea] px-4 py-3 text-left hover:border-[#9b9b9b]"
              >
                <span className="inline-flex h-[22px] w-[22px] items-center justify-center rounded bg-[#0077B5] text-[12px] font-bold text-white">
                  in
                </span>
                <span className="text-[13px] text-[#6b6b6b]">
                  <strong className="text-[#121212]">Import from LinkedIn</strong> - skip the typing
                </span>
                <span className="ml-auto text-[18px]">→</span>
              </button>
              <p className="mb-4 text-center text-[12px] text-[#9b9b9b]">or fill in manually</p>
              <div className="mb-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelClass} htmlFor="first_name">
                    First name *
                  </label>
                  <input
                    id="first_name"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className={baseField}
                    placeholder="e.g. Alex"
                    disabled={pending}
                  />
                </div>
                <div>
                  <label className={labelClass} htmlFor="last_name">
                    Last name *
                  </label>
                  <input
                    id="last_name"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className={baseField}
                    placeholder="e.g. Taylor"
                    disabled={pending}
                  />
                </div>
              </div>
              <div className="mb-4">
                <label className={labelClass} htmlFor="candidate_email_visible">
                  Email address *
                </label>
                <input
                  id="candidate_email_visible"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={baseField}
                  placeholder="you@example.com"
                  disabled={pending}
                />
              </div>
              <div className="mb-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelClass} htmlFor="candidate_phone_visible">
                    Phone
                  </label>
                  <input
                    id="candidate_phone_visible"
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className={baseField}
                    placeholder="+44 7700 000000"
                    disabled={pending}
                  />
                </div>
                <div>
                  <label className={labelClass} htmlFor="candidate_location_visible">
                    Location
                  </label>
                  <input
                    id="candidate_location_visible"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    className={baseField}
                    placeholder="Brighton, UK"
                    disabled={pending}
                  />
                </div>
              </div>
              <div className="mb-3 grid gap-4 sm:grid-cols-2">
                <div>
                  <label className={labelClass} htmlFor="current_title_visible">
                    Current role
                  </label>
                  <input
                    id="current_title_visible"
                    value={currentTitle}
                    onChange={(e) => setCurrentTitle(e.target.value)}
                    className={baseField}
                    placeholder="e.g. Product Designer"
                    disabled={pending}
                  />
                </div>
                <div>
                  <label className={labelClass} htmlFor="portfolio_url_visible">
                    LinkedIn / portfolio URL
                  </label>
                  <input
                    id="portfolio_url_visible"
                    type="url"
                    value={portfolioUrl}
                    onChange={(e) => setPortfolioUrl(e.target.value)}
                    className={baseField}
                    placeholder="https://yoursite.com"
                    disabled={pending}
                  />
                </div>
              </div>
              <div>
                <label className={labelClass} htmlFor="linkedin_url_visible">
                  LinkedIn profile URL
                </label>
                <input
                  id="linkedin_url_visible"
                  type="url"
                  value={linkedinUrl}
                  onChange={(e) => setLinkedinUrl(e.target.value)}
                  className={baseField}
                  placeholder="https://linkedin.com/in/..."
                  disabled={pending}
                />
              </div>
            </div>
            <div className="mt-3 flex gap-3">
              <button
                type="button"
                onClick={goNext}
                disabled={!stepReady[0] || pending}
                className="flex-1 rounded-[11px] bg-[#121212] px-4 py-3 text-[14px] font-medium text-white disabled:bg-[#d8d8d8] disabled:text-[#9b9b9b]"
              >
                Continue →
              </button>
            </div>
          </section>

          <section className={`${currentStep === 1 && !done ? 'block' : 'hidden'}`}>
            <div className="rounded-[11px] border border-[#d8d8d8] bg-white p-6">
              <h2 className="mb-4 border-b border-[#d8d8d8] pb-2 font-authSerif text-[22px]">A few quick questions</h2>
              <div className="mb-3 rounded-[9px] border border-[#d8d8d8] bg-[#f5f4f1] p-4">
                <p className="mb-2 text-[14px] font-medium">1. What draws you to this role specifically?</p>
                <textarea
                  value={motivationText}
                  onChange={(e) => setMotivationText(e.target.value)}
                  className={`${baseField} min-h-[92px] resize-y`}
                  disabled={pending}
                />
                <p className={`mt-1 text-right text-[11px] ${motivationText.length > 255 ? 'text-[#92400e]' : 'text-[#9b9b9b]'}`}>
                  {motivationText.length} / 300
                </p>
              </div>
              <div className="mb-3 rounded-[9px] border border-[#d8d8d8] bg-[#f5f4f1] p-4">
                <p className="mb-2 text-[14px] font-medium">2. On a scale of 1-5, how would you rate your fit?</p>
                <div className="flex flex-wrap gap-2">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setFitScore(String(n))}
                      className={`h-9 w-9 rounded-lg border text-[13px] ${
                        fitScore === String(n)
                          ? 'border-[#121212] bg-[#121212] text-white'
                          : 'border-[#d8d8d8] bg-[#faf9f6] text-[#6b6b6b] hover:border-[#121212]'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              <div className="rounded-[9px] border border-[#d8d8d8] bg-[#f5f4f1] p-4">
                <p className="mb-2 text-[14px] font-medium">3. What&apos;s your preferred working style?</p>
                <div className="space-y-2">
                  {[
                    'Deep focus, async',
                    'Collaborative with frequent feedback',
                    'Mix of both depending on task',
                    'Flexible based on the team needs',
                  ].map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => setSelectedWorkStyle(item)}
                      className={`w-full rounded-lg border px-3 py-2 text-left text-[13px] ${
                        selectedWorkStyle === item
                          ? 'border-[#121212] bg-[#121212] text-white'
                          : 'border-[#d8d8d8] bg-[#faf9f6] text-[#121212] hover:border-[#121212]'
                      }`}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-3 flex gap-3">
              <button
                type="button"
                onClick={goBack}
                className="flex-1 rounded-[11px] border border-[#d8d8d8] bg-[#faf9f6] px-4 py-3 text-[14px] text-[#6b6b6b] hover:bg-[#f5f4f1]"
              >
                ← Back
              </button>
              <button
                type="button"
                onClick={goNext}
                disabled={!stepReady[1] || pending}
                className="flex-[2] rounded-[11px] bg-[#121212] px-4 py-3 text-[14px] font-medium text-white disabled:bg-[#d8d8d8] disabled:text-[#9b9b9b]"
              >
                Continue →
              </button>
            </div>
          </section>

          <section className={`${currentStep === 2 && !done ? 'block' : 'hidden'}`}>
            <div className="rounded-[11px] border border-[#d8d8d8] bg-white p-6">
              <h2 className="mb-4 border-b border-[#d8d8d8] pb-2 font-authSerif text-[22px]">Your application materials</h2>
              {listing.allow_cv ? (
                <div className="mb-4">
                  <label className={labelClass} htmlFor="cv">
                    CV upload
                  </label>
                  <input
                    id="cv"
                    name="cv"
                    type="file"
                    accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                    disabled={pending}
                    onChange={(e) => setCvName(e.target.files?.[0]?.name ?? '')}
                    className={baseField}
                  />
                  {cvName ? <p className="mt-1 text-[12px] text-[#15803d]">Uploaded: {cvName}</p> : null}
                </div>
              ) : null}
              {listing.allow_loom ? (
                <div className="mb-4">
                  <label className={labelClass} htmlFor="loom_url_visible">
                    Loom URL
                  </label>
                  <input
                    id="loom_url_visible"
                    value={loomUrl}
                    onChange={(e) => setLoomUrl(e.target.value)}
                    className={baseField}
                    placeholder="https://www.loom.com/share/..."
                    disabled={pending}
                  />
                </div>
              ) : null}
              {listing.allow_staffsavvy ? (
                <div className="mb-4">
                  <label className={labelClass} htmlFor="staffsavvy_score_visible">
                    StaffSavvy score (1-5)
                  </label>
                  <select
                    id="staffsavvy_score_visible"
                    value={staffsavvyScore}
                    onChange={(e) => setStaffsavvyScore(e.target.value)}
                    className={baseField}
                    disabled={pending}
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
              <div>
                <label className={labelClass} htmlFor="cover_letter">
                  Cover letter (optional)
                </label>
                <textarea
                  id="cover_letter"
                  value={coverLetter}
                  onChange={(e) => setCoverLetter(e.target.value)}
                  className={`${baseField} min-h-[100px] resize-y`}
                  disabled={pending}
                />
              </div>
            </div>
            <div className="mt-3 flex gap-3">
              <button
                type="button"
                onClick={goBack}
                className="flex-1 rounded-[11px] border border-[#d8d8d8] bg-[#faf9f6] px-4 py-3 text-[14px] text-[#6b6b6b] hover:bg-[#f5f4f1]"
              >
                ← Back
              </button>
              <button
                type="button"
                onClick={goNext}
                disabled={!stepReady[2] || pending}
                className="flex-[2] rounded-[11px] bg-[#121212] px-4 py-3 text-[14px] font-medium text-white disabled:bg-[#d8d8d8] disabled:text-[#9b9b9b]"
              >
                Continue →
              </button>
            </div>
          </section>

          <section className={`${currentStep === 3 && !done ? 'block' : 'hidden'}`}>
            <div className="rounded-[11px] border border-[#d8d8d8] bg-white p-6">
              <h2 className="mb-4 border-b border-[#d8d8d8] pb-2 font-authSerif text-[22px]">Review & submit</h2>
              <div className="space-y-2 text-[13px]">
                {[
                  ['Name', fullName || '-'],
                  ['Email', email || '-'],
                  ['Role fit score', fitScore || '-'],
                  ['Working style', selectedWorkStyle || '-'],
                  ['StaffSavvy score', listing.allow_staffsavvy ? staffsavvyScore || '-' : 'Not required'],
                  ['CV', cvName || 'Not uploaded'],
                  ['Motivation', motivationText ? `${motivationText.slice(0, 70)}...` : '-'],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-start justify-between border-b border-[#eeecea] py-2 last:border-b-0">
                    <span className="text-[#6b6b6b]">{label}</span>
                    <span className="max-w-[55%] text-right font-medium text-[#121212]">{value}</span>
                  </div>
                ))}
              </div>
            </div>
            <label className="mt-3 flex items-start gap-2 text-[13px] text-[#6b6b6b]">
              <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1" />
              I confirm this information is accurate.
            </label>
            <div className="mt-3 flex gap-3">
              <button
                type="button"
                onClick={goBack}
                className="flex-1 rounded-[11px] border border-[#d8d8d8] bg-[#faf9f6] px-4 py-3 text-[14px] text-[#6b6b6b] hover:bg-[#f5f4f1]"
              >
                ← Back
              </button>
              <button
                type="submit"
                disabled={!stepReady[3] || pending}
                className="flex-[2] rounded-[11px] bg-[#121212] px-4 py-3 text-[14px] font-medium text-white disabled:bg-[#d8d8d8] disabled:text-[#9b9b9b]"
              >
                {pending ? 'Submitting...' : 'Submit application ✓'}
              </button>
            </div>
          </section>
        </form>

        {toast ? (
          <div className="fixed bottom-5 right-5 rounded-[11px] bg-[#121212] px-4 py-2 text-[13px] text-white shadow-lg">{toast}</div>
        ) : null}
      </main>
    </div>
  );
}
