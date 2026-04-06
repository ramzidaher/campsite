'use client';

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

function statusInfo(status: string, isReviewee: boolean): { label: string; hint: string; className: string } {
  switch (status) {
    case 'completed':
      return { label: 'Complete', hint: '', className: 'bg-[#dcfce7] text-[#166534]' };
    case 'self_submitted':
      return isReviewee
        ? { label: 'Self-assessment done', hint: 'Waiting for your manager to complete their part', className: 'bg-[#eff6ff] text-[#1d4ed8]' }
        : { label: 'Ready to review', hint: 'The employee has submitted their self-assessment — your turn', className: 'bg-[#fef9c3] text-[#854d0e]' };
    case 'manager_submitted':
      return { label: 'Manager assessment done', hint: '', className: 'bg-[#faf5ff] text-[#7c3aed]' };
    default:
      return isReviewee
        ? { label: 'Self-assessment needed', hint: 'You need to submit your self-assessment', className: 'bg-[#fff7ed] text-[#c2410c]' }
        : { label: 'Not started', hint: 'Waiting for employee to submit self-assessment', className: 'bg-[#f5f4f1] text-[#9b9b9b]' };
  }
}

function ratingChip(r: string | null) {
  if (!r) return null;
  const colors: Record<string, string> = {
    exceptional: 'bg-[#dcfce7] text-[#166534]',
    strong: 'bg-[#eff6ff] text-[#1d4ed8]',
    meets_expectations: 'bg-[#f5f4f1] text-[#4a4a4a]',
    developing: 'bg-[#fff7ed] text-[#c2410c]',
    unsatisfactory: 'bg-[#fef2f2] text-[#b91c1c]',
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-medium ${colors[r] ?? 'bg-[#f5f4f1] text-[#6b6b6b]'}`}>
      {RATING_LABELS[r] ?? r}
    </span>
  );
}

function ReviewCard({ r, isReviewee }: { r: ReviewSummary; isReviewee: boolean }) {
  const info = statusInfo(r.status, isReviewee);
  const today = new Date().toISOString().slice(0, 10);
  const dueDate = isReviewee ? r.cycle?.self_assessment_due : r.cycle?.manager_assessment_due;
  const isOverdue = dueDate && dueDate < today && r.status !== 'completed';

  return (
    <Link
      href={`/performance/${r.id}`}
      className="flex items-start justify-between rounded-xl border border-[#d8d8d8] bg-white p-4 hover:bg-[#faf9f6] transition-colors"
    >
      <div className="flex-1 min-w-0">
        <p className="font-medium text-[#121212]">
          {isReviewee ? (r.cycle?.name ?? 'Review') : (r.reviewee_name ?? 'Team member')}
        </p>
        {r.cycle ? (
          <p className="mt-0.5 text-[12px] text-[#9b9b9b]">
            {TYPE_LABELS[r.cycle.type] ?? r.cycle.type} · {r.cycle.period_start} – {r.cycle.period_end}
          </p>
        ) : null}
        {!isReviewee && r.cycle?.name ? (
          <p className="text-[12px] text-[#9b9b9b]">{r.cycle.name}</p>
        ) : null}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-medium ${info.className}`}>
            {info.label}
          </span>
          {ratingChip(r.overall_rating)}
        </div>
        {info.hint ? <p className="mt-1 text-[11.5px] text-[#6b6b6b]">{info.hint}</p> : null}
        {isOverdue && dueDate ? (
          <p className="mt-1 text-[11.5px] font-medium text-[#b91c1c]">
            Overdue — was due {dueDate}
          </p>
        ) : dueDate && r.status !== 'completed' ? (
          <p className="mt-1 text-[11.5px] text-[#9b9b9b]">Due by {dueDate}</p>
        ) : null}
      </div>
      <span className="ml-3 mt-0.5 shrink-0 text-[12px] text-[#9b9b9b]">Open →</span>
    </Link>
  );
}

export function EmployeePerformanceIndexClient({
  userId: _userId,
  reviews,
}: {
  userId: string;
  reviews: ReviewSummary[];
}) {
  const mine = reviews.filter((r) => r.is_reviewee);
  const reviewing = reviews.filter((r) => !r.is_reviewee);

  const myActionNeeded = mine.filter((r) => r.status === 'pending');
  const theirActionNeeded = reviewing.filter((r) => r.status === 'self_submitted');
  const totalActionNeeded = myActionNeeded.length + theirActionNeeded.length;

  return (
    <div className="mx-auto max-w-2xl px-5 py-8 sm:px-7">
      <h1 className="font-authSerif text-[26px] leading-tight tracking-[-0.03em] text-[#121212]">Performance</h1>
      <p className="mt-1 text-[13px] text-[#6b6b6b]">
        Your reviews and any team members waiting on your feedback.
      </p>

      {totalActionNeeded > 0 ? (
        <div className="mt-5 rounded-xl border border-[#fde68a] bg-[#fffbeb] p-4">
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

      {mine.length > 0 ? (
        <section className="mt-8">
          <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-wide text-[#9b9b9b]">My reviews</h2>
          <ul className="space-y-2">
            {mine.map((r) => (
              <li key={r.id}>
                <ReviewCard r={r} isReviewee={true} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {reviewing.length > 0 ? (
        <section className="mt-8">
          <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-wide text-[#9b9b9b]">Direct reports to review</h2>
          <ul className="space-y-2">
            {reviewing.map((r) => (
              <li key={r.id}>
                <ReviewCard r={r} isReviewee={false} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
