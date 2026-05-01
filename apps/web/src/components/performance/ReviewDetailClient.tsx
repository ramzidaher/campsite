'use client';

import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

type Goal = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  rating: string | null;
  set_by: string;
  sort_order: number;
};

const RATING_OPTIONS = [
  { value: 'exceptional', label: 'Exceptional', color: 'bg-[#dcfce7] text-[#166534] border-[#bbf7d0]' },
  { value: 'strong', label: 'Strong', color: 'bg-[#eff6ff] text-[#1d4ed8] border-[#bfdbfe]' },
  { value: 'meets_expectations', label: 'Meets expectations', color: 'bg-[#f5f4f1] text-[#4a4a4a] border-[#e8e8e8]' },
  { value: 'developing', label: 'Developing', color: 'bg-[#fff7ed] text-[#c2410c] border-[#fed7aa]' },
  { value: 'unsatisfactory', label: 'Unsatisfactory', color: 'bg-[#fef2f2] text-[#b91c1c] border-[#fecaca]' },
] as const;

const GOAL_STATUS_OPTIONS = [
  { value: 'not_started', label: 'Not started' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'carried_forward', label: 'Moving to next cycle' },
] as const;

const TYPE_LABELS: Record<string, string> = {
  annual: 'Annual review', mid_year: 'Mid-year check-in', probation: 'Probation review', quarterly: 'Quarterly review',
};

const RATING_COLORS: Record<string, string> = {
  exceptional: 'bg-[#dcfce7] text-[#166534]',
  strong: 'bg-[#eff6ff] text-[#1d4ed8]',
  meets_expectations: 'bg-[#f5f4f1] text-[#4a4a4a]',
  developing: 'bg-[#fff7ed] text-[#c2410c]',
  unsatisfactory: 'bg-[#fef2f2] text-[#b91c1c]',
};

const RATING_LABELS: Record<string, string> = {
  exceptional: 'Exceptional', strong: 'Strong', meets_expectations: 'Meets expectations',
  developing: 'Developing', unsatisfactory: 'Unsatisfactory',
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function ratingBadge(r: string | null) {
  if (!r) return null;
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-medium ${RATING_COLORS[r] ?? 'bg-[#f5f4f1] text-[#6b6b6b]'}`}>
      {RATING_LABELS[r] ?? r}
    </span>
  );
}

export function ReviewDetailClient({
  reviewId,
  isReviewee,
  isReviewer,
  canHR,
  review,
  cycle,
  goals,
}: {
  reviewId: string;
  isReviewee: boolean;
  isReviewer: boolean;
  canHR: boolean;
  review: {
    id: string;
    status: string;
    self_assessment: string | null;
    self_submitted_at: string | null;
    manager_assessment: string | null;
    overall_rating: string | null;
    manager_submitted_at: string | null;
    completed_at: string | null;
    reviewee_name: string;
    reviewer_name: string | null;
  };
  cycle: {
    name: string;
    type: string;
    period_start: string;
    period_end: string;
    self_assessment_due: string | null;
    manager_assessment_due: string | null;
    status: string;
  } | null;
  goals: Goal[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [selfText, setSelfText] = useState(review.self_assessment ?? '');
  const [managerText, setManagerText] = useState(review.manager_assessment ?? '');
  const [overallRating, setOverallRating] = useState(review.overall_rating ?? '');

  const [showGoalForm, setShowGoalForm] = useState(false);
  const [editGoalId, setEditGoalId] = useState<string | null>(null);
  const [goalTitle, setGoalTitle] = useState('');
  const [goalDesc, setGoalDesc] = useState('');
  const [goalStatus, setGoalStatus] = useState('in_progress');
  const [goalRating, setGoalRating] = useState('');

  function openGoalForm(g?: Goal) {
    if (g) {
      setEditGoalId(g.id);
      setGoalTitle(g.title);
      setGoalDesc(g.description ?? '');
      setGoalStatus(g.status);
      setGoalRating(g.rating ?? '');
    } else {
      setEditGoalId(null);
      setGoalTitle(''); setGoalDesc(''); setGoalStatus('in_progress'); setGoalRating('');
    }
    setShowGoalForm(true);
  }

  async function submitSelf(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    const { error } = await supabase.rpc('review_self_submit', { p_review_id: reviewId, p_self_assessment: selfText });
    setBusy(false);
    if (error) { setMsg(error.message); return; }
    router.refresh();
  }

  async function submitManager(e: React.FormEvent) {
    e.preventDefault();
    if (!overallRating) { setMsg('Please choose an overall rating before submitting.'); return; }
    setBusy(true); setMsg(null);
    const { error } = await supabase.rpc('review_manager_submit', {
      p_review_id: reviewId,
      p_manager_assessment: managerText,
      p_overall_rating: overallRating,
    });
    setBusy(false);
    if (error) { setMsg(error.message); return; }
    router.refresh();
  }

  async function saveGoal(e: React.FormEvent) {
    e.preventDefault();
    if (!goalTitle.trim()) return;
    setBusy(true); setMsg(null);
    const { error } = await supabase.rpc('review_goal_upsert', {
      p_review_id: reviewId,
      p_goal_id: editGoalId,
      p_title: goalTitle.trim(),
      p_description: goalDesc.trim() || null,
      p_status: goalStatus,
      p_rating: goalRating || null,
      p_sort_order: editGoalId ? goals.find((g) => g.id === editGoalId)?.sort_order ?? goals.length : goals.length,
    });
    setBusy(false);
    if (error) { setMsg(error.message); return; }
    setShowGoalForm(false);
    router.refresh();
  }

  const isOpen = review.status !== 'completed' && review.status !== 'cancelled';
  const cycleOpen = cycle?.status !== 'closed';
  const canEditSelf = isReviewee && isOpen && cycleOpen;
  const canEditManager = isReviewer && isOpen && cycleOpen;
  const canAddGoals = (isReviewee || isReviewer) && isOpen && cycleOpen;

  const today = new Date().toISOString().slice(0, 10);
  const selfDue = cycle?.self_assessment_due;
  const managerDue = cycle?.manager_assessment_due;
  const selfOverdue = selfDue && selfDue < today && canEditSelf && !review.self_submitted_at;
  const managerOverdue = managerDue && managerDue < today && canEditManager;

  return (
    <div className="mx-auto max-w-2xl px-5 py-8 sm:px-7">
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-authSerif text-[26px] leading-tight tracking-[-0.03em] text-[#121212]">
          {isReviewee ? (cycle?.name ?? 'Review') : review.reviewee_name}
        </h1>
        <p className="mt-1 text-[13px] text-[#6b6b6b]">
          {cycle ? `${TYPE_LABELS[cycle.type] ?? cycle.type} · ${cycle.period_start} – ${cycle.period_end}` : ''}
          {!isReviewee && isReviewer ? ` · ${review.reviewee_name}` : ''}
          {isReviewee && review.reviewer_name ? ` · Reviewed by ${review.reviewer_name}` : ''}
        </p>
        {review.overall_rating ? (
          <div className="mt-2">{ratingBadge(review.overall_rating)}</div>
        ) : null}
      </div>

      {/* Completed banner */}
      {review.status === 'completed' ? (
        <div className="mb-6 rounded-2xl border border-[#bbf7d0] bg-[#f0fdf4] p-5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#dcfce7]">
              <svg viewBox="0 0 24 24" className="h-5 w-5 text-[#16a34a]" fill="none" stroke="currentColor" strokeWidth={2.5}>
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <div>
              <p className="text-[14px] font-semibold text-[#166534]">Review complete</p>
              {review.completed_at ? (
                <p className="text-[12px] text-[#4ade80]">Finalised {fmtDate(review.completed_at)}</p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {/* Action needed banners */}
      {canEditSelf && !review.self_submitted_at ? (
        <div className={`mb-4 rounded-xl border p-4 ${selfOverdue ? 'border-[#fecaca] bg-[#fef2f2]' : 'border-[#fde68a] bg-[#fffbeb]'}`}>
          <p className={`text-[13px] font-semibold ${selfOverdue ? 'text-[#b91c1c]' : 'text-[#92400e]'}`}>
            {selfOverdue ? 'Your self-assessment is overdue' : 'Action needed: complete your self-assessment'}
          </p>
          <p className={`mt-0.5 text-[12px] ${selfOverdue ? 'text-[#b91c1c]' : 'text-[#78350f]'}`}>
            Write about your achievements and challenges during this review period.
            {selfDue ? ` Due by ${fmtDate(selfDue)}.` : ''}
          </p>
        </div>
      ) : null}

      {canEditManager && review.status === 'self_submitted' ? (
        <div className={`mb-4 rounded-xl border p-4 ${managerOverdue ? 'border-[#fecaca] bg-[#fef2f2]' : 'border-[#fde68a] bg-[#fffbeb]'}`}>
          <p className={`text-[13px] font-semibold ${managerOverdue ? 'text-[#b91c1c]' : 'text-[#92400e]'}`}>
            {managerOverdue ? `${review.reviewee_name}'s review is overdue` : `${review.reviewee_name} has submitted their self-assessment`}
          </p>
          <p className={`mt-0.5 text-[12px] ${managerOverdue ? 'text-[#b91c1c]' : 'text-[#78350f]'}`}>
            Complete your manager assessment and overall rating to finalise the review.
            {managerDue ? ` Due by ${fmtDate(managerDue)}.` : ''}
          </p>
        </div>
      ) : null}

      {msg ? <p className="mb-4 rounded-lg border border-[#fecaca] bg-[#fef2f2] px-3 py-2 text-[13px] text-[#b91c1c]">{msg}</p> : null}

      {/* Self-assessment */}
      <section className="mb-4 rounded-2xl border border-[#e8e8e8] bg-white p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[15px] font-semibold text-[#121212]">
            {isReviewee ? 'Your self-assessment' : 'Self-assessment'}
          </h2>
          {review.self_submitted_at ? (
            <span className="rounded-full bg-[#dcfce7] px-2.5 py-0.5 text-[11px] font-medium text-[#166534]">
              Submitted {fmtDate(review.self_submitted_at)}
            </span>
          ) : null}
        </div>
        {!isReviewee && !review.self_submitted_at ? (
          <p className="text-[13px] text-[#9b9b9b]">
            Waiting for {review.reviewee_name} to complete their self-assessment.
          </p>
        ) : canEditSelf ? (
          <form onSubmit={(e) => void submitSelf(e)}>
            <textarea
              rows={6}
              value={selfText}
              onChange={(e) => setSelfText(e.target.value)}
              placeholder="Describe your achievements, any challenges you faced, and where you'd like to grow…"
              className="w-full rounded-xl border border-[#e8e8e8] bg-[#faf9f6] px-3 py-2.5 text-[13px] leading-relaxed focus:border-[#121212] focus:outline-none"
            />
            {selfDue ? (
              <p className="mt-1.5 text-[11.5px] text-[#9b9b9b]">Due by {fmtDate(selfDue)}</p>
            ) : null}
            <button
              type="submit"
              disabled={busy}
              className="mt-3 rounded-lg bg-[#121212] px-4 py-2 text-[13px] font-medium text-white disabled:opacity-50"
            >
              {busy ? 'Saving…' : review.self_submitted_at ? 'Update self-assessment' : 'Submit self-assessment'}
            </button>
          </form>
        ) : (
          <div>
            {review.self_assessment ? (
              <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-[#4a4a4a]">{review.self_assessment}</p>
            ) : (
              <p className="text-[13px] text-[#9b9b9b]">No self-assessment submitted yet.</p>
            )}
          </div>
        )}
      </section>

      {/* Goals */}
      <section className="mb-4 rounded-2xl border border-[#e8e8e8] bg-white p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[15px] font-semibold text-[#121212]">Goals</h2>
          {canAddGoals && !showGoalForm ? (
            <button
              type="button"
              onClick={() => openGoalForm()}
              className="rounded-lg border border-[#e8e8e8] bg-[#faf9f6] px-3 py-1.5 text-[12px] font-medium text-[#121212] hover:bg-[#f0efe9] transition-colors"
            >
              + Add goal
            </button>
          ) : null}
        </div>

        {showGoalForm ? (
          <form className="mt-1 space-y-3" onSubmit={(e) => void saveGoal(e)}>
            <label className="block text-[12.5px] font-medium text-[#6b6b6b]">
              Goal
              <input
                type="text"
                required
                value={goalTitle}
                onChange={(e) => setGoalTitle(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[#e8e8e8] bg-[#faf9f6] px-3 py-2 text-[13px] focus:border-[#121212] focus:outline-none"
                placeholder="e.g. Improve code review turnaround"
              />
            </label>
            <label className="block text-[12.5px] font-medium text-[#6b6b6b]">
              More detail (optional)
              <textarea
                rows={2}
                value={goalDesc}
                onChange={(e) => setGoalDesc(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[#e8e8e8] bg-[#faf9f6] px-3 py-2 text-[13px] focus:border-[#121212] focus:outline-none"
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-[12.5px] font-medium text-[#6b6b6b]">
                Progress
                <select
                  value={goalStatus}
                  onChange={(e) => setGoalStatus(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#e8e8e8] bg-[#faf9f6] px-3 py-2 text-[13px] focus:border-[#121212] focus:outline-none"
                >
                  {GOAL_STATUS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </label>
              <label className="block text-[12.5px] font-medium text-[#6b6b6b]">
                Rating (optional)
                <select
                  value={goalRating}
                  onChange={(e) => setGoalRating(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-[#e8e8e8] bg-[#faf9f6] px-3 py-2 text-[13px] focus:border-[#121212] focus:outline-none"
                >
                  <option value="">No rating</option>
                  {RATING_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={busy}
                className="rounded-lg bg-[#121212] px-4 py-2 text-[13px] font-medium text-white disabled:opacity-50"
              >
                {busy ? 'Saving…' : 'Save goal'}
              </button>
              <button
                type="button"
                onClick={() => setShowGoalForm(false)}
                className="rounded-lg border border-[#e8e8e8] bg-white px-4 py-2 text-[13px] font-medium text-[#6b6b6b] hover:bg-[#faf9f6]"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : null}

        {goals.length === 0 && !showGoalForm ? (
          <p className="text-[13px] text-[#9b9b9b]">No goals added yet.</p>
        ) : null}

        {goals.length > 0 ? (
          <ul className="divide-y divide-[#f0efe9]">
            {goals.map((g) => (
              <li key={g.id} className="py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[13px] font-medium text-[#121212]">{g.title}</span>
                      <span className={[
                        'rounded-full px-2 py-0.5 text-[10.5px] font-medium',
                        g.status === 'completed' ? 'bg-[#dcfce7] text-[#166534]' :
                        g.status === 'carried_forward' ? 'bg-[#fff7ed] text-[#c2410c]' :
                        g.status === 'in_progress' ? 'bg-[#eff6ff] text-[#1d4ed8]' :
                        'bg-[#f5f4f1] text-[#6b6b6b]'
                      ].join(' ')}>
                        {GOAL_STATUS_OPTIONS.find((o) => o.value === g.status)?.label ?? g.status}
                      </span>
                      {ratingBadge(g.rating)}
                    </div>
                    {g.description ? (
                      <p className="mt-0.5 text-[12px] text-[#6b6b6b]">{g.description}</p>
                    ) : null}
                    <p className="mt-0.5 text-[10.5px] text-[#c8c8c8]">
                      {g.set_by === 'manager' ? 'Added by manager' : 'Added by employee'}
                    </p>
                  </div>
                  {canAddGoals ? (
                    <button
                      type="button"
                      onClick={() => openGoalForm(g)}
                      className="shrink-0 text-[11.5px] text-[#9b9b9b] underline hover:text-[#121212]"
                    >
                      Edit
                    </button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {/* Manager assessment */}
      {(isReviewer || canHR || review.manager_assessment) ? (
        <section className="mb-4 rounded-2xl border border-[#e8e8e8] bg-white p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[15px] font-semibold text-[#121212]">
              {isReviewer && !isReviewee ? 'Your assessment' : 'Manager assessment'}
            </h2>
            {review.manager_submitted_at ? (
              <span className="rounded-full bg-[#dcfce7] px-2.5 py-0.5 text-[11px] font-medium text-[#166534]">
                Submitted {fmtDate(review.manager_submitted_at)}
              </span>
            ) : null}
          </div>
          {canEditManager && review.status !== 'completed' ? (
            <form className="space-y-4" onSubmit={(e) => void submitManager(e)}>
              <textarea
                rows={6}
                value={managerText}
                onChange={(e) => setManagerText(e.target.value)}
                placeholder="Summarise their performance, key contributions, and areas to develop…"
                className="w-full rounded-xl border border-[#e8e8e8] bg-[#faf9f6] px-3 py-2.5 text-[13px] leading-relaxed focus:border-[#121212] focus:outline-none"
              />

              {/* Rating pill buttons */}
              <div>
                <p className="mb-2 text-[12.5px] font-medium text-[#6b6b6b]">
                  Overall rating <span className="text-[#b91c1c]">*</span>
                </p>
                <div className="flex flex-wrap gap-2">
                  {RATING_OPTIONS.map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => setOverallRating(o.value)}
                      className={[
                        'rounded-full border px-3 py-1.5 text-[12px] font-medium transition-all',
                        overallRating === o.value
                          ? `${o.color} ring-2 ring-offset-1 ring-current`
                          : 'border-[#e8e8e8] bg-white text-[#6b6b6b] hover:border-[#c8c8c8]',
                      ].join(' ')}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>

              {managerDue ? (
                <p className="text-[11.5px] text-[#9b9b9b]">Due by {fmtDate(managerDue)}</p>
              ) : null}
              <button
                type="submit"
                disabled={busy}
                className="rounded-lg bg-[#121212] px-4 py-2 text-[13px] font-medium text-white disabled:opacity-50"
              >
                {busy ? 'Submitting…' : 'Submit & complete review'}
              </button>
            </form>
          ) : (
            <div>
              {review.manager_assessment ? (
                <>
                  <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-[#4a4a4a]">{review.manager_assessment}</p>
                  {review.overall_rating ? (
                    <div className="mt-3 flex items-center gap-2">
                      <span className="text-[12px] text-[#9b9b9b]">Overall rating:</span>
                      {ratingBadge(review.overall_rating)}
                    </div>
                  ) : null}
                </>
              ) : (
                <p className="text-[13px] text-[#9b9b9b]">
                  {isReviewee ? 'Waiting for your manager to complete their assessment.' : 'No assessment submitted yet.'}
                </p>
              )}
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}
