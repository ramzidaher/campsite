'use client';

import { createClient } from '@/lib/supabase/client';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

type Task = {
  id: string;
  title: string;
  description: string | null;
  assignee_type: string;
  category: string;
  due_date: string | null;
  sort_order: number;
  status: string;
  completed_at: string | null;
};

const CATEGORY_LABELS: Record<string, string> = {
  documents: 'Documents',
  it_setup: 'IT setup',
  introductions: 'Introductions',
  compliance: 'Compliance',
  other: 'Other',
};

export function EmployeeOnboardingClient({
  runId,
  runStatus,
  employmentStartDate,
  canComplete,
  tasks,
}: {
  runId: string;
  runStatus: string;
  employmentStartDate: string;
  canComplete: boolean;
  tasks: Task[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const myTasks = tasks.filter((t) => t.assignee_type === 'employee');
  const otherTasks = tasks.filter((t) => t.assignee_type !== 'employee');
  const today = new Date().toISOString().slice(0, 10);

  const completedCount = tasks.filter((t) => t.status !== 'pending').length;
  const progress = tasks.length > 0 ? Math.round((completedCount / tasks.length) * 100) : 0;

  async function toggle(task: Task) {
    if (!canComplete || task.assignee_type !== 'employee') return;
    setBusy(task.id);
    setMsg(null);
    const next = task.status === 'completed' ? 'pending' : 'completed';
    const { error } = await supabase.rpc('onboarding_task_update', { p_task_id: task.id, p_status: next });
    setBusy(null);
    if (error) { setMsg(error.message); return; }
    router.refresh();
  }

  const grouped = Object.entries(CATEGORY_LABELS).map(([key, label]) => ({
    key,
    label,
    mine: myTasks.filter((t) => t.category === key),
    others: otherTasks.filter((t) => t.category === key),
  })).filter((g) => g.mine.length + g.others.length > 0);

  return (
    <div className="mx-auto max-w-2xl px-5 py-8 sm:px-7">
      <div className="mb-6">
        <h1 className="font-authSerif text-[26px] leading-tight tracking-[-0.03em] text-[#121212]">
          Your onboarding checklist
        </h1>
        <p className="mt-1 text-[13px] text-[#6b6b6b]">
          Start date: {employmentStartDate}
          {runStatus !== 'active' ? (
            <span className="ml-2 rounded-full bg-[#dcfce7] px-2 py-0.5 text-[11px] font-medium text-[#166534]">
              {runStatus === 'completed' ? 'All done!' : runStatus}
            </span>
          ) : null}
        </p>
      </div>

      {msg ? (
        <p className="mb-4 rounded-lg border border-[#fecaca] bg-[#fef2f2] px-3 py-2 text-[13px] text-[#b91c1c]">{msg}</p>
      ) : null}

      {/* Progress */}
      <div className="mb-6 rounded-xl border border-[#d8d8d8] bg-white p-4">
        <div className="flex items-center justify-between text-[13px]">
          <span className="font-medium text-[#121212]">{completedCount} of {tasks.length} tasks done</span>
          <span className="text-[#9b9b9b]">{progress}%</span>
        </div>
        <div className="mt-2 h-1.5 w-full rounded-full bg-[#ececec]">
          <div className="h-1.5 rounded-full bg-[#121212] transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div className="space-y-6">
        {grouped.map((g) => (
          <section key={g.key}>
            <h2 className="mb-2 text-[11.5px] font-semibold uppercase tracking-wide text-[#9b9b9b]">
              {g.label}
            </h2>
            <ul className="space-y-2">
              {/* My tasks first */}
              {g.mine.map((t) => {
                const overdue = t.due_date && t.due_date < today && t.status === 'pending';
                return (
                  <li key={t.id} className="rounded-xl border border-[#d8d8d8] bg-white p-4">
                    <div className="flex items-start gap-3">
                      <button
                        type="button"
                        disabled={!canComplete || !!busy || runStatus !== 'active'}
                        onClick={() => void toggle(t)}
                        className={[
                          'mt-0.5 h-5 w-5 shrink-0 rounded border-2 transition-colors',
                          t.status === 'completed'
                            ? 'border-[#16a34a] bg-[#16a34a]'
                            : 'border-[#d8d8d8] hover:border-[#121212]',
                          !canComplete || !!busy ? 'cursor-not-allowed opacity-50' : '',
                        ].join(' ')}
                        aria-label={t.status === 'completed' ? 'Mark as pending' : 'Mark as done'}
                      >
                        {t.status === 'completed' ? (
                          <svg viewBox="0 0 12 10" className="mx-auto text-white" fill="none" stroke="currentColor" strokeWidth={2.5}>
                            <polyline points="1,5 4,8 11,1" />
                          </svg>
                        ) : null}
                      </button>
                      <div className="flex-1">
                        <p className={['text-[13px] font-medium', t.status === 'completed' ? 'line-through text-[#9b9b9b]' : 'text-[#121212]'].join(' ')}>
                          {t.title}
                        </p>
                        {t.description ? <p className="mt-0.5 text-[12px] text-[#6b6b6b]">{t.description}</p> : null}
                        {t.due_date ? (
                          <p className={['mt-1 text-[11.5px]', overdue ? 'font-medium text-[#b91c1c]' : 'text-[#9b9b9b]'].join(' ')}>
                            Due {t.due_date}{overdue ? ' — overdue' : ''}
                          </p>
                        ) : null}
                      </div>
                    </div>
                  </li>
                );
              })}
              {/* Tasks assigned to others (read-only progress) */}
              {g.others.map((t) => (
                <li key={t.id} className="flex items-center gap-3 rounded-xl border border-[#ececec] bg-[#faf9f6] px-4 py-3">
                  <span className={['h-3.5 w-3.5 shrink-0 rounded-full border-2', t.status === 'completed' ? 'border-[#16a34a] bg-[#16a34a]' : 'border-[#d8d8d8]'].join(' ')} />
                  <span className={['text-[13px]', t.status === 'completed' ? 'text-[#9b9b9b] line-through' : 'text-[#4a4a4a]'].join(' ')}>
                    {t.title}
                  </span>
                  <span className="ml-auto text-[11px] text-[#9b9b9b]">
                    {t.assignee_type === 'manager' ? 'Manager' : 'HR'}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>

      {runStatus === 'completed' ? (
        <div className="mt-8 rounded-xl border border-[#d8d8d8] bg-[#f0fdf4] p-5 text-center">
          <p className="text-[15px] font-semibold text-[#166534]">Onboarding complete</p>
          <p className="mt-1 text-[13px] text-[#4ade80]">All tasks have been completed. Welcome aboard!</p>
        </div>
      ) : null}
    </div>
  );
}
