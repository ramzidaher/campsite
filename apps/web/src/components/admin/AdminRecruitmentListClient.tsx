'use client';

import { setRecruitmentRequestStatusAction } from '@/app/(main)/admin/recruitment/actions';
import { useInHiringHub } from '@/app/(main)/hr/hiring/HiringHubContext';
import { FormSelect, recruitmentStatusChips, recruitmentUrgencyChips } from '@campsite/ui/web';
import { recruitmentStatusLabel, recruitmentUrgencyLabel } from '@/lib/recruitment/labels';
import { RECRUITMENT_REQUEST_STATUSES, type RecruitmentRequestStatus, isRecruitmentRequestStatus } from '@campsite/types';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';

export type AdminRecruitmentListRow = {
  id: string;
  job_title: string;
  status: string;
  urgency: string;
  archived_at: string | null;
  created_at: string;
  department_id: string;
  start_date_needed: string;
  advert_release_date: string | null;
  advert_closing_date: string | null;
  shortlisting_dates: unknown;
  interview_schedule: unknown;
  departments: { name: string } | { name: string }[] | null;
  submitter: { full_name: string } | { full_name: string }[] | null;
};

type SortKey = 'date' | 'department' | 'urgency' | 'status';

const URGENCY_RANK: Record<string, number> = { high: 0, normal: 1, low: 2 };

const STATUS_STYLE = recruitmentStatusChips;
const URGENCY_STYLE = recruitmentUrgencyChips;

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { timeZone: 'UTC',  day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtDateOnly(iso: string | null | undefined): string {
  if (!iso) return 'TBC';
  return new Date(`${iso}T12:00:00.000Z`).toLocaleDateString('en-GB', { timeZone: 'UTC', 
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function parseDateArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => String(v ?? '').trim()).filter(Boolean);
}

function parseInterviewDates(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (typeof entry === 'string') return entry.trim();
      const rec = entry as { date?: unknown; interviewDate?: unknown; interview_date?: unknown } | null;
      return String(rec?.date ?? rec?.interviewDate ?? rec?.interview_date ?? '').trim();
    })
    .filter(Boolean);
}

function toDateOnly(value: string): Date | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const d = new Date(`${raw}T00:00:00.000Z`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDateDdMm(date: Date, withYear: boolean): string {
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = String(date.getUTCFullYear());
  return withYear ? `${dd}/${mm}/${yyyy}` : `${dd}/${mm}`;
}

function formatMultiDateSummary(values: string[]): string {
  const sortedUnique = Array.from(
    new Set(
      values
        .map(toDateOnly)
        .filter((d): d is Date => Boolean(d))
        .map((d) => d.toISOString().slice(0, 10)),
    ),
  )
    .map((isoDay) => new Date(`${isoDay}T00:00:00.000Z`))
    .sort((a, b) => a.getTime() - b.getTime());
  if (sortedUnique.length === 0) return 'TBC';
  if (sortedUnique.length === 1) return formatDateDdMm(sortedUnique[0], true);

  const isConsecutive = sortedUnique
    .slice(1)
    .every((d, idx) => d.getTime() - sortedUnique[idx]!.getTime() === 24 * 60 * 60 * 1000);

  if (isConsecutive) {
    return `${formatDateDdMm(sortedUnique[0], false)} to ${formatDateDdMm(
      sortedUnique[sortedUnique.length - 1],
      true,
    )}`;
  }

  const prefix = sortedUnique
    .slice(0, -1)
    .map((d) => formatDateDdMm(d, false));
  const last = formatDateDdMm(sortedUnique[sortedUnique.length - 1], true);
  if (prefix.length === 1) return `${prefix[0]} and ${last}`;
  return `${prefix.slice(0, -1).join(', ')}, ${prefix[prefix.length - 1]} and ${last}`;
}

function renderKeyDates(row: AdminRecruitmentListRow): string {
  const shortlistDates = parseDateArray(row.shortlisting_dates);
  const interviewDates = parseInterviewDates(row.interview_schedule);
  const shortlistLabel =
    formatMultiDateSummary(shortlistDates);
  const interviewLabel =
    formatMultiDateSummary(interviewDates);
  return `Advert ${fmtDateOnly(row.advert_release_date)}-${fmtDateOnly(row.advert_closing_date)} · Shortlist ${shortlistLabel} · Interviews ${interviewLabel} · Start ${fmtDateOnly(row.start_date_needed)}`;
}

function keyDateItems(row: AdminRecruitmentListRow): string[] {
  const shortlistDates = parseDateArray(row.shortlisting_dates);
  const interviewDates = parseInterviewDates(row.interview_schedule);
  const shortlistLabel =
    formatMultiDateSummary(shortlistDates);
  const interviewLabel =
    formatMultiDateSummary(interviewDates);

  return [
    `Advert ${fmtDateOnly(row.advert_release_date)}-${fmtDateOnly(row.advert_closing_date)}`,
    `Shortlist ${shortlistLabel}`,
    `Interviews ${interviewLabel}`,
    `Start ${fmtDateOnly(row.start_date_needed)}`,
  ];
}

function deptName(d: AdminRecruitmentListRow['departments']): string {
  return (Array.isArray(d) ? d[0]?.name : d?.name) ?? '';
}
function submitterName(p: AdminRecruitmentListRow['submitter']): string {
  return ((Array.isArray(p) ? p[0]?.full_name : p?.full_name) ?? '').trim() || '';
}

const STATUS_OPTIONS = ['all', 'pending_review', 'approved', 'in_progress', 'filled', 'rejected'] as const;

/** Same pipeline order as `RECRUITMENT_REQUEST_STATUSES` / request detail page. */
const ROW_STATUS_OPTIONS = RECRUITMENT_REQUEST_STATUSES;

function isRequestArchived(row: Pick<AdminRecruitmentListRow, 'archived_at' | 'status'>): boolean {
  return Boolean(row.archived_at) || row.status === 'filled' || row.status === 'rejected';
}

function hiringHubStatusDotClass(status: string): string {
  switch (status) {
    case 'in_progress':
      return 'bg-[#ea580c]';
    case 'pending_review':
      return 'bg-[#f97316]';
    case 'approved':
      return 'bg-[#2563eb]';
    case 'filled':
      return 'bg-[#22c55e]';
    case 'rejected':
      return 'bg-[#dc2626]';
    default:
      return 'bg-[#d0d0d0]';
  }
}

function hiringHubStatusChipClass(status: string): string {
  if (status === 'in_progress') return 'bg-[#ffedd5] text-[#c2410c]';
  return STATUS_STYLE[status] ?? 'bg-[#f5f4f1] text-[#6b6b6b]';
}

/** Encodes sort field + direction in one control (less UI than separate field + toggle). */
const SORT_PRESETS: { value: string; sort: SortKey; dir: 'asc' | 'desc'; label: string }[] = [
  { value: 'date-desc', sort: 'date', dir: 'desc', label: 'Date · newest first' },
  { value: 'date-asc', sort: 'date', dir: 'asc', label: 'Date · oldest first' },
  { value: 'dept-asc', sort: 'department', dir: 'asc', label: 'Department · A–Z' },
  { value: 'dept-desc', sort: 'department', dir: 'desc', label: 'Department · Z–A' },
  { value: 'urgency-asc', sort: 'urgency', dir: 'asc', label: 'Urgency · high first' },
  { value: 'status-asc', sort: 'status', dir: 'asc', label: 'Status · pipeline order' },
];

export function AdminRecruitmentListClient({ rows }: { rows: AdminRecruitmentListRow[] }) {
  const inHiringHub = useInHiringHub();
  const router = useRouter();
  const [rowStatusError, setRowStatusError] = useState<string | null>(null);
  const [statusSavePending, startStatusSave] = useTransition();
  const [filter, setFilter] = useState<'open' | 'archived'>('open');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [sortPreset, setSortPreset] = useState('date-desc');

  const preset = SORT_PRESETS.find((p) => p.value === sortPreset) ?? SORT_PRESETS[0];
  const sort = preset.sort;
  const sortDir = preset.dir;

  const openCount = rows.filter((r) => !isRequestArchived(r)).length;
  const pendingCount = rows.filter((r) => r.status === 'pending_review' && !isRequestArchived(r)).length;
  const inProgressCount = rows.filter((r) => r.status === 'in_progress' && !isRequestArchived(r)).length;
  const filledCount = rows.filter((r) => r.status === 'filled').length;

  const filtered = useMemo(() => {
    let r = rows;
    if (filter === 'open') r = r.filter((x) => !isRequestArchived(x));
    else r = r.filter((x) => isRequestArchived(x));
    if (statusFilter !== 'all') r = r.filter((x) => x.status === statusFilter);
    return r;
  }, [rows, filter, statusFilter]);

  const sorted = useMemo(() => {
    const copy = [...filtered];
    const dir = sortDir === 'asc' ? 1 : -1;
    copy.sort((a, b) => {
      if (sort === 'date') return dir * (new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      if (sort === 'department') return dir * deptName(a.departments).localeCompare(deptName(b.departments), undefined, { sensitivity: 'base' });
      if (sort === 'status') {
        const rank: Record<string, number> = {
          pending_review: 0,
          approved: 1,
          in_progress: 2,
          filled: 3,
          rejected: 4,
        };
        return dir * ((rank[a.status] ?? 99) - (rank[b.status] ?? 99));
      }
      return dir * ((URGENCY_RANK[a.urgency] ?? 9) - (URGENCY_RANK[b.urgency] ?? 9));
    });
    return copy;
  }, [filtered, sort, sortDir]);

  function rowStatusValue(status: string): RecruitmentRequestStatus {
    return isRecruitmentRequestStatus(status) ? status : 'pending_review';
  }

  function saveRowStatus(requestId: string, jobTitle: string, next: RecruitmentRequestStatus) {
    setRowStatusError(null);
    startStatusSave(async () => {
      const res = await setRecruitmentRequestStatusAction(requestId, next, null);
      if (!res.ok) {
        setRowStatusError(`${jobTitle}: ${res.error}`);
        return;
      }
      router.refresh();
    });
  }

  const queueCells = [
    { label: 'Open', labelUpper: 'OPEN', value: openCount, hint: 'Not archived' },
    {
      label: 'Pending review',
      labelUpper: 'PENDING REVIEW',
      value: pendingCount,
      hint: pendingCount > 0 ? 'Needs action' : 'None waiting',
    },
    { label: 'In progress', labelUpper: 'IN PROGRESS', value: inProgressCount, hint: 'Approved & active' },
    { label: 'Filled', labelUpper: 'FILLED', value: filledCount, hint: 'Completed hires' },
  ] as const;

  return (
    <div className={inHiringHub ? 'min-w-0 font-sans text-[#121212]' : 'min-w-0'}>
      {inHiringHub ? null : (
        <header className="mb-8">
          <h1 className="font-authSerif text-[28px] leading-tight tracking-[-0.03em] text-[#121212]">Hiring requests</h1>
          <p className="mt-1 max-w-2xl text-[13.5px] leading-relaxed text-[#6b6b6b]">
            Review and track recruitment through to filled roles. Filters below apply to the list.
          </p>
        </header>
      )}

      {inHiringHub ? null : (
        <section aria-label="Request counts" className="mb-6">
          <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-widest text-[#9b9b9b]">Queue</h2>
          <div className="overflow-hidden rounded-2xl border border-[#e8e8e8] bg-white">
            <div className="grid divide-y divide-[#f0f0f0] sm:grid-cols-4 sm:divide-x sm:divide-y-0">
              {queueCells.map((cell) => (
                <div key={cell.label} className="p-4 text-center sm:p-5">
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-[#9b9b9b]">{cell.label}</p>
                  <p className="mt-2 text-[32px] font-bold leading-none tracking-tight text-[#121212] tabular-nums">
                    {cell.value}
                  </p>
                  <p className="mt-1 text-[11.5px] text-[#6b6b6b]">{cell.hint}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <div
        className={[
          'mb-4 flex flex-col gap-3',
          inHiringHub ? 'sm:flex-row sm:flex-wrap sm:items-center sm:justify-between' : 'sm:flex-row sm:flex-wrap sm:items-end sm:justify-between',
        ].join(' ')}
      >
        <div className={`flex flex-wrap items-center gap-2 ${inHiringHub ? '' : 'gap-3'}`}>
          {inHiringHub ? (
            <div className="flex flex-wrap gap-2">
              {(['open', 'archived'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  className={[
                    'rounded-full px-4 py-2 text-[13px] font-medium transition-colors',
                    filter === f
                      ? f === 'open'
                        ? 'bg-[#121212] text-white'
                        : 'bg-[#f5f4f1] text-[#121212]'
                      : 'border border-[#e8e8e8] bg-white text-[#121212] hover:bg-[#faf9f6]',
                  ].join(' ')}
                >
                  {f === 'open' ? 'New' : 'Archive'}
                </button>
              ))}
            </div>
          ) : (
            <div className="flex gap-1 rounded-xl border border-[#e8e8e8] bg-[#faf9f6] p-1">
              {(['open', 'archived'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFilter(f)}
                  className={[
                    'rounded-lg px-3 py-1.5 text-[12.5px] font-medium capitalize transition-colors',
                    filter === f ? 'bg-white text-[#121212] shadow-sm' : 'text-[#6b6b6b] hover:text-[#121212]',
                  ].join(' ')}
                >
                  {f === 'open' ? 'New' : 'Archive'}
                </button>
              ))}
            </div>
          )}

          {!inHiringHub ? (
            <label className="flex flex-col gap-1">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-[#9b9b9b]">Status</span>
              <FormSelect
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="min-w-[12rem] rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px] text-[#121212] focus:border-[#121212] focus:outline-none"
              >
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>
                    {s === 'all' ? 'All statuses' : recruitmentStatusLabel(s)}
                  </option>
                ))}
              </FormSelect>
            </label>
          ) : null}
        </div>

        <div className={`flex flex-col gap-2 sm:flex-row sm:items-center ${inHiringHub ? 'w-full sm:w-auto sm:min-w-0 sm:flex-1 sm:justify-end' : ''}`}>
          {inHiringHub ? (
            <FormSelect
              aria-label="Filter by workflow status"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-10 min-w-0 flex-1 rounded-lg border border-[#d8d8d8] bg-white px-3 text-[13px] text-[#121212] focus:border-[#121212] focus:outline-none sm:max-w-[14rem]"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s === 'all' ? 'All statuses' : recruitmentStatusLabel(s)}
                </option>
              ))}
            </FormSelect>
          ) : null}

          <label className={`flex w-full flex-col gap-1 sm:w-auto sm:min-w-[14rem] ${inHiringHub ? 'sm:min-w-[min(100%,18rem)]' : ''}`}>
            {inHiringHub ? (
              <span className="sr-only">Sort</span>
            ) : (
              <span className="text-[11px] font-semibold uppercase tracking-wide text-[#9b9b9b]">Sort</span>
            )}
            <FormSelect
              value={sortPreset}
              onChange={(e) => setSortPreset(e.target.value)}
              className="h-10 w-full rounded-lg border border-[#d8d8d8] bg-white px-3 text-[13px] text-[#121212] focus:border-[#121212] focus:outline-none"
            >
              {SORT_PRESETS.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </FormSelect>
          </label>
        </div>
      </div>

      {sorted.length === 0 ? (
        <div className={`border border-[#e8e8e8] bg-white px-6 py-12 text-center ${inHiringHub ? 'rounded-xl' : 'rounded-2xl'}`}>
          <p className="text-[14px] font-medium text-[#121212]">No requests match these filters</p>
          <p className="mt-1 text-[13px] text-[#9b9b9b]">Try changing status or switching between New and Archive.</p>
        </div>
      ) : inHiringHub ? (
        <div className="overflow-x-auto rounded-xl border border-[#e8e8e8] bg-white shadow-sm">
          {rowStatusError ? (
            <p className="border-b border-[#fecaca] bg-[#fef2f2] px-4 py-2 text-[12px] text-[#991b1b]" role="alert">
              {rowStatusError}
            </p>
          ) : null}
          <table className="min-w-full table-fixed border-collapse">
            <thead>
              <tr className="border-b border-[#ececec] bg-[#faf9f6]">
                <th className="w-[28%] px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-[#7d7d7d]">
                  Job Title
                </th>
                <th className="w-[38%] px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-[#7d7d7d]">
                  Key Dates
                </th>
                <th className="w-[20%] px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-[#7d7d7d]">
                  Status
                </th>
                <th className="w-[14%] px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-widest text-[#7d7d7d]">
                  Owner
                </th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, i) => {
                const selectedStatus = rowStatusValue(r.status);

                return (
                  <tr key={r.id} className={i < sorted.length - 1 ? 'border-b border-[#f0efe9]' : ''}>
                    <td className="px-4 py-3 align-top">
                      <Link
                        href={`/hr/hiring/requests/${r.id}`}
                        prefetch={false}
                        className="group inline-flex min-w-0 items-start gap-2 text-[#121212] hover:text-black"
                      >
                        <span
                          className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${hiringHubStatusDotClass(r.status)}`}
                          title={recruitmentStatusLabel(r.status)}
                        />
                        <span className="min-w-0">
                          <span className="inline-flex max-w-full flex-wrap items-center gap-2">
                            <span className="truncate text-[14px] font-semibold">{r.job_title}</span>
                            {r.urgency === 'high' ? (
                              <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium ${URGENCY_STYLE.high}`}>
                                High urgency
                              </span>
                            ) : null}
                          </span>
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-3 align-top text-[12px] text-[#5c5c5c]">
                      <p className="leading-relaxed">Requested {fmtDate(r.created_at)}</p>
                      <div className="mt-1 flex flex-wrap gap-1.5 leading-relaxed">
                        {keyDateItems(r).map((item) => (
                          <span key={item} className="rounded-full bg-[#f5f4f1] px-2 py-0.5 text-[11px] text-[#5c5c5c]">
                            {item}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 align-top">
                      <FormSelect
                        aria-label={`Status for ${r.job_title}`}
                        value={selectedStatus}
                        disabled={statusSavePending}
                        onChange={(e) => {
                          const v = e.target.value;
                          if (!isRecruitmentRequestStatus(v) || v === r.status) return;
                          saveRowStatus(r.id, r.job_title, v);
                        }}
                        className={`h-9 min-w-[10.5rem] rounded-full border border-[#d8d8d8] bg-white px-3 text-[12px] font-medium capitalize focus:border-[#121212] focus:outline-none disabled:opacity-60 ${hiringHubStatusChipClass(selectedStatus)}`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {ROW_STATUS_OPTIONS.map((status) => (
                          <option key={status} value={status}>
                            {recruitmentStatusLabel(status)}
                          </option>
                        ))}
                      </FormSelect>
                    </td>
                    <td className="px-4 py-3 align-top text-[13px] text-[#121212]">{submitterName(r.submitter)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-[#e8e8e8] bg-white">
          {sorted.map((r, i) => (
            <Link
              key={r.id}
              href={`/hr/hiring/requests/${r.id}`}
              prefetch={false}
              className={[
                'group flex items-start gap-3 px-5 py-4 transition-colors hover:bg-[#faf9f6]',
                i < sorted.length - 1 ? 'border-b border-[#f0efe9]' : '',
              ].join(' ')}
            >
              <div
                className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                  r.urgency === 'high' ? 'bg-[#dc2626]' : r.urgency === 'low' ? 'bg-[#16a34a]' : 'bg-[#d0d0d0]'
                }`}
                title={`Urgency: ${recruitmentUrgencyLabel(r.urgency)}`}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[14px] font-semibold text-[#121212]">{r.job_title}</span>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${STATUS_STYLE[r.status] ?? 'bg-[#f5f4f1] text-[#6b6b6b]'}`}
                  >
                    {recruitmentStatusLabel(r.status)}
                  </span>
                  {r.urgency === 'high' ? (
                    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${URGENCY_STYLE.high}`}>
                      High urgency
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-[12px] text-[#9b9b9b]">
                  {deptName(r.departments)}
                  {submitterName(r.submitter) !== '' ? ` · ${submitterName(r.submitter)}` : ''}
                  {' · '}
                  {fmtDate(r.created_at)}
                </p>
                <p className="mt-1 text-[12px] text-[#6b6b6b]">{renderKeyDates(r)}</p>
              </div>
              <span
                className="shrink-0 pt-0.5 text-[18px] font-medium text-[#9b9b9b] transition-colors group-hover:text-[#121212]"
                aria-hidden
              >
                →
              </span>
            </Link>
          ))}
        </div>
      )}

      {sorted.length > 0 ? (
        <p className="mt-3 text-right text-[12px] text-[#6b6b6b]">
          Showing {sorted.length} of {rows.length} request{rows.length === 1 ? '' : 's'}
        </p>
      ) : null}
    </div>
  );
}
