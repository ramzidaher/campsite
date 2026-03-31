'use client';

import { createJobListingFromRequest } from '@/app/(main)/admin/jobs/actions';
import { setRecruitmentRequestStatusAction } from '@/app/(main)/admin/recruitment/actions';
import {
  recruitmentContractLabel,
  recruitmentHireReasonLabel,
  recruitmentStatusLabel,
  recruitmentUrgencyLabel,
} from '@/lib/recruitment/labels';
import { RECRUITMENT_REQUEST_STATUSES, type RecruitmentRequestStatus } from '@campsite/types';
import { tenantJobPublicUrl } from '@/lib/tenant/adminUrl';
import { jobListingStatusLabel } from '@/lib/jobs/labels';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';

export type RecruitmentDetail = {
  id: string;
  job_title: string;
  grade_level: string;
  salary_band: string;
  reason_for_hire: string;
  start_date_needed: string;
  contract_type: string;
  ideal_candidate_profile: string;
  specific_requirements: string | null;
  status: string;
  urgency: string;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  created_by: string;
  department_id: string;
  departments: { name: string } | { name: string }[] | null;
  submitter: { full_name: string } | { full_name: string }[] | null;
};

export type StatusEventRow = {
  id: string;
  from_status: string | null;
  to_status: string;
  note: string | null;
  created_at: string;
  profiles: { full_name: string } | { full_name: string }[] | null;
};

export function AdminRecruitmentDetailClient({
  request: req,
  events,
  jobListing,
  orgSlug,
}: {
  request: RecruitmentDetail;
  events: StatusEventRow[];
  jobListing: { id: string; status: string; slug: string } | null;
  orgSlug: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState(req.status);
  const [statusNote, setStatusNote] = useState('');
  const [listingErr, setListingErr] = useState<string | null>(null);

  useEffect(() => {
    setStatus(req.status);
  }, [req.status]);

  const d = req.departments;
  const deptName = Array.isArray(d) ? d[0]?.name : d?.name;
  const sub = req.submitter;
  const submitterName = Array.isArray(sub) ? sub[0]?.full_name : sub?.full_name;

  function applyStatus() {
    setError(null);
    if (status === req.status && !statusNote.trim()) return;
    startTransition(async () => {
      const res = await setRecruitmentRequestStatusAction(req.id, status, statusNote.trim() || null);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setStatusNote('');
      router.refresh();
    });
  }

  function openOrCreateListing() {
    setListingErr(null);
    startTransition(async () => {
      if (jobListing?.id) {
        router.push(`/admin/jobs/${jobListing.id}/edit`);
        return;
      }
      const res = await createJobListingFromRequest(req.id);
      if (!res.ok) {
        setListingErr(res.error);
        return;
      }
      router.push(`/admin/jobs/${res.jobId}/edit`);
    });
  }

  const fieldClass =
    'mt-0 w-full rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px] text-[#121212] outline-none focus:border-[#008B60] focus:ring-1 focus:ring-[#008B60]';

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[12px] font-medium uppercase tracking-wide text-[#9b9b9b]">
            <Link href="/admin/recruitment" className="text-[#008B60] hover:underline">
              Recruitment
            </Link>
            <span aria-hidden className="mx-1.5 text-[#cfcfcf]">
              /
            </span>
            Request
          </p>
          <h1 className="mt-1 font-authSerif text-[22px] tracking-tight text-[#121212]">{req.job_title}</h1>
          <p className="mt-1 text-[13px] text-[#6b6b6b]">
            {deptName ?? 'Department'} · Requested by {submitterName?.trim() || '—'}
          </p>
        </div>
        <div className="rounded-lg border border-[#ececec] bg-[#fafafa] px-3 py-2 text-[12px] text-[#505050]">
          {req.archived_at ? (
            <span>
              Archived · {recruitmentStatusLabel(req.status)}
            </span>
          ) : (
            <span>Open · {recruitmentStatusLabel(req.status)}</span>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-5 rounded-xl border border-[#e8e8e8] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <h2 className="font-authSerif text-lg text-[#121212]">Brief</h2>
          <dl className="grid gap-3 text-[13px] sm:grid-cols-2">
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-[#9b9b9b]">Urgency</dt>
              <dd className="mt-0.5 text-[#242424]">{recruitmentUrgencyLabel(req.urgency)}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-[#9b9b9b]">Grade / level</dt>
              <dd className="mt-0.5 text-[#242424]">{req.grade_level}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-[#9b9b9b]">Salary band</dt>
              <dd className="mt-0.5 text-[#242424]">{req.salary_band}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-[#9b9b9b]">Reason</dt>
              <dd className="mt-0.5 text-[#242424]">{recruitmentHireReasonLabel(req.reason_for_hire)}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-[#9b9b9b]">Start date needed</dt>
              <dd className="mt-0.5 text-[#242424]">
                {new Date(`${req.start_date_needed}T12:00:00.000Z`).toLocaleDateString(undefined, {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-[#9b9b9b]">Contract</dt>
              <dd className="mt-0.5 text-[#242424]">{recruitmentContractLabel(req.contract_type)}</dd>
            </div>
          </dl>
          <div>
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[#9b9b9b]">Ideal candidate</h3>
            <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-[#242424]">
              {req.ideal_candidate_profile}
            </p>
          </div>
          {req.specific_requirements?.trim() ? (
            <div>
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[#9b9b9b]">
                Specific requirements
              </h3>
              <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-[#242424]">
                {req.specific_requirements}
              </p>
            </div>
          ) : null}
        </div>

        <div className="space-y-5">
          {req.status === 'approved' ? (
            <div className="rounded-xl border border-[#e8e8e8] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
              <h2 className="font-authSerif text-lg text-[#121212]">Job listing</h2>
              <p className="mt-1 text-[12px] text-[#6b6b6b]">
                Turn this approved request into a public vacancy with a shareable link.
              </p>
              {listingErr ? (
                <div
                  role="alert"
                  className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-900"
                >
                  {listingErr}
                </div>
              ) : null}
              {jobListing ? (
                <div className="mt-3 space-y-2 text-[13px]">
                  <p className="text-[#505050]">
                    Current: <span className="font-medium">{jobListingStatusLabel(jobListing.status)}</span>
                  </p>
                  {jobListing.status === 'live' && jobListing.slug && !jobListing.slug.startsWith('draft-') ? (
                    <button
                      type="button"
                      onClick={() => void navigator.clipboard.writeText(tenantJobPublicUrl(orgSlug, jobListing.slug))}
                      className="text-[12px] font-medium text-[#008B60] hover:underline"
                    >
                      Copy public link
                    </button>
                  ) : null}
                </div>
              ) : null}
              <button
                type="button"
                disabled={pending}
                onClick={openOrCreateListing}
                className="mt-4 inline-flex h-9 w-full items-center justify-center rounded-lg bg-[#008B60] px-3 text-[13px] font-medium text-white transition hover:bg-[#007a54] disabled:opacity-60 sm:w-auto"
              >
                {jobListing ? 'Open job editor' : 'Create job listing'}
              </button>
            </div>
          ) : null}

          <div className="rounded-xl border border-[#e8e8e8] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            <h2 className="font-authSerif text-lg text-[#121212]">Status</h2>
            {error ? (
              <div
                role="alert"
                className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-900"
              >
                {error}
              </div>
            ) : null}
            <label className="mb-1 block text-[12px] font-medium text-[#505050]" htmlFor="status">
              Set status
            </label>
            <select
              id="status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className={fieldClass}
            >
              {RECRUITMENT_REQUEST_STATUSES.map((s: RecruitmentRequestStatus) => (
                <option key={s} value={s}>
                  {recruitmentStatusLabel(s)}
                </option>
              ))}
            </select>
            <label className="mb-1 mt-3 block text-[12px] font-medium text-[#505050]" htmlFor="statusNote">
              Note with change <span className="font-normal text-[#9b9b9b]">(optional)</span>
            </label>
            <textarea
              id="statusNote"
              value={statusNote}
              onChange={(e) => setStatusNote(e.target.value)}
              rows={2}
              className={fieldClass}
              placeholder="Visible in history"
            />
            <button
              type="button"
              onClick={applyStatus}
              disabled={pending}
              className="mt-3 inline-flex h-9 items-center justify-center rounded-lg bg-[#008B60] px-3 text-[13px] font-medium text-white transition hover:bg-[#007a54] disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#008B60]"
            >
              {pending ? 'Saving…' : 'Update status'}
            </button>
          </div>

          <div className="rounded-xl border border-[#e8e8e8] bg-white p-5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
            <h2 className="font-authSerif text-lg text-[#121212]">History</h2>
            <ol className="mt-3 space-y-4 border-l border-[#e8e8e8] pl-4">
              {events.length === 0 ? (
                <li className="text-[13px] text-[#6b6b6b]">No events yet.</li>
              ) : (
                events.map((ev) => {
                  const actor = ev.profiles;
                  const actorName = Array.isArray(actor) ? actor[0]?.full_name : actor?.full_name;
                  const from = ev.from_status ? recruitmentStatusLabel(ev.from_status) : '—';
                  const to = recruitmentStatusLabel(ev.to_status);
                  return (
                    <li key={ev.id} className="relative text-[13px] text-[#242424]">
                      <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-[#008B60]" />
                      <p className="font-medium">
                        {from} → {to}
                      </p>
                      <p className="text-[12px] text-[#6b6b6b]">
                        {actorName?.trim() || '—'} ·{' '}
                        {new Date(ev.created_at).toLocaleString(undefined, {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                      </p>
                      {ev.note?.trim() ? (
                        <p className="mt-1 whitespace-pre-wrap text-[12px] text-[#505050]">{ev.note}</p>
                      ) : null}
                    </li>
                  );
                })
              )}
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
