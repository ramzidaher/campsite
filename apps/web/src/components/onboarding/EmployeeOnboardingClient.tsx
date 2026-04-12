'use client';

import { createClient } from '@/lib/supabase/client';
import { useCampfireAmbientPreferences } from '@/lib/sound/useCampfireAmbientPreferences';
import { useUiSound } from '@/lib/sound/useUiSound';
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
  other: 'Other tasks',
};

const ASSIGNEE_LABELS: Record<string, string> = {
  manager: 'Your manager',
  hr: 'HR team',
  employee: 'You',
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

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
  const playUiSound = useUiSound();
  const { prefs: campfirePrefs, setEnabled: setCampfireEnabled } = useCampfireAmbientPreferences();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const myTasks = tasks.filter((t) => t.assignee_type === 'employee');
  const otherTasks = tasks.filter((t) => t.assignee_type !== 'employee');
  const today = new Date().toISOString().slice(0, 10);

  const myDone = myTasks.filter((t) => t.status !== 'pending').length;
  const totalDone = tasks.filter((t) => t.status !== 'pending').length;
  const progress = tasks.length > 0 ? Math.round((totalDone / tasks.length) * 100) : 0;
  const myProgress = myTasks.length > 0 ? Math.round((myDone / myTasks.length) * 100) : 0;

  const overdueMyTasks = myTasks.filter(
    (t) => t.due_date && t.due_date < today && t.status === 'pending',
  );

  async function toggle(task: Task) {
    if (!canComplete || task.assignee_type !== 'employee') return;
    setBusy(task.id);
    setMsg(null);
    const next = task.status === 'completed' ? 'pending' : 'completed';
    const { error } = await supabase.rpc('onboarding_task_update', {
      p_task_id: task.id,
      p_status: next,
    });
    setBusy(null);
    if (error) { setMsg(error.message); return; }
    playUiSound(next === 'completed' ? 'checkbox_check' : 'checkbox_uncheck');
    router.refresh();
  }

  const grouped = Object.entries(CATEGORY_LABELS)
    .map(([key, label]) => ({
      key,
      label,
      mine: myTasks.filter((t) => t.category === key),
      others: otherTasks.filter((t) => t.category === key),
    }))
    .filter((g) => g.mine.length + g.others.length > 0);

  if (runStatus === 'completed') {
    return (
      <div className="mx-auto max-w-2xl px-5 py-8 sm:px-7">
        <div className="py-12 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#dcfce7]">
            <svg viewBox="0 0 24 24" className="h-8 w-8 text-[#16a34a]" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h1 className="font-authSerif text-[26px] leading-tight tracking-[-0.03em] text-[#121212]">
            Onboarding complete
          </h1>
          <p className="mt-2 text-[14px] text-[#6b6b6b]">
            All tasks are done. You&apos;re all set — welcome to the team!
          </p>
          <p className="mt-1 text-[12px] text-[#9b9b9b]">Started {fmtDate(employmentStartDate)}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-5 py-8 sm:px-7">
      <div className="mb-6">
        <h1 className="font-authSerif text-[26px] leading-tight tracking-[-0.03em] text-[#121212]">
          Getting started
        </h1>
        <p className="mt-1 text-[13px] text-[#6b6b6b]">
          Your onboarding checklist · Start date: {fmtDate(employmentStartDate)}
        </p>
      </div>

      {msg ? (
        <p className="mb-4 rounded-lg border border-[#fecaca] bg-[#fef2f2] px-3 py-2 text-[13px] text-[#b91c1c]">{msg}</p>
      ) : null}

      {overdueMyTasks.length > 0 ? (
        <div className="mb-4 rounded-xl border border-[#fecaca] bg-[#fef2f2] p-4">
          <p className="text-[13px] font-semibold text-[#b91c1c]">
            {overdueMyTasks.length} task{overdueMyTasks.length === 1 ? ' is' : 's are'} overdue
          </p>
          <p className="mt-0.5 text-[12px] text-[#b91c1c]">
            {overdueMyTasks.map((t) => t.title).join(', ')}
          </p>
        </div>
      ) : null}

      {/* Progress hero */}
      <div className="mb-6 rounded-2xl border border-[#e8e8e8] bg-white p-5">
        <div className="mb-4 grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-[22px] font-bold text-[#121212]">{myProgress}%</p>
            <p className="text-[11.5px] text-[#6b6b6b]">Your tasks</p>
          </div>
          <div>
            <p className="text-[22px] font-bold text-[#121212]">{myDone}/{myTasks.length}</p>
            <p className="text-[11.5px] text-[#6b6b6b]">Tasks done</p>
          </div>
          <div>
            <p className="text-[22px] font-bold text-[#121212]">{progress}%</p>
            <p className="text-[11.5px] text-[#6b6b6b]">Overall</p>
          </div>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-[#ececec]">
          <div
            className="h-2 rounded-full bg-[#121212] transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
        {otherTasks.length > 0 ? (
          <p className="mt-2.5 text-[11.5px] text-[#9b9b9b]">
            {otherTasks.filter((t) => t.status !== 'pending').length} of {otherTasks.length} tasks for your manager/HR also completed
          </p>
        ) : null}
      </div>

      <div className="mb-6 rounded-xl border border-[#e8e8e8] bg-[#faf9f6] p-4">
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            data-no-checkbox-sound
            checked={campfirePrefs.enabled}
            onChange={(e) => {
              const enabled = e.target.checked;
              setCampfireEnabled(enabled);
              playUiSound(enabled ? 'toggle_on' : 'toggle_off');
            }}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-[#d8d8d8] text-[#121212]"
          />
          <span className="text-[13px] leading-snug text-[#121212]">
            <span className="font-medium">Campfire on the home dashboard</span>
            <span className="mt-0.5 block text-[12.5px] text-[#6b6b6b]">
              Optional ambience on Dashboard — you can change this anytime in Settings → Notifications.
            </span>
          </span>
        </label>
      </div>

      <div className="space-y-8">
        {grouped.map((g) => (
          <section key={g.key}>
            <h2 className="mb-3 text-[11.5px] font-semibold uppercase tracking-wide text-[#9b9b9b]">
              {g.label}
            </h2>
            <ul className="space-y-2">
              {/* My tasks */}
              {g.mine.map((t) => {
                const overdue = t.due_date && t.due_date < today && t.status === 'pending';
                const isDone = t.status === 'completed';
                return (
                  <li
                    key={t.id}
                    className={`rounded-xl border p-4 transition-colors ${isDone ? 'border-[#e8e8e8] bg-[#faf9f6]' : overdue ? 'border-[#fca5a5] bg-white' : 'border-[#e8e8e8] bg-white'}`}
                  >
                    <div className="flex items-start gap-3">
                      <button
                        type="button"
                        disabled={!canComplete || !!busy || runStatus !== 'active'}
                        onClick={() => void toggle(t)}
                        className={[
                          'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition-colors',
                          isDone
                            ? 'border-[#16a34a] bg-[#16a34a]'
                            : 'border-[#d8d8d8] hover:border-[#121212]',
                          (!canComplete || !!busy) ? 'cursor-not-allowed opacity-40' : 'cursor-pointer',
                        ].join(' ')}
                        aria-label={isDone ? 'Mark as not done' : 'Mark as done'}
                      >
                        {isDone ? (
                          <svg viewBox="0 0 12 10" className="text-white" fill="none" stroke="currentColor" strokeWidth={2.5}>
                            <polyline points="1,5 4,8 11,1" />
                          </svg>
                        ) : null}
                      </button>
                      <div className="flex-1 min-w-0">
                        <p className={`text-[13px] font-medium ${isDone ? 'line-through text-[#9b9b9b]' : overdue ? 'text-[#b91c1c]' : 'text-[#121212]'}`}>
                          {t.title}
                        </p>
                        {t.description ? (
                          <p className="mt-0.5 text-[12px] text-[#6b6b6b]">{t.description}</p>
                        ) : null}
                        {t.due_date && !isDone ? (
                          <p className={`mt-1 text-[11.5px] ${overdue ? 'font-medium text-[#b91c1c]' : 'text-[#9b9b9b]'}`}>
                            {overdue ? `Overdue since ${fmtDate(t.due_date)}` : `Due ${fmtDate(t.due_date)}`}
                          </p>
                        ) : null}
                        {isDone && t.completed_at ? (
                          <p className="mt-1 text-[11.5px] text-[#9b9b9b]">Done {fmtDate(t.completed_at)}</p>
                        ) : null}
                      </div>
                    </div>
                  </li>
                );
              })}

              {/* Tasks for others (read-only) */}
              {g.others.map((t) => {
                const isDone = t.status === 'completed';
                return (
                  <li
                    key={t.id}
                    className="flex items-center gap-3 rounded-xl border border-[#e8e8e8] bg-[#faf9f6] px-4 py-3"
                  >
                    <span
                      className={`h-3.5 w-3.5 shrink-0 rounded-full border-2 ${isDone ? 'border-[#16a34a] bg-[#16a34a]' : 'border-[#d8d8d8]'}`}
                    />
                    <span className={`flex-1 text-[13px] ${isDone ? 'text-[#9b9b9b] line-through' : 'text-[#4a4a4a]'}`}>
                      {t.title}
                    </span>
                    <span className="ml-auto shrink-0 rounded-full bg-[#ececec] px-2 py-0.5 text-[10.5px] text-[#6b6b6b]">
                      {ASSIGNEE_LABELS[t.assignee_type] ?? t.assignee_type}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
