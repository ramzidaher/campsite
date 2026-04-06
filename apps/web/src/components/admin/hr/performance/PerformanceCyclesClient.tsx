'use client';

import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

type Cycle = {
  id: string;
  name: string;
  type: string;
  status: string;
  period_start: string;
  period_end: string;
  self_assessment_due: string | null;
  manager_assessment_due: string | null;
  created_at: string;
  review_total: number;
  review_completed: number;
};

const TYPE_LABELS: Record<string, string> = {
  annual: 'Annual',
  mid_year: 'Mid-year',
  probation: 'Probation',
  quarterly: 'Quarterly',
};

function statusBadge(s: string) {
  const base = 'rounded-full px-2 py-0.5 text-[11px] font-medium';
  switch (s) {
    case 'active': return <span className={`${base} bg-[#dcfce7] text-[#166534]`}>Active</span>;
    case 'closed': return <span className={`${base} bg-[#f5f4f1] text-[#6b6b6b]`}>Closed</span>;
    default: return <span className={`${base} bg-[#fff7ed] text-[#c2410c]`}>Draft</span>;
  }
}

export function PerformanceCyclesClient({
  orgId: _orgId,
  canManage,
  cycles,
}: {
  orgId: string;
  canManage: boolean;
  cycles: Cycle[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [type, setType] = useState('annual');
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [selfDue, setSelfDue] = useState('');
  const [managerDue, setManagerDue] = useState('');

  async function createCycle(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !periodStart || !periodEnd) return;
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.from('review_cycles').insert({
      name: name.trim(),
      type,
      period_start: periodStart,
      period_end: periodEnd,
      self_assessment_due: selfDue || null,
      manager_assessment_due: managerDue || null,
      status: 'draft',
    });
    setBusy(false);
    if (error) { setMsg(error.message); return; }
    setShowForm(false);
    setName(''); setType('annual'); setPeriodStart(''); setPeriodEnd(''); setSelfDue(''); setManagerDue('');
    router.refresh();
  }

  const active = cycles.filter((c) => c.status === 'active');
  const rest = cycles.filter((c) => c.status !== 'active');

  return (
    <div className="mx-auto max-w-4xl px-5 py-8 sm:px-7">
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-authSerif text-[26px] leading-tight tracking-[-0.03em] text-[#121212]">Performance reviews</h1>
          <p className="mt-1 text-[13px] text-[#6b6b6b]">Manage review cycles, enroll employees, and track completion.</p>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="inline-flex h-9 items-center rounded-lg bg-[#121212] px-4 text-[12.5px] font-medium text-[#faf9f6] hover:bg-[#2a2a2a]"
          >
            New cycle
          </button>
        )}
      </div>

      {msg ? <p className="mb-4 rounded-lg border border-[#fecaca] bg-[#fef2f2] px-3 py-2 text-[13px] text-[#b91c1c]">{msg}</p> : null}

      {showForm ? (
        <div className="mb-6 rounded-2xl border border-[#e8e8e8] bg-white p-5">
          <h2 className="text-[15px] font-semibold text-[#121212]">New review cycle</h2>
          <form className="mt-4 grid gap-4 sm:grid-cols-2" onSubmit={(e) => void createCycle(e)}>
            <label className="block text-[12.5px] font-medium text-[#6b6b6b] sm:col-span-2">
              Name
              <input type="text" required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Annual Review 2026" className="mt-1 w-full rounded-xl border border-[#e8e8e8] bg-[#faf9f6] px-3 py-2 text-[13px] focus:border-[#121212] focus:outline-none" />
            </label>
            <label className="block text-[12.5px] font-medium text-[#6b6b6b]">
              Type
              <select value={type} onChange={(e) => setType(e.target.value)} className="mt-1 w-full rounded-xl border border-[#e8e8e8] bg-[#faf9f6] px-3 py-2 text-[13px] focus:border-[#121212] focus:outline-none">
                {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <div />
            <label className="block text-[12.5px] font-medium text-[#6b6b6b]">
              Period start
              <input type="date" required value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} className="mt-1 w-full rounded-xl border border-[#e8e8e8] bg-[#faf9f6] px-3 py-2 text-[13px] focus:border-[#121212] focus:outline-none" />
            </label>
            <label className="block text-[12.5px] font-medium text-[#6b6b6b]">
              Period end
              <input type="date" required value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} className="mt-1 w-full rounded-xl border border-[#e8e8e8] bg-[#faf9f6] px-3 py-2 text-[13px] focus:border-[#121212] focus:outline-none" />
            </label>
            <label className="block text-[12.5px] font-medium text-[#6b6b6b]">
              Self-assessment due (optional)
              <input type="date" value={selfDue} onChange={(e) => setSelfDue(e.target.value)} className="mt-1 w-full rounded-xl border border-[#e8e8e8] bg-[#faf9f6] px-3 py-2 text-[13px] focus:border-[#121212] focus:outline-none" />
            </label>
            <label className="block text-[12.5px] font-medium text-[#6b6b6b]">
              Manager assessment due (optional)
              <input type="date" value={managerDue} onChange={(e) => setManagerDue(e.target.value)} className="mt-1 w-full rounded-xl border border-[#e8e8e8] bg-[#faf9f6] px-3 py-2 text-[13px] focus:border-[#121212] focus:outline-none" />
            </label>
            <div className="flex gap-2 sm:col-span-2">
              <button type="submit" disabled={busy} className="rounded-lg bg-[#121212] px-4 py-2 text-[13px] font-medium text-white disabled:opacity-50">{busy ? 'Creating…' : 'Create cycle'}</button>
              <button type="button" onClick={() => setShowForm(false)} className="rounded-lg border border-[#e8e8e8] bg-white px-4 py-2 text-[13px] font-medium text-[#6b6b6b] hover:bg-[#faf9f6]">Cancel</button>
            </div>
          </form>
        </div>
      ) : null}

      {cycles.length === 0 ? (
        <div className="rounded-2xl border border-[#e8e8e8] bg-white px-4 py-10 text-center">
          <p className="text-[14px] font-medium text-[#121212]">No review cycles yet</p>
          <p className="mt-1 text-[13px] text-[#9b9b9b]">Create a cycle to start collecting performance reviews.</p>
        </div>
      ) : null}

      {active.length > 0 ? (
        <section className="mb-6">
          <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-wide text-[#9b9b9b]">Active</h2>
          <ul className="space-y-2">
            {active.map((c) => <CycleRow key={c.id} cycle={c} />)}
          </ul>
        </section>
      ) : null}

      {rest.length > 0 ? (
        <section>
          <h2 className="mb-3 text-[12px] font-semibold uppercase tracking-wide text-[#9b9b9b]">All cycles</h2>
          <ul className="space-y-2">
            {rest.map((c) => <CycleRow key={c.id} cycle={c} />)}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function CycleRow({ cycle }: { cycle: Cycle }) {
  const progress = cycle.review_total > 0 ? Math.round((cycle.review_completed / cycle.review_total) * 100) : 0;
  return (
    <li>
      <Link href={`/hr/performance/${cycle.id}`} className="flex items-center justify-between rounded-xl border border-[#e8e8e8] bg-white p-4 hover:bg-[#faf9f6] transition-colors">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-[#121212]">{cycle.name}</span>
            {statusBadge(cycle.status)}
            <span className="rounded-full bg-[#f5f4f1] px-2 py-0.5 text-[10.5px] text-[#6b6b6b]">
              {TYPE_LABELS[cycle.type] ?? cycle.type}
            </span>
          </div>
          <p className="mt-0.5 text-[12px] text-[#9b9b9b]">
            {cycle.period_start} → {cycle.period_end}
            {cycle.review_total > 0
              ? ` · ${cycle.review_completed}/${cycle.review_total} completed (${progress}%)`
              : ' · No reviews yet'}
          </p>
        </div>
        <span className="ml-4 shrink-0 text-[12px] text-[#9b9b9b]">Open →</span>
      </Link>
    </li>
  );
}
