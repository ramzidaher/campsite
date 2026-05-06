'use client';

import { invalidateClientCaches } from '@/lib/cache/clientInvalidate';
import { createClient } from '@/lib/supabase/client';
import { ArrowRight, Plus } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

type ReviewRow = {
  review_id: string;
  reviewee_id: string;
  reviewee_name: string;
  reviewee_email: string | null;
  reviewer_id: string | null;
  reviewer_name: string | null;
  status: string;
  overall_rating: string | null;
  self_submitted_at: string | null;
  manager_submitted_at: string | null;
  completed_at: string | null;
  goal_count: number;
};

type Member = { id: string; full_name: string; email: string | null };

const RATING_LABELS: Record<string, string> = {
  exceptional: 'Exceptional',
  strong: 'Strong',
  meets_expectations: 'Meets expectations',
  developing: 'Developing',
  unsatisfactory: 'Unsatisfactory',
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'Not started',
  self_submitted: 'Self-assessed',
  manager_submitted: 'Manager assessed',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

const CYCLE_STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  active: 'Active',
  closed: 'Closed',
};

function statusBadge(s: string) {
  const base = 'rounded-full px-2 py-0.5 text-[10.5px] font-medium';
  switch (s) {
    case 'completed': return <span className={`${base} bg-[#dcfce7] text-[#166534]`}>{STATUS_LABELS[s]}</span>;
    case 'self_submitted': return <span className={`${base} bg-[#eff6ff] text-[#1d4ed8]`}>{STATUS_LABELS[s]}</span>;
    case 'manager_submitted': return <span className={`${base} bg-[#faf5ff] text-[#7c3aed]`}>{STATUS_LABELS[s]}</span>;
    case 'cancelled': return <span className={`${base} bg-[#fef2f2] text-[#b91c1c]`}>{STATUS_LABELS[s]}</span>;
    default: return <span className={`${base} bg-[#f5f4f1] text-[#9b9b9b]`}>{STATUS_LABELS[s] ?? s}</span>;
  }
}

export function PerformanceCycleDetailClient({
  cycleId,
  cycle,
  reviews,
  members,
}: {
  cycleId: string;
  cycle: {
    id: string;
    name: string;
    type: string;
    status: string;
    period_start: string;
    period_end: string;
    self_assessment_due: string | null;
    manager_assessment_due: string | null;
  };
  reviews: ReviewRow[];
  members: Member[];  // not yet enrolled
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [showEnroll, setShowEnroll] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  async function activateCycle() {
    setBusy(true);
    const { error } = await supabase.from('review_cycles').update({ status: 'active' }).eq('id', cycleId);
    setBusy(false);
    if (error) { setMsg(error.message); return; }
    await invalidateClientCaches({ scopes: ['performance'] }).catch(() => null);
    router.refresh();
  }

  async function closeCycle() {
    if (!confirm('Close this cycle? No further changes can be made.')) return;
    setBusy(true);
    const { error } = await supabase.from('review_cycles').update({ status: 'closed' }).eq('id', cycleId);
    setBusy(false);
    if (error) { setMsg(error.message); return; }
    await invalidateClientCaches({ scopes: ['performance'] }).catch(() => null);
    router.refresh();
  }

  async function enroll() {
    if (!selected.size) return;
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.rpc('review_cycle_enroll', {
      p_cycle_id: cycleId,
      p_user_ids: [...selected],
    });
    setBusy(false);
    if (error) { setMsg(error.message); return; }
    setShowEnroll(false);
    setSelected(new Set());
    await invalidateClientCaches({ scopes: ['performance'] }).catch(() => null);
    router.refresh();
  }

  const completed = reviews.filter((r) => r.status === 'completed').length;
  const progress = reviews.length > 0 ? Math.round((completed / reviews.length) * 100) : 0;
  const cycleTypeLabel = cycle.type
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

  return (
    <div className="mx-auto max-w-4xl px-5 py-8 sm:px-7">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-authSerif text-[24px] leading-tight tracking-[-0.03em] text-[#121212]">{cycle.name}</h1>
          <p className="mt-0.5 text-[13px] text-[#6b6b6b]">
            {cycle.period_start} to {cycle.period_end}
            {cycle.self_assessment_due ? ` · Self-assessment due ${cycle.self_assessment_due}` : ''}
            {cycle.manager_assessment_due ? ` · Manager due ${cycle.manager_assessment_due}` : ''}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-[#f5f4f1] px-2 py-0.5 text-[10.5px] text-[#6b6b6b]">{cycleTypeLabel}</span>
            <span className="rounded-full bg-[#f5f4f1] px-2 py-0.5 text-[10.5px] text-[#6b6b6b]">
              {CYCLE_STATUS_LABELS[cycle.status] ?? cycle.status}
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          {cycle.status === 'draft' && (
            <button type="button" disabled={busy} onClick={() => void activateCycle()} className="rounded-lg bg-[#121212] px-3 py-1.5 text-[12.5px] font-medium text-white disabled:opacity-50">
              Activate cycle
            </button>
          )}
          {cycle.status === 'active' && (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => setShowEnroll(true)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#121212] px-3 py-1.5 text-[12.5px] font-medium text-white disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5" aria-hidden />
                Enroll members
              </button>
              <button type="button" disabled={busy} onClick={() => void closeCycle()} className="rounded-lg border border-[#d8d8d8] bg-white px-3 py-1.5 text-[12.5px] font-medium text-[#b91c1c] hover:bg-[#fef2f2]">
                Close cycle
              </button>
            </>
          )}
        </div>
      </div>

      {msg ? <p className="mt-4 rounded-lg border border-[#fecaca] bg-[#fef2f2] px-3 py-2 text-[13px] text-[#b91c1c]">{msg}</p> : null}

      {/* Enroll panel */}
      {showEnroll && members.length > 0 ? (
        <div className="mt-5 rounded-xl border border-[#d8d8d8] bg-white p-5">
          <h2 className="text-[14px] font-semibold text-[#121212]">Enroll members</h2>
          <p className="mt-1 text-[12px] text-[#9b9b9b]">Select members not yet in this cycle. Their line manager is auto-assigned as reviewer.</p>
          <div className="mt-3 max-h-56 overflow-y-auto space-y-1.5 rounded-lg border border-[#ececec] p-3">
            {members.map((m) => (
              <label key={m.id} className="flex items-center gap-2 text-[13px] text-[#4a4a4a]">
                <input
                  type="checkbox"
                  checked={selected.has(m.id)}
                  onChange={(e) =>
                    setSelected((prev) => {
                      const n = new Set(prev);
                      if (e.target.checked) n.add(m.id);
                      else n.delete(m.id);
                      return n;
                    })
                  }
                />
                {m.full_name}
                {m.email ? <span className="text-[11.5px] text-[#9b9b9b]">({m.email})</span> : null}
              </label>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <button type="button" disabled={busy || !selected.size} onClick={() => void enroll()} className="rounded-lg bg-[#121212] px-4 py-2 text-[13px] font-medium text-[#faf9f6] disabled:opacity-50">
              {busy ? 'Enrolling…' : `Enroll ${selected.size || ''}`}
            </button>
            <button type="button" onClick={() => { setShowEnroll(false); setSelected(new Set()); }} className="rounded-lg border border-[#d8d8d8] bg-white px-4 py-2 text-[13px] font-medium text-[#6b6b6b] hover:bg-[#f5f4f1]">Cancel</button>
          </div>
        </div>
      ) : showEnroll ? (
        <p className="mt-4 text-[13px] text-[#9b9b9b]">All active members are already enrolled.</p>
      ) : null}

      {/* Progress */}
      {reviews.length > 0 ? (
        <div className="mt-5 rounded-xl border border-[#d8d8d8] bg-white p-4">
          <div className="flex items-center justify-between text-[13px]">
            <span className="font-medium text-[#121212]">{completed} of {reviews.length} reviews completed</span>
            <span className="text-[#9b9b9b]">{progress}%</span>
          </div>
          <div className="mt-2 h-1.5 w-full rounded-full bg-[#ececec]">
            <div className="h-1.5 rounded-full bg-[#121212] transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>
      ) : null}

      {/* Reviews table */}
      <div className="mt-5 overflow-x-auto rounded-xl border border-[#d8d8d8] bg-white">
        <table className="w-full min-w-[640px] text-[13px]">
          <thead>
            <tr className="border-b border-[#ececec] text-left text-[11px] font-semibold uppercase tracking-wide text-[#9b9b9b]">
              <th className="px-4 py-3">Employee</th>
              <th className="px-4 py-3">Reviewer</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Rating</th>
              <th className="px-4 py-3">Goals</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[#ececec]">
            {reviews.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-6 text-center text-[#9b9b9b]">No members enrolled yet.</td></tr>
            ) : null}
            {reviews.map((r) => (
              <tr key={r.review_id} className="hover:bg-[#faf9f6]">
                <td className="px-4 py-3">
                  <p className="font-medium text-[#121212]">{r.reviewee_name}</p>
                  {r.reviewee_email ? <p className="text-[11.5px] text-[#9b9b9b]">{r.reviewee_email}</p> : null}
                </td>
                <td className="px-4 py-3 text-[#6b6b6b]">{r.reviewer_name ?? <span className="text-[#c8c8c8]">None</span>}</td>
                <td className="px-4 py-3">{statusBadge(r.status)}</td>
                <td className="px-4 py-3 text-[#6b6b6b]">{r.overall_rating ? RATING_LABELS[r.overall_rating] ?? r.overall_rating : ''}</td>
                <td className="px-4 py-3 text-[#9b9b9b]">{r.goal_count}</td>
                <td className="px-4 py-3 text-right">
                  <Link
                    href={`/performance/${r.review_id}`}
                    className="inline-flex items-center gap-1 text-[12px] font-medium text-[#121212] hover:underline hover:underline-offset-2"
                  >
                    Open
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
