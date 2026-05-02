'use client';

import { createJobListingFromRequest } from '@/app/(main)/admin/jobs/actions';
import { setRecruitmentRequestStatusAction } from '@/app/(main)/admin/recruitment/actions';
import {
  recruitmentContractLabel,
  recruitmentHireReasonLabel,
  recruitmentStatusLabel,
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
  business_case: string | null;
  headcount_type: string | null;
  cost_center: string | null;
  budget_approved: boolean | null;
  target_start_window: string | null;
  number_of_positions: number | null;
  regrade_status: string | null;
  approval_status: string | null;
  role_profile_link: string | null;
  advertisement_link: string | null;
  advert_release_date: string | null;
  advert_closing_date: string | null;
  shortlisting_dates: unknown;
  interview_schedule: unknown;
  eligibility: string | null;
  pay_rate: string | null;
  contract_length_detail: string | null;
  additional_advertising_channels: string | null;
  interview_panel_details: string | null;
  needs_advert_copy_help: boolean | null;
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

function fmtDate(iso: string) {
  return new Date(`${iso}T12:00:00.000Z`).toLocaleDateString('en-GB', { timeZone: 'UTC',  day: 'numeric', month: 'long', year: 'numeric' });
}

function fmtCreatedAt(iso: string) {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return '-';
  return dt.toLocaleDateString('en-GB', { timeZone: 'UTC',  day: 'numeric', month: 'long', year: 'numeric' });
}

function fmtDateOnly(iso: string | null | undefined) {
  if (!iso) return 'TBC';
  return new Date(`${iso}T12:00:00.000Z`).toLocaleDateString('en-GB', { timeZone: 'UTC', 
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function parseDateArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => String(v ?? '').trim()).filter(Boolean);
}

function parseInterviewSchedule(value: unknown): Array<{ date: string; startTime: string; endTime: string; notes: string }> {
  if (!Array.isArray(value)) return [];
  return value
    .map((row) => ({
      date: String((row as { date?: unknown } | null)?.date ?? '').trim(),
      startTime: String((row as { startTime?: unknown } | null)?.startTime ?? '').trim(),
      endTime: String((row as { endTime?: unknown } | null)?.endTime ?? '').trim(),
      notes: String((row as { notes?: unknown } | null)?.notes ?? '').trim(),
    }))
    .filter((row) => row.date || row.startTime || row.endTime || row.notes);
}

function fmtDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-GB', { timeZone: 'UTC',  dateStyle: 'medium', timeStyle: 'short' });
}

function humanizeToken(value: string | null | undefined): string {
  const raw = String(value ?? '').trim();
  if (!raw) return '-';
  return raw
    .split('_')
    .filter(Boolean)
    .join(' ');
}

function regradeStatusLabel(value: string | null | undefined): string {
  const map: Record<string, string> = {
    requested_or_will_request: 'Requested or will request',
    not_applicable: 'Not applicable',
    not_sure: 'Not sure',
  };
  const raw = String(value ?? '').trim();
  if (!raw) return '-';
  return map[raw] ?? humanizeToken(raw);
}

function approvalStatusLabel(value: string | null | undefined): string {
  const map: Record<string, string> = {
    budget_and_hr_group: 'Budget and HR group',
    budget_only: 'Budget only',
    not_approved: 'Not approved',
  };
  const raw = String(value ?? '').trim();
  if (!raw) return '-';
  return map[raw] ?? humanizeToken(raw);
}

function eligibilityLabel(value: string | null | undefined): string {
  const map: Record<string, string> = {
    internal_staff_only: 'Internal staff only',
    internal_and_external: 'Internal and external candidates',
    sussex_or_bsms_students_only: 'Sussex or BSMS students only',
  };
  const raw = String(value ?? '').trim();
  if (!raw) return '-';
  return map[raw] ?? humanizeToken(raw);
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
  const shortlistingDates = parseDateArray(req.shortlisting_dates);
  const interviewSchedule = parseInterviewSchedule(req.interview_schedule);
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

  function createListingAndOpenEditor() {
    setListingErr(null);
    startTransition(async () => {
      const res = await createJobListingFromRequest(req.id);
      if (!res.ok) { setListingErr(res.error); return; }
      const jobId = String(res.jobId ?? '').trim();
      if (!jobId) {
        setListingErr('Job listing was created but no editor id was returned. Please refresh and try again.');
        router.refresh();
        return;
      }
      router.push(`/hr/jobs/${jobId}/edit`);
    });
  }

  return (
    <div className="mx-auto min-w-0 max-w-[90rem] px-5 pt-2 pb-10 font-sans text-[#121212] sm:px-8 lg:px-10 lg:pt-3 lg:pb-12">
      <div className="mt-2 flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between lg:gap-10">
        <div className="min-w-0 max-w-3xl">
          <h1 className="font-authSerif text-[28px] leading-tight tracking-[-0.03em] text-[#121212]">{req.job_title}</h1>
          <p className="mt-3 text-[13.5px] leading-relaxed text-[#6b6b6b]">
            {deptName} · Submitted by {submitterName} · {fmtCreatedAt(req.created_at)}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-3">
          <span className={`flex items-center gap-1.5 rounded-full border px-4 py-1.5 text-[12px] font-medium ${STATUS_STYLE[req.status] ?? 'bg-[#f5f4f1] text-[#6b6b6b] border-[#e8e8e8]'}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${STATUS_DOT[req.status] ?? 'bg-[#9b9b9b]'}`} />
            {recruitmentStatusLabel(req.status)}
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
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-widest text-[#9b9b9b]">Positions</dt>
                <dd className="mt-1.5 leading-relaxed text-[#121212]">{req.number_of_positions ?? '-'}</dd>
            </div>
            <div>
              <dt className="text-[11px] font-semibold uppercase tracking-widest text-[#9b9b9b]">Headcount type</dt>
                <dd className="mt-1.5 leading-relaxed text-[#121212]">{humanizeToken(req.headcount_type)}</dd>
            </div>
          </dl>

          {req.specific_requirements?.trim() ? (
            <div className="mt-8 border-t border-[#f0f0f0] pt-8">
              <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-[#9b9b9b]">Specific requirements</h3>
              <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-[#121212]">{req.specific_requirements}</p>
            </div>
          ) : null}

          <div className="mt-8 border-t border-[#f0f0f0] pt-8">
            <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-[#9b9b9b]">Key dates</h3>
            <dl className="grid gap-4 text-[14px] sm:grid-cols-2">
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-widest text-[#9b9b9b]">Advert release</dt>
                <dd className="mt-1.5 leading-relaxed text-[#121212]">{fmtDateOnly(req.advert_release_date)}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-widest text-[#9b9b9b]">Advert close</dt>
                <dd className="mt-1.5 leading-relaxed text-[#121212]">{fmtDateOnly(req.advert_closing_date)}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-[11px] font-semibold uppercase tracking-widest text-[#9b9b9b]">Shortlisting dates</dt>
                <dd className="mt-1.5 leading-relaxed text-[#121212]">
                  {shortlistingDates.length ? shortlistingDates.map((dte) => fmtDateOnly(dte)).join(', ') : 'TBC'}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-[11px] font-semibold uppercase tracking-widest text-[#9b9b9b]">Interview schedule</dt>
                <dd className="mt-1.5 space-y-1 leading-relaxed text-[#121212]">
                  {interviewSchedule.length ? (
                    interviewSchedule.map((entry, idx) => (
                      <p key={`${entry.date}-${entry.startTime}-${idx}`}>
                        {fmtDateOnly(entry.date)} · {entry.startTime || 'TBC'}-{entry.endTime || 'TBC'}
                        {entry.notes ? ` · ${entry.notes}` : ''}
                      </p>
                    ))
                  ) : (
                    <p>TBC</p>
                  )}
                </dd>
              </div>
            </dl>
          </div>

          <div className="mt-8 border-t border-[#f0f0f0] pt-8">
            <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-[#9b9b9b]">Governance and publishing</h3>
            <dl className="grid gap-4 text-[14px] sm:grid-cols-2">
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-widest text-[#9b9b9b]">Re-grade status</dt>
                <dd className="mt-1.5 leading-relaxed text-[#121212]">{regradeStatusLabel(req.regrade_status)}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-widest text-[#9b9b9b]">Approval status</dt>
                <dd className="mt-1.5 leading-relaxed text-[#121212]">{approvalStatusLabel(req.approval_status)}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-widest text-[#9b9b9b]">Eligible applicants</dt>
                <dd className="mt-1.5 leading-relaxed text-[#121212]">{eligibilityLabel(req.eligibility)}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-widest text-[#9b9b9b]">Contract length</dt>
                <dd className="mt-1.5 leading-relaxed text-[#121212]">{req.contract_length_detail ?? '-'}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-widest text-[#9b9b9b]">Advert copy help</dt>
                <dd className="mt-1.5 leading-relaxed text-[#121212]">{req.needs_advert_copy_help ? 'Requested' : 'Not requested'}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-[11px] font-semibold uppercase tracking-widest text-[#9b9b9b]">Role profile link</dt>
                <dd className="mt-1.5 leading-relaxed text-[#121212] break-words">{req.role_profile_link ?? '-'}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-[11px] font-semibold uppercase tracking-widest text-[#9b9b9b]">Advertisement link</dt>
                <dd className="mt-1.5 leading-relaxed text-[#121212] break-words">{req.advertisement_link ?? '-'}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-[11px] font-semibold uppercase tracking-widest text-[#9b9b9b]">Additional channels</dt>
                <dd className="mt-1.5 whitespace-pre-wrap leading-relaxed text-[#121212]">
                  {req.additional_advertising_channels ?? '-'}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-[11px] font-semibold uppercase tracking-widest text-[#9b9b9b]">Interview panel details</dt>
                <dd className="mt-1.5 whitespace-pre-wrap leading-relaxed text-[#121212]">
                  {req.interview_panel_details ?? '-'}
                </dd>
              </div>
            </dl>
          </div>
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
              {jobListing?.id ? (
                <Link
                  href={`/hr/jobs/${jobListing.id}/edit`}
                  className="mt-6 inline-flex w-full items-center justify-center rounded-full bg-[#121212] py-3 text-[13px] font-medium text-[#faf9f6] transition-opacity hover:opacity-90"
                >
                  Open job editor
                </Link>
              ) : (
                <button
                  type="button"
                  disabled={pending}
                  onClick={createListingAndOpenEditor}
                  className="mt-6 w-full rounded-full bg-[#121212] py-3 text-[13px] font-medium text-[#faf9f6] transition-opacity hover:opacity-90 disabled:opacity-60"
                >
                  {pending ? 'Opening…' : 'Create job listing'}
                </button>
              )}
            </div>
          ) : null}

          {/* Status panel */}
          <div className="overflow-hidden rounded-2xl border border-[#e8e8e8] bg-white shadow-sm">
            <div className="border-b border-[#f0f0f0] bg-[#faf9f6] px-6 py-4 lg:px-8">
              <h2 className="text-[12px] font-semibold uppercase tracking-widest text-[#9b9b9b]">Update status</h2>
              <p className="mt-1 text-[12px] text-[#6b6b6b]">Move this request through the hiring workflow.</p>
            </div>
            <div className="p-6 lg:p-8">
            {error ? (
              <p className="mt-4 rounded-xl border border-[#fecaca] bg-[#fef2f2] px-4 py-3 text-[13px] text-[#b91c1c]">{error}</p>
            ) : null}

            <label className="mt-1 block text-[12px] font-medium text-[#6b6b6b]" htmlFor="request-status-select">
              Status
            </label>
            <div className="relative mt-2">
              <span
                className={`pointer-events-none absolute left-3 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full ${STATUS_DOT[status] ?? 'bg-[#9b9b9b]'}`}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[13px] text-[#4b5563]/85">
                ▾
              </span>
              <select
                id="request-status-select"
                value={status}
                onChange={(e) => setStatus(e.target.value as RecruitmentRequestStatus)}
                className={[
                  'h-10 w-full appearance-none rounded-xl border pl-8 pr-10 text-[13px] font-medium capitalize focus:outline-none',
                  STATUS_STYLE[status] ?? 'bg-[#f5f4f1] text-[#6b6b6b] border-[#e8e8e8]',
                ].join(' ')}
              >
                {(RECRUITMENT_REQUEST_STATUSES as readonly RecruitmentRequestStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {recruitmentStatusLabel(s)}
                  </option>
                ))}
              </select>
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
              className="mt-5 w-full rounded-full bg-[#121212] py-3 text-[13px] font-medium text-white transition-colors hover:bg-[#2a2a2a] disabled:opacity-50"
            >
              {pending ? 'Saving…' : 'Save status'}
            </button>
            </div>
          </div>

          {/* History */}
          <div className="overflow-hidden rounded-2xl border border-[#e8e8e8] bg-white shadow-sm">
            <div className="border-b border-[#f0f0f0] bg-[#faf9f6] px-6 py-4 lg:px-8">
              <h2 className="text-[12px] font-semibold uppercase tracking-widest text-[#9b9b9b]">Timeline</h2>
              <p className="mt-1 text-[12px] text-[#6b6b6b]">Status changes for this request.</p>
            </div>
            <div className="p-6 lg:p-8">
            {events.length === 0 ? (
              <p className="text-[13.5px] text-[#6b6b6b]">No status changes yet.</p>
            ) : (
              <ol className="space-y-4">
                {events.map((ev) => {
                  const actor = ev.profiles;
                  const actorName = ((Array.isArray(actor) ? actor[0]?.full_name : actor?.full_name) ?? '').trim() || '—';
                  const from = ev.from_status ? recruitmentStatusLabel(ev.from_status) : null;
                  const to = recruitmentStatusLabel(ev.to_status);
                  return (
                    <li key={ev.id} className="rounded-xl border border-[#ececec] bg-[#fcfcfb] px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <p className="flex items-center gap-2 text-[13px] font-medium text-[#121212]">
                          <span className={`h-2 w-2 rounded-full ${STATUS_DOT[ev.to_status] ?? 'bg-[#9b9b9b]'}`} />
                          {from ? `${from} → ${to}` : to}
                        </p>
                        <span className="whitespace-nowrap text-[11px] text-[#9b9b9b]">{fmtDateTime(ev.created_at)}</span>
                      </div>
                      <p className="mt-1 text-[11.5px] text-[#9b9b9b]">By {actorName}</p>
                      {ev.note?.trim() ? (
                        <p className="mt-2 whitespace-pre-wrap rounded-lg bg-white px-3 py-2 text-[12px] text-[#6b6b6b]">{ev.note}</p>
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
    </div>
  );
}
