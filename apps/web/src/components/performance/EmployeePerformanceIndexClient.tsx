'use client';

import Link from 'next/link';

type ReviewSummary = {
  id: string;
  cycle: { name: string; type: string; period_start: string; period_end: string; status: string } | null;
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
  annual: 'Annual', mid_year: 'Mid-year', probation: 'Probation', quarterly: 'Quarterly',
};

function statusBadge(s: string) {
  const base = 'rounded-full px-2 py-0.5 text-[10.5px] font-medium';
  switch (s) {
    case 'completed': return <span className={`${base} bg-[#dcfce7] text-[#166534]`}>Completed</span>;
    case 'self_submitted': return <span className={`${base} bg-[#eff6ff] text-[#1d4ed8]`}>Self-assessed</span>;
    case 'manager_submitted': return <span className={`${base} bg-[#faf5ff] text-[#7c3aed]`}>Manager assessed</span>;
    default: return <span className={`${base} bg-[#f5f4f1] text-[#9b9b9b]`}>Not started</span>;
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

export function EmployeePerformanceIndexClient({
  userId: _userId,
  reviews,
}: {
  userId: string;
  reviews: ReviewSummary[];
}) {
  const mine = reviews.filter((r) => r.is_reviewee);
  const reviewing = reviews.filter((r) => !r.is_reviewee);

  const actionNeeded = mine.filter((r) => r.status === 'pending' || r.status === 'self_submitted')
    .concat(reviewing.filter((r) => r.status === 'self_submitted'));

  return (
    <div className="mx-auto max-w-2xl px-5 py-8 sm:px-7">
      <h1 className="font-authSerif text-[26px] leading-tight tracking-[-0.03em] text-[#121212]">Performance</h1>
      <p className="mt-1 text-[13px] text-[#6b6b6b]">Your reviews and any direct reports awaiting your assessment.</p>

      {actionNeeded.length > 0 ? (
        <div className="mt-5 rounded-xl border border-[#fde68a] bg-[#fffbeb] p-4">
          <p className="text-[13px] font-medium text-[#92400e]">
            {actionNeeded.length} review{actionNeeded.length === 1 ? '' : 's'} need{actionNeeded.length === 1 ? 's' : ''} your attention
          </p>
        </div>
      ) : null}

      {/* My reviews */}
      {mine.length > 0 ? (
        <section className="mt-7">
          <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-wide text-[#9b9b9b]">My reviews</h2>
          <ul className="space-y-2">
            {mine.map((r) => (
              <li key={r.id}>
                <Link href={`/performance/${r.id}`} className="flex items-start justify-between rounded-xl border border-[#d8d8d8] bg-white p-4 hover:bg-[#faf9f6]">
                  <div>
                    <p className="font-medium text-[#121212]">
                      {r.cycle?.name ?? 'Review'}
                    </p>
                    <p className="text-[12px] text-[#9b9b9b]">
                      {r.cycle ? `${TYPE_LABELS[r.cycle.type] ?? r.cycle.type} · ${r.cycle.period_start} → ${r.cycle.period_end}` : ''}
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {statusBadge(r.status)}
                      {ratingChip(r.overall_rating)}
                    </div>
                  </div>
                  <span className="mt-1 shrink-0 text-[12px] text-[#9b9b9b]">Open →</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Reviews I need to complete as a manager */}
      {reviewing.length > 0 ? (
        <section className="mt-8">
          <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-wide text-[#9b9b9b]">To review (as manager)</h2>
          <ul className="space-y-2">
            {reviewing.map((r) => (
              <li key={r.id}>
                <Link href={`/performance/${r.id}`} className="flex items-start justify-between rounded-xl border border-[#d8d8d8] bg-white p-4 hover:bg-[#faf9f6]">
                  <div>
                    <p className="font-medium text-[#121212]">{r.reviewee_name ?? 'Employee'}</p>
                    <p className="text-[12px] text-[#9b9b9b]">{r.cycle?.name ?? 'Review'}</p>
                    <div className="mt-1.5">{statusBadge(r.status)}</div>
                  </div>
                  <span className="mt-1 shrink-0 text-[12px] text-[#9b9b9b]">Open →</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
