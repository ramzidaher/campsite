'use client';

import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

type RunTask = {
  id: string;
  title: string;
  description: string | null;
  assignee_type: string;
  category: string;
  due_date: string | null;
  sort_order: number;
  status: string;
  completed_at: string | null;
  completer_name: string | null;
};

const CATEGORY_LABELS: Record<string, string> = {
  documents: 'Documents',
  it_setup: 'IT setup',
  introductions: 'Introductions',
  compliance: 'Compliance',
  other: 'Other',
};

const ASSIGNEE_LABELS: Record<string, string> = {
  employee: 'New hire',
  manager: 'Manager',
  hr: 'HR',
};

function taskStatusBadge(s: string) {
  const base = 'rounded-full px-2 py-0.5 text-[10.5px] font-medium';
  switch (s) {
    case 'completed': return <span className={`${base} bg-[#dcfce7] text-[#166534]`}>Done</span>;
    case 'skipped': return <span className={`${base} bg-[#f5f4f1] text-[#9b9b9b]`}>Skipped</span>;
    default: return <span className={`${base} bg-[#fff7ed] text-[#c2410c]`}>Pending</span>;
  }
}

function initials(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');
}

export function OnboardingRunClient({
  runId,
  run,
  employee,
  tasks,
}: {
  runId: string;
  run: { id: string; user_id: string; status: string; employment_start_date: string; created_at: string };
  employee: { id: string; full_name: string; email: string | null; avatar_url: string | null };
  tasks: RunTask[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  // Add task form
  const [showAdd, setShowAdd] = useState(false);
  const [addTitle, setAddTitle] = useState('');
  const [addDesc, setAddDesc] = useState('');
  const [addAssignee, setAddAssignee] = useState('hr');
  const [addCategory, setAddCategory] = useState('other');
  const [addDue, setAddDue] = useState('');

  async function updateTask(taskId: string, status: string) {
    setBusy(taskId);
    setMsg(null);
    const { error } = await supabase.rpc('onboarding_task_update', { p_task_id: taskId, p_status: status });
    setBusy(null);
    if (error) { setMsg(error.message); return; }
    router.refresh();
  }

  async function cancelRun() {
    if (!confirm('Cancel this onboarding run?')) return;
    setBusy('cancel');
    const { error } = await supabase.rpc('onboarding_run_cancel', { p_run_id: runId });
    setBusy(null);
    if (error) { setMsg(error.message); return; }
    router.push('/hr/onboarding');
  }

  async function addTask(e: React.FormEvent) {
    e.preventDefault();
    if (!addTitle.trim()) return;
    setBusy('add');
    setMsg(null);
    const { error } = await supabase.from('onboarding_run_tasks').insert({
      run_id: runId,
      title: addTitle.trim(),
      description: addDesc.trim() || null,
      assignee_type: addAssignee,
      category: addCategory,
      due_date: addDue || null,
      sort_order: tasks.length,
    });
    setBusy(null);
    if (error) { setMsg(error.message); return; }
    setShowAdd(false);
    setAddTitle(''); setAddDesc(''); setAddAssignee('hr'); setAddCategory('other'); setAddDue('');
    router.refresh();
  }

  const completedCount = tasks.filter((t) => t.status !== 'pending').length;
  const progress = tasks.length > 0 ? Math.round((completedCount / tasks.length) * 100) : 0;

  // Group by category
  const grouped = Object.entries(CATEGORY_LABELS).map(([key, label]) => ({
    key,
    label,
    tasks: tasks.filter((t) => t.category === key),
  })).filter((g) => g.tasks.length > 0);

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:px-7">
      <Link href="/hr/onboarding" className="text-[12.5px] text-[#6b6b6b] underline underline-offset-2 hover:text-[#121212]">
        ← Onboarding
      </Link>

      {/* Header */}
      <div className="mt-4 flex items-start gap-4">
        {employee.avatar_url ? (
          <img src={employee.avatar_url} alt="" className="h-12 w-12 shrink-0 rounded-full object-cover" />
        ) : (
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[#e8e4dc] text-[14px] font-bold text-[#6b6b6b]">
            {initials(employee.full_name)}
          </div>
        )}
        <div className="flex-1">
          <h1 className="font-authSerif text-[24px] leading-tight tracking-[-0.03em] text-[#121212]">
            {employee.full_name}
          </h1>
          <p className="text-[13px] text-[#6b6b6b]">
            Starts {run.employment_start_date}
            {run.status !== 'active' ? (
              <span className="ml-2 rounded-full bg-[#f5f4f1] px-2 py-0.5 text-[11px] font-medium capitalize text-[#6b6b6b]">{run.status}</span>
            ) : null}
          </p>
        </div>
        {run.status === 'active' ? (
          <button type="button" onClick={() => void cancelRun()} disabled={busy === 'cancel'} className="rounded-lg border border-[#d8d8d8] bg-white px-3 py-1.5 text-[12px] text-[#b91c1c] hover:bg-[#fef2f2] disabled:opacity-50">
            Cancel run
          </button>
        ) : null}
      </div>

      {msg ? <p className="mt-4 rounded-lg border border-[#fecaca] bg-[#fef2f2] px-3 py-2 text-[13px] text-[#b91c1c]">{msg}</p> : null}

      {/* Progress */}
      <div className="mt-5 rounded-xl border border-[#d8d8d8] bg-white p-4">
        <div className="flex items-center justify-between text-[13px]">
          <span className="font-medium text-[#121212]">{completedCount} of {tasks.length} tasks done</span>
          <span className="text-[#9b9b9b]">{progress}%</span>
        </div>
        <div className="mt-2 h-1.5 w-full rounded-full bg-[#ececec]">
          <div
            className="h-1.5 rounded-full bg-[#121212] transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Tasks grouped by category */}
      <div className="mt-6 space-y-6">
        {grouped.map((g) => (
          <section key={g.key}>
            <h2 className="mb-2 text-[11.5px] font-semibold uppercase tracking-wide text-[#9b9b9b]">
              {g.label}
            </h2>
            <ul className="space-y-2">
              {g.tasks.map((t) => {
                const overdue = t.due_date && t.due_date < today && t.status === 'pending';
                return (
                  <li key={t.id} className="rounded-xl border border-[#d8d8d8] bg-white p-4">
                    <div className="flex items-start gap-3">
                      <button
                        type="button"
                        disabled={!!busy || run.status !== 'active'}
                        onClick={() => void updateTask(t.id, t.status === 'completed' ? 'pending' : 'completed')}
                        className={[
                          'mt-0.5 h-5 w-5 shrink-0 rounded border-2 transition-colors',
                          t.status === 'completed'
                            ? 'border-[#16a34a] bg-[#16a34a]'
                            : 'border-[#d8d8d8] hover:border-[#121212]',
                          busy ? 'cursor-not-allowed opacity-50' : '',
                        ].join(' ')}
                        aria-label={t.status === 'completed' ? 'Mark pending' : 'Mark complete'}
                      >
                        {t.status === 'completed' ? (
                          <svg viewBox="0 0 12 10" className="mx-auto text-white" fill="none" stroke="currentColor" strokeWidth={2.5}>
                            <polyline points="1,5 4,8 11,1" />
                          </svg>
                        ) : null}
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={['text-[13px] font-medium', t.status === 'completed' ? 'line-through text-[#9b9b9b]' : 'text-[#121212]'].join(' ')}>
                            {t.title}
                          </span>
                          {taskStatusBadge(t.status)}
                          <span className="rounded-full bg-[#f5f4f1] px-2 py-0.5 text-[10.5px] text-[#6b6b6b]">
                            {ASSIGNEE_LABELS[t.assignee_type] ?? t.assignee_type}
                          </span>
                        </div>
                        {t.description ? <p className="mt-0.5 text-[12px] text-[#6b6b6b]">{t.description}</p> : null}
                        <div className="mt-1 flex flex-wrap gap-3 text-[11.5px]">
                          {t.due_date ? (
                            <span className={overdue ? 'font-medium text-[#b91c1c]' : 'text-[#9b9b9b]'}>
                              Due {t.due_date}{overdue ? ' (overdue)' : ''}
                            </span>
                          ) : null}
                          {t.completed_at && t.completer_name ? (
                            <span className="text-[#9b9b9b]">
                              Done by {t.completer_name} on {new Date(t.completed_at).toLocaleDateString()}
                            </span>
                          ) : null}
                        </div>
                      </div>
                      {run.status === 'active' && t.status !== 'skipped' ? (
                        <button
                          type="button"
                          disabled={!!busy}
                          onClick={() => void updateTask(t.id, 'skipped')}
                          className="shrink-0 text-[11px] text-[#9b9b9b] hover:text-[#4a4a4a] disabled:opacity-50"
                        >
                          Skip
                        </button>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>

      {/* Add task */}
      {run.status === 'active' ? (
        <div className="mt-6">
          {!showAdd ? (
            <button
              type="button"
              onClick={() => setShowAdd(true)}
              className="text-[13px] text-[#6b6b6b] underline underline-offset-2 hover:text-[#121212]"
            >
              + Add task to this run
            </button>
          ) : (
            <form className="rounded-xl border border-[#d8d8d8] bg-white p-5" onSubmit={(e) => void addTask(e)}>
              <h3 className="text-[14px] font-semibold text-[#121212]">Add task</h3>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="block text-[12.5px] font-medium text-[#6b6b6b] sm:col-span-2">
                  Title
                  <input type="text" required value={addTitle} onChange={(e) => setAddTitle(e.target.value)} className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2 text-[13px]" />
                </label>
                <label className="block text-[12.5px] font-medium text-[#6b6b6b]">
                  Assignee
                  <select value={addAssignee} onChange={(e) => setAddAssignee(e.target.value)} className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2 text-[13px]">
                    <option value="hr">HR</option>
                    <option value="manager">Manager</option>
                    <option value="employee">New hire</option>
                  </select>
                </label>
                <label className="block text-[12.5px] font-medium text-[#6b6b6b]">
                  Category
                  <select value={addCategory} onChange={(e) => setAddCategory(e.target.value)} className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2 text-[13px]">
                    {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </label>
                <label className="block text-[12.5px] font-medium text-[#6b6b6b]">
                  Due date (optional)
                  <input type="date" value={addDue} onChange={(e) => setAddDue(e.target.value)} className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2 text-[13px]" />
                </label>
              </div>
              <div className="mt-4 flex gap-2">
                <button type="submit" disabled={busy === 'add'} className="rounded-lg bg-[#121212] px-4 py-2 text-[13px] font-medium text-[#faf9f6] disabled:opacity-50">{busy === 'add' ? 'Adding…' : 'Add task'}</button>
                <button type="button" onClick={() => setShowAdd(false)} className="rounded-lg border border-[#d8d8d8] bg-white px-4 py-2 text-[13px] font-medium text-[#6b6b6b] hover:bg-[#f5f4f1]">Cancel</button>
              </div>
            </form>
          )}
        </div>
      ) : null}
    </div>
  );
}
