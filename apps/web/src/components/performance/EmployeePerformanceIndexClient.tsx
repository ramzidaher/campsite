'use client';

import { campusSurface } from '@campsite/ui/web';
import Link from 'next/link';

type ReviewSummary = {
  id: string;
  cycle: { name: string; type: string; period_start: string; period_end: string; status: string; self_assessment_due: string | null; manager_assessment_due: string | null } | null;
  is_reviewee: boolean;
  reviewee_name: string | null;
  status: string;
  overall_rating: string | null;
  self_submitted_at: string | null;
  manager_submitted_at: string | null;
  completed_at: string | null;
};

const RATING_LABELS: Record<string, string> = {
  exceptional: 'Exceptional',
  strong: 'Strong',
  meets_expectations: 'Meets expectations',
  developing: 'Developing',
  unsatisfactory: 'Unsatisfactory',
};

const TYPE_LABELS: Record<string, string> = {
  annual: 'Annual review',
  mid_year: 'Mid-year check-in',
  probation: 'Probation review',
  quarterly: 'Quarterly review',
};

const RATING_COLORS: Record<string, string> = {
  exceptional: 'bg-[#dcfce7] text-[#166534]',
  strong: 'bg-[#eff6ff] text-[#1d4ed8]',
  meets_expectations: 'bg-[#f5f4f1] text-[#4a4a4a]',
  developing: 'bg-[#fff7ed] text-[#c2410c]',
  unsatisfactory: 'bg-[#fef2f2] text-[#b91c1c]',
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { timeZone: 'UTC',  day: 'numeric', month: 'short', year: 'numeric' });
}

function statusInfo(status: string, isReviewee: boolean): { label: string; dot: string; hint: string } {
  switch (status) {
    case 'completed':
      return { label: 'Complete', dot: 'bg-[#16a34a]', hint: '' };
    case 'self_submitted':
      return isReviewee
        ? { label: 'Self-assessment done', dot: 'bg-[#1d4ed8]', hint: 'Waiting for your manager' }
        : { label: 'Ready to review', dot: 'bg-[#d97706]', hint: 'Employee has submitted  your turn' };
    case 'manager_submitted':
      return { label: 'Manager done', dot: 'bg-[#7c3aed]', hint: '' };
    default:
      return isReviewee
        ? { label: 'Action needed', dot: 'bg-[#dc2626]', hint: 'Complete your self-assessment' }
        : { label: 'Not started', dot: 'bg-[#9b9b9b]', hint: 'Waiting for self-assessment' };
  }
}

function ReviewCard({ r }: { r: ReviewSummary }) {
  const isReviewee = r.is_reviewee;
  const info = statusInfo(r.status, isReviewee);
  const today = new Date().toISOString().slice(0, 10);
  const dueDate = isReviewee ? r.cycle?.self_assessment_due : r.cycle?.manager_assessment_due;
  const isOverdue = dueDate && dueDate < today && r.status !== 'completed';

  return (
    <Link
      href={`/performance/${r.id}`}
      className={[
        'flex items-start justify-between gap-4 rounded-xl border p-4',
        campusSurface.interactiveSheetRow,
        isOverdue ? 'border-[#fca5a5] bg-white' : 'border-[#e8e8e8] bg-white',
      ].join(' ')}
    >
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[14px] font-semibold text-[#121212]">
            {isReviewee ? (r.cycle?.name ?? 'Review') : (r.reviewee_name ?? 'Team member')}
          </p>
          {r.overall_rating ? (
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${RATING_COLORS[r.overall_rating] ?? 'bg-[#f5f4f1] text-[#6b6b6b]'}`}>
              {RATING_LABELS[r.overall_rating] ?? r.overall_rating}
            </span>
          ) : null}
        </div>
        {r.cycle ? (
          <p className="mt-0.5 text-[12px] text-[#9b9b9b]">
            {TYPE_LABELS[r.cycle.type] ?? r.cycle.type}
            {!isReviewee && r.reviewee_name ? ` · ${r.reviewee_name}` : ''}
          </p>
        ) : null}
        <div className="mt-2 flex items-center gap-1.5">
          <span className={`h-1.5 w-1.5 rounded-full ${info.dot}`} />
          <span className="text-[12px] text-[#6b6b6b]">{info.label}</span>
          {info.hint ? <span className="text-[12px] text-[#9b9b9b]">· {info.hint}</span> : null}
        </div>
        {isOverdue && dueDate ? (
          <p className="mt-1 text-[11.5px] font-medium text-[#b91c1c]">Overdue  was due {fmtDate(dueDate)}</p>
        ) : dueDate && r.status !== 'completed' ? (
          <p className="mt-1 text-[11.5px] text-[#9b9b9b]">Due {fmtDate(dueDate)}</p>
        ) : r.completed_at ? (
          <p className="mt-1 text-[11.5px] text-[#9b9b9b]">Completed {fmtDate(r.completed_at)}</p>
        ) : null}
      </div>
      <span className="mt-0.5 shrink-0 text-[12px] text-[#9b9b9b]">→</span>
    </Link>
  );
}

export function EmployeePerformanceIndexClient({
  userId: _userId,
  mayHaveTeamReviews,
  reviews,
}: {
  userId: string;
  /** True when the viewer has manager review permission but may have zero assignments yet. */
  mayHaveTeamReviews: boolean;
  reviews: ReviewSummary[];
}) {
  const mine = reviews.filter((r) => r.is_reviewee);
  const reviewing = reviews.filter((r) => !r.is_reviewee);

  const myActionNeeded = mine.filter((r) => r.status === 'created' || r.status === 'pending');
  const theirActionNeeded = reviewing.filter((r) => r.status === 'self_submitted');
  const totalActionNeeded = myActionNeeded.length + theirActionNeeded.length;
  const completed = reviews.filter((r) => r.status === 'completed').length;

  return (
    <div className="mx-auto max-w-7xl px-5 py-8 sm:px-7">
      <div className="mb-6">
        <h1 className="font-authSerif text-[26px] leading-tight tracking-[-0.03em] text-[#121212]">Performance</h1>
        <p className="mt-1 text-[13px] text-[#6b6b6b]">
          Your reviews and any team members waiting on your feedback.
        </p>
      </div>

      {reviews.length === 0 ? (
        <div className="rounded-2xl border border-[#e8e8e8] bg-white p-8 text-center">
          <p className="text-[14px] font-medium text-[#121212]">No performance reviews yet</p>
          <p className="mt-1 text-[13px] text-[#9b9b9b]">
            {mayHaveTeamReviews
              ? 'You can review direct reports when HR enrolls them in an active cycle. Your own reviews will show under “My reviews” when you’re included in a cycle.'
              : 'Reviews will appear here when your organisation starts a review cycle and you’re included.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-8">
          <div className="min-w-0 space-y-6 lg:col-span-8">
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-2xl border border-[#e8e8e8] bg-white p-4 text-center">
                <p className="text-[22px] font-bold text-[#121212]">{reviews.length}</p>
                <p className="mt-0.5 text-[11.5px] text-[#6b6b6b]">Total reviews</p>
              </div>
              <div className={`rounded-2xl border p-4 text-center ${totalActionNeeded > 0 ? 'border-[#fde68a] bg-[#fffbeb]' : 'border-[#e8e8e8] bg-white'}`}>
                <p className={`text-[22px] font-bold ${totalActionNeeded > 0 ? 'text-[#d97706]' : 'text-[#121212]'}`}>{totalActionNeeded}</p>
                <p className={`mt-0.5 text-[11.5px] ${totalActionNeeded > 0 ? 'text-[#92400e]' : 'text-[#6b6b6b]'}`}>Need attention</p>
              </div>
              <div className="rounded-2xl border border-[#e8e8e8] bg-white p-4 text-center">
                <p className="text-[22px] font-bold text-[#16a34a]">{completed}</p>
                <p className="mt-0.5 text-[11.5px] text-[#6b6b6b]">Completed</p>
              </div>
            </div>

            {totalActionNeeded > 0 ? (
              <div className="rounded-xl border border-[#fde68a] bg-[#fffbeb] p-4">
                <p className="text-[13px] font-semibold text-[#92400e]">
                  {totalActionNeeded === 1 ? '1 review needs your attention' : `${totalActionNeeded} reviews need your attention`}
                </p>
                <ul className="mt-1.5 space-y-0.5 text-[12px] text-[#78350f]">
                  {myActionNeeded.length > 0 ? (
                    <li>→ {myActionNeeded.length} self-assessment{myActionNeeded.length === 1 ? '' : 's'} to complete</li>
                  ) : null}
                  {theirActionNeeded.length > 0 ? (
                    <li>→ {theirActionNeeded.length} team member{theirActionNeeded.length === 1 ? '' : 's'} waiting for your assessment</li>
                  ) : null}
                </ul>
              </div>
            ) : null}

            {reviewing.length > 0 ? (
              <section>
                <h2 className="mb-3 text-[11.5px] font-semibold uppercase tracking-wide text-[#9b9b9b]">Direct reports to review</h2>
                <ul className="space-y-2">
                  {reviewing.map((r) => (
                    <li key={r.id}><ReviewCard r={r} /></li>
                  ))}
                </ul>
              </section>
            ) : null}
          </div>

          <aside className="min-w-0 space-y-6 lg:col-span-4">
              <section>
                <h2 className="mb-3 text-[11.5px] font-semibold uppercase tracking-wide text-[#9b9b9b]">My reviews</h2>
                {mine.length > 0 ? (
                  <ul className="space-y-2">
                    {mine.map((r) => (
                      <li key={r.id}><ReviewCard r={r} /></li>
                    ))}
                  </ul>
                ) : (
                  <div className="rounded-2xl border border-dashed border-[#d8d8d8] bg-[#faf9f6] px-4 py-6 text-[12.5px] text-[#6b6b6b]">
                    You&apos;re not enrolled in a cycle yet, or HR hasn&apos;t assigned you a review.
                  </div>
                )}
              </section>
            </aside>
        </div>
      )}
    </div>
  );
}
