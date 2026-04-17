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

const STATUS_STYLE: Record<string, string> = {
  pending_review: 'bg-[#fff7ed] text-[#c2410c] border-[#fed7aa]',
  approved:       'bg-[#eff6ff] text-[#1d4ed8] border-[#bfdbfe]',
  in_progress:    'bg-[#faf5ff] text-[#7c3aed] border-[#ddd6fe]',
  filled:         'bg-[#dcfce7] text-[#166534] border-[#bbf7d0]',
  rejected:       'bg-[#fef2f2] text-[#b91c1c] border-[#fecaca]',
};

const STATUS_DOT: Record<string, string> = {
  pending_review: 'bg-[#f97316]',
  approved:       'bg-[#3b82f6]',
  in_progress:    'bg-[#8b5cf6]',
  filled:         'bg-[#16a34a]',
  rejected:       'bg-[#dc2626]',
};

const URGENCY_STYLE: Record<string, string> = {
  high:   'bg-[#fef2f2] text-[#b91c1c] border-[#fecaca]',
  normal: 'bg-[#f5f4f1] text-[#6b6b6b] border-[#e8e8e8]',
  low:    'bg-[#f0fdf4] text-[#166534] border-[#bbf7d0]',
};

function fmtDate(iso: string) {
  return new Date(`${iso}T12:00:00.000Z`).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

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

  useEffect(() => { setStatus(req.status); }, [req.status]);

  const d = req.departments;
  const deptName = (Array.isArray(d) ? d[0]?.name : d?.name) ?? '—';
  const sub = req.submitter;
  const submitterName = ((Array.isArray(sub) ? sub[0]?.full_name : sub?.full_name) ?? '').trim() || '—';

  function applyStatus() {
    setError(null);
    if (status === req.status && !statusNote.trim()) return;
    startTransition(async () => {
      const res = await setRecruitmentRequestStatusAction(req.id, status, statusNote.trim() || null);
      if (!res.ok) { setError(res.error); return; }
      setStatusNote('');
      router.refresh();
    });
  }

  function openOrCreateListing() {
    setListingErr(null);
    startTransition(async () => {
      if (jobListing?.id) { router.push(`/hr/jobs/${jobListing.id}/edit`); return; }
      const res = await createJobListingFromRequest(req.id);
      if (!res.ok) { setListingErr(res.error); return; }
      router.push(`/hr/jobs/${res.jobId}/edit`);
    });
  }

  return (
    <div className="mx-auto min-w-0 max-w-[90rem] px-5 py-10 font-sans text-[#121212] sm:px-8 lg:px-10 lg:py-12">
      <Link
        href="/hr/hiring/requests"
        className="inline-flex text-[13px] font-medium text-[#6b6b6b] underline-offset-2 hover:text-[#121212] hover:underline"
      >
        ← Hiring requests
      </Link>

      <div className="mt-6 flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between lg:gap-10">
        <div className="min-w-0 max-w-3xl">
          <h1 className="font-authSerif text-[28px] leading-tight tracking-[-0.03em] text-[#121212]">{req.job_title}</h1>
          <p className="mt-3 text-[13.5px] leading-relaxed text-[#6b6b6b]">
            {deptName} · Submitted by {submitterName} · {fmtDate(req.created_at)}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-3">
          <span className={`flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-[12px] font-medium ${STATUS_STYLE[req.status] ?? 'bg-[#f5f4f1] text-[#6b6b6b] border-[#e8e8e8]'}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[req.status] ?? 'bg-[#9b9b9b]'}`} />
            {recruitmentStatusLabel(req.status)}
          </span>
          <span className={`rounded-full border px-4 py-1.5 text-[12px] font-medium ${URGENCY_STYLE[req.urgency] ?? 'bg-[#f5f4f1] text-[#6b6b6b] border-[#e8e8e8]'}`}>
            {recruitmentUrgencyLabel(req.urgency)} urgency
          </span>
          {req.archived_at ? (
            <span className="rounded-full border border-[#e8e8e8] bg-[#f5f4f1] px-4 py-1.5 text-[12px] font-medium text-[#6b6b6b]">
              Archived
            </span>
          ) : null}
        </div>
      </div>

      <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_22rem] lg:gap-10 xl:grid-cols-[1fr_24rem]">

        {/* Brief card */}
        <div className="rounded-2xl border border-[#e8e8e8] bg-white p-8 shadow-sm">
          <h2 className="mb-6 text-[12px] font-semibold uppercase tracking-widest text-[#9b9b9b]">Request details</h2>
          <dl className="grid gap-6 text-[14px] sm:grid-cols-2">
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-widest text-[#9b9b9b]">Grade / level</dt>
              <dd className="mt-1.5 leading-relaxed text-[#121212]">{req.grade_level}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-widest text-[#9b9b9b]">Salary band</dt>
              <dd className="mt-1.5 leading-relaxed text-[#121212]">{req.salary_band}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-widest text-[#9b9b9b]">Reason for hire</dt>
              <dd className="mt-1.5 leading-relaxed text-[#121212]">{recruitmentHireReasonLabel(req.reason_for_hire)}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-widest text-[#9b9b9b]">Contract type</dt>
              <dd className="mt-1.5 leading-relaxed text-[#121212]">{recruitmentContractLabel(req.contract_type)}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-[11px] font-semibold uppercase tracking-widest text-[#9b9b9b]">Start date needed</dt>
              <dd className="mt-1.5 leading-relaxed text-[#121212]">{fmtDate(req.start_date_needed)}</dd>
            </div>
          </dl>

          <div className="mt-8 border-t border-[#f0f0f0] pt-8">
            <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-[#9b9b9b]">Ideal candidate</h3>
            <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-[#121212]">{req.ideal_candidate_profile}</p>
          </div>

          {req.specific_requirements?.trim() ? (
            <div className="mt-8 border-t border-[#f0f0f0] pt-8">
              <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-[#9b9b9b]">Specific requirements</h3>
              <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-[#121212]">{req.specific_requirements}</p>
            </div>
          ) : null}
        </div>

        {/* Sidebar */}
        <div className="space-y-6 lg:space-y-8">

          {/* Job listing */}
          {req.status === 'approved' ? (
            <div className="rounded-2xl border border-[#e8e8e8] bg-white p-6 shadow-sm lg:p-8">
              <h2 className="text-[12px] font-semibold uppercase tracking-widest text-[#9b9b9b]">Job listing</h2>
              <p className="mt-3 text-[13.5px] leading-relaxed text-[#6b6b6b]">
                Turn this request into a public vacancy with a shareable link.
              </p>
              {listingErr ? (
                <p className="mt-3 rounded-lg border border-[#fecaca] bg-[#fef2f2] px-3 py-2 text-[13px] text-[#b91c1c]">{listingErr}</p>
              ) : null}
              {jobListing ? (
                <div className="mt-3 space-y-1 text-[13px]">
                  <p className="text-[#6b6b6b]">
                    Status: <span className="font-medium text-[#121212]">{jobListingStatusLabel(jobListing.status)}</span>
                  </p>
                  {jobListing.status === 'live' && jobListing.slug && !jobListing.slug.startsWith('draft-') ? (
                    <button
                      type="button"
                      onClick={() => void navigator.clipboard.writeText(tenantJobPublicUrl(orgSlug, jobListing.slug))}
                      className="text-[12px] font-medium text-[#6b6b6b] underline underline-offset-2 hover:text-[#121212]"
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
                className="mt-6 w-full rounded-full bg-[#121212] py-3 text-[13px] font-medium text-[#faf9f6] transition-opacity hover:opacity-90 disabled:opacity-60"
              >
                {pending ? 'Opening…' : jobListing ? 'Open job editor' : 'Create job listing'}
              </button>
            </div>
          ) : null}

          {/* Status panel */}
          <div className="rounded-2xl border border-[#e8e8e8] bg-white p-6 shadow-sm lg:p-8">
            <h2 className="text-[12px] font-semibold uppercase tracking-widest text-[#9b9b9b]">Update status</h2>
            {error ? (
              <p className="mt-4 rounded-xl border border-[#fecaca] bg-[#fef2f2] px-4 py-3 text-[13px] text-[#b91c1c]">{error}</p>
            ) : null}

            <div className="mt-5 flex flex-wrap gap-2">
              {(RECRUITMENT_REQUEST_STATUSES as readonly RecruitmentRequestStatus[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setStatus(s)}
                  className={[
                    'flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-medium transition-all',
                    status === s
                      ? `${STATUS_STYLE[s]} ring-2 ring-offset-1 ring-current`
                      : 'border-[#e8e8e8] bg-white text-[#6b6b6b] hover:border-[#c8c8c8]',
                  ].join(' ')}
                >
                  {status === s ? <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[s] ?? 'bg-[#9b9b9b]'}`} /> : null}
                  {recruitmentStatusLabel(s)}
                </button>
              ))}
            </div>

            <label className="mt-4 block text-[12px] font-medium text-[#6b6b6b]">
              Note <span className="font-normal text-[#9b9b9b]">(optional)</span>
            </label>
            <textarea
              value={statusNote}
              onChange={(e) => setStatusNote(e.target.value)}
              rows={3}
              className="mt-2 w-full rounded-xl border border-[#e8e8e8] bg-[#faf9f6] px-4 py-3 text-[14px] leading-relaxed focus:border-[#121212] focus:outline-none"
              placeholder="Visible in history"
            />
            <button
              type="button"
              onClick={applyStatus}
              disabled={pending}
              className="mt-4 w-full rounded-full bg-[#121212] py-3 text-[13px] font-medium text-white transition-colors hover:bg-[#2a2a2a] disabled:opacity-50"
            >
              {pending ? 'Saving…' : 'Save status'}
            </button>
          </div>

          {/* History */}
          <div className="rounded-2xl border border-[#e8e8e8] bg-white p-6 shadow-sm lg:p-8">
            <h2 className="text-[12px] font-semibold uppercase tracking-widest text-[#9b9b9b]">History</h2>
            {events.length === 0 ? (
              <p className="mt-4 text-[13.5px] text-[#6b6b6b]">No status changes yet.</p>
            ) : (
              <ol className="mt-6 space-y-5 border-l border-[#e8e8e8] pl-5">
                {events.map((ev) => {
                  const actor = ev.profiles;
                  const actorName = ((Array.isArray(actor) ? actor[0]?.full_name : actor?.full_name) ?? '').trim() || '—';
                  const from = ev.from_status ? recruitmentStatusLabel(ev.from_status) : null;
                  const to = recruitmentStatusLabel(ev.to_status);
                  return (
                    <li key={ev.id} className="relative">
                      <span className={`absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full ${STATUS_DOT[ev.to_status] ?? 'bg-[#9b9b9b]'}`} />
                      <p className="text-[13px] font-medium text-[#121212]">
                        {from ? `${from} → ${to}` : to}
                      </p>
                      <p className="mt-0.5 text-[11.5px] text-[#9b9b9b]">
                        {actorName} · {fmtDateTime(ev.created_at)}
                      </p>
                      {ev.note?.trim() ? (
                        <p className="mt-1 whitespace-pre-wrap text-[12px] text-[#6b6b6b]">{ev.note}</p>
                      ) : null}
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
