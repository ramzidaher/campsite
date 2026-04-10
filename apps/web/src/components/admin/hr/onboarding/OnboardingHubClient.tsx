'use client';

import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

const MIN_PENDING_MS = 450;

async function withMinimumDelay<T>(promise: PromiseLike<T>) {
  const [result] = await Promise.all([
    promise,
    new Promise((resolve) => setTimeout(resolve, MIN_PENDING_MS)),
  ]);
  return result;
}

type Template = {
  id: string;
  name: string;
  description: string | null;
  is_default: boolean;
  is_archived: boolean;
  created_at: string;
};

type Run = {
  id: string;
  user_id: string;
  display_name: string;
  email: string | null;
  status: string;
  employment_start_date: string;
  created_at: string;
  template_name: string;
};

type Member = { id: string; display_name: string; email: string | null };
type TemplateTask = {
  id: string;
  template_id: string;
  title: string;
  category: string;
  assignee_type: string;
  due_offset_days: number;
  sort_order: number;
};

function statusBadge(s: string) {
  const base = 'rounded-full px-2 py-0.5 text-[11px] font-medium';
  switch (s) {
    case 'active': return <span className={`${base} bg-[#dcfce7] text-[#166534]`}>Active</span>;
    case 'completed': return <span className={`${base} bg-[#f5f4f1] text-[#6b6b6b]`}>Completed</span>;
    case 'cancelled': return <span className={`${base} bg-[#fef2f2] text-[#b91c1c]`}>Cancelled</span>;
    default: return <span className={`${base} bg-[#f5f4f1] text-[#9b9b9b]`}>{s}</span>;
  }
}

export function OnboardingHubClient({
  orgId: _orgId,
  canTemplates,
  canRuns,
  canManageRuns,
  templates,
  runs,
  members,
  selectedTemplateId,
  selectedTemplateTasks,
}: {
  orgId: string;
  canTemplates: boolean;
  canRuns: boolean;
  canManageRuns: boolean;
  templates: Template[];
  runs: Run[];
  members: Member[];
  selectedTemplateId: string | null;
  selectedTemplateTasks: TemplateTask[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const [tab, setTab] = useState<'runs' | 'templates'>(canRuns ? 'runs' : 'templates');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Start run form
  const [showStartForm, setShowStartForm] = useState(false);
  const [startUserId, setStartUserId] = useState(members[0]?.id ?? '');
  const [startTemplateId, setStartTemplateId] = useState(templates.find((t) => t.is_default && !t.is_archived)?.id ?? templates[0]?.id ?? '');
  const [startDate, setStartDate] = useState('');

  // Template form
  const [showTemplateForm, setShowTemplateForm] = useState(false);
  const [tplName, setTplName] = useState('');
  const [tplDesc, setTplDesc] = useState('');
  const [tplDefault, setTplDefault] = useState(false);
  const [taskBusy, setTaskBusy] = useState(false);
  const [taskMsg, setTaskMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [editTaskId, setEditTaskId] = useState<string | null>(null);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskCategory, setTaskCategory] = useState('other');
  const [taskAssignee, setTaskAssignee] = useState('hr');
  const [taskDueOffset, setTaskDueOffset] = useState('1');

  async function startRun(e: React.FormEvent) {
    e.preventDefault();
    if (!startUserId || !startTemplateId || !startDate) return;
    setBusy(true);
    setMsg(null);
    const { data: runId, error } = await withMinimumDelay(
      supabase.rpc('onboarding_run_start', {
        p_user_id: startUserId,
        p_template_id: startTemplateId,
        p_employment_start_date: startDate,
        p_offer_id: null,
      })
    );
    setBusy(false);
    if (error) {
      setMsg({ type: 'error', text: error.message });
      return;
    }
    setShowStartForm(false);
    setMsg({ type: 'success', text: 'Onboarding run started.' });
    router.push(`/hr/onboarding/${runId as string}`);
  }

  async function createTemplate(e: React.FormEvent) {
    e.preventDefault();
    if (!tplName.trim()) return;
    setBusy(true);
    setMsg(null);
    const { error } = await withMinimumDelay(
      supabase.from('onboarding_templates').insert({
        name: tplName.trim(),
        description: tplDesc.trim() || null,
        is_default: tplDefault,
      })
    );
    setBusy(false);
    if (error) {
      setMsg({ type: 'error', text: error.message });
      return;
    }
    setShowTemplateForm(false);
    setTplName(''); setTplDesc(''); setTplDefault(false);
    setMsg({ type: 'success', text: 'Template created.' });
    router.refresh();
  }

  const activeRuns = runs.filter((r) => r.status === 'active');
  const pastRuns = runs.filter((r) => r.status !== 'active');
  const activeTemplates = templates.filter((t) => !t.is_archived);
  const currentTemplateId = selectedTemplateId && activeTemplates.some((t) => t.id === selectedTemplateId)
    ? selectedTemplateId
    : null;

  async function upsertTask(e: React.FormEvent) {
    e.preventDefault();
    if (!currentTemplateId || !taskTitle.trim()) return;
    setTaskBusy(true);
    setTaskMsg(null);
    const { error } = await withMinimumDelay(
      supabase.rpc('onboarding_template_task_upsert', {
        p_template_id: currentTemplateId,
        p_title: taskTitle.trim(),
        p_category: taskCategory,
        p_assignee_type: taskAssignee,
        p_due_offset_days: Math.max(0, Number(taskDueOffset || '0')),
        p_task_id: editTaskId,
      })
    );
    setTaskBusy(false);
    if (error) {
      setTaskMsg({ type: 'error', text: error.message });
      return;
    }
    setEditTaskId(null);
    setTaskTitle('');
    setTaskCategory('other');
    setTaskAssignee('hr');
    setTaskDueOffset('1');
    setTaskMsg({ type: 'success', text: editTaskId ? 'Task updated.' : 'Task added.' });
    router.refresh();
  }

  function startEditTask(task: TemplateTask) {
    setEditTaskId(task.id);
    setTaskTitle(task.title);
    setTaskCategory(task.category);
    setTaskAssignee(task.assignee_type);
    setTaskDueOffset(String(task.due_offset_days));
    setTaskMsg(null);
  }

  async function deleteTask(taskId: string) {
    setTaskBusy(true);
    setTaskMsg(null);
    const { error } = await withMinimumDelay(
      supabase.rpc('onboarding_template_task_delete', { p_task_id: taskId })
    );
    setTaskBusy(false);
    if (error) {
      setTaskMsg({ type: 'error', text: error.message });
      return;
    }
    if (editTaskId === taskId) {
      setEditTaskId(null);
      setTaskTitle('');
      setTaskCategory('other');
      setTaskAssignee('hr');
      setTaskDueOffset('1');
    }
    setTaskMsg({ type: 'success', text: 'Task deleted.' });
    router.refresh();
  }

  async function moveTask(task: TemplateTask, direction: -1 | 1) {
    const sorted = [...selectedTemplateTasks].sort((a, b) => a.sort_order - b.sort_order);
    const idx = sorted.findIndex((t) => t.id === task.id);
    if (idx < 0) return;
    const other = sorted[idx + direction];
    if (!other || !currentTemplateId) return;

    setTaskBusy(true);
    setTaskMsg(null);
    const first = await withMinimumDelay(
      supabase.rpc('onboarding_template_task_upsert', {
        p_template_id: currentTemplateId,
        p_title: task.title,
        p_category: task.category,
        p_assignee_type: task.assignee_type,
        p_due_offset_days: task.due_offset_days,
        p_sort_order: other.sort_order,
        p_task_id: task.id,
      })
    );
    const second = await supabase.rpc('onboarding_template_task_upsert', {
      p_template_id: currentTemplateId,
      p_title: other.title,
      p_category: other.category,
      p_assignee_type: other.assignee_type,
      p_due_offset_days: other.due_offset_days,
      p_sort_order: task.sort_order,
      p_task_id: other.id,
    });
    setTaskBusy(false);
    if (first.error || second.error) {
      setTaskMsg({ type: 'error', text: first.error?.message ?? second.error?.message ?? 'Could not reorder tasks' });
      return;
    }
    setTaskMsg({ type: 'success', text: 'Task order updated.' });
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-4xl px-5 py-8 sm:px-7">
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-authSerif text-[26px] leading-tight tracking-[-0.03em] text-[#121212]">Onboarding</h1>
          <p className="mt-1 text-[13px] text-[#6b6b6b]">
            Start onboarding checklists for new hires and manage reusable templates.
          </p>
        </div>
        <div className="flex gap-2">
          {canTemplates && (
            <button
              type="button"
              onClick={() => setShowTemplateForm(true)}
              className="inline-flex h-9 items-center rounded-lg border border-[#d8d8d8] bg-white px-3 text-[12.5px] font-medium text-[#6b6b6b] hover:bg-[#f5f4f1]"
            >
              New template
            </button>
          )}
          {canManageRuns && activeTemplates.length > 0 && (
            <button
              type="button"
              onClick={() => setShowStartForm(true)}
              className="inline-flex h-9 items-center rounded-lg bg-[#121212] px-3 text-[12.5px] font-medium text-[#faf9f6] hover:bg-[#2a2a2a]"
            >
              Start onboarding
            </button>
          )}
        </div>
      </div>

      {msg ? (
        <p
          className={[
            'mb-4 rounded-lg px-3 py-2 text-[13px]',
            msg.type === 'error'
              ? 'border border-[#fecaca] bg-[#fef2f2] text-[#b91c1c]'
              : 'border border-[#86efac] bg-[#f0fdf4] text-[#166534]',
          ].join(' ')}
        >
          {msg.text}
        </p>
      ) : null}

      {/* Start run form */}
      {showStartForm && canManageRuns ? (
        <div className="mb-6 rounded-2xl border border-[#e8e8e8] bg-white p-5">
          <h2 className="text-[15px] font-semibold text-[#121212]">Start onboarding run</h2>
          <form className="mt-4 grid gap-4 sm:grid-cols-3" onSubmit={(e) => void startRun(e)}>
            <label className="block text-[12.5px] font-medium text-[#6b6b6b]">
              Employee
              <select
                className="mt-1 w-full rounded-xl border border-[#e8e8e8] bg-[#faf9f6] px-3 py-2 text-[13px] focus:border-[#121212] focus:outline-none"
                value={startUserId}
                onChange={(e) => setStartUserId(e.target.value)}
                required
              >
                {members.map((m) => (
                  <option key={m.id} value={m.id}>{m.display_name}</option>
                ))}
              </select>
            </label>
            <label className="block text-[12.5px] font-medium text-[#6b6b6b]">
              Template
              <select
                className="mt-1 w-full rounded-xl border border-[#e8e8e8] bg-[#faf9f6] px-3 py-2 text-[13px] focus:border-[#121212] focus:outline-none"
                value={startTemplateId}
                onChange={(e) => setStartTemplateId(e.target.value)}
                required
              >
                {activeTemplates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}{t.is_default ? ' (default)' : ''}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-[12.5px] font-medium text-[#6b6b6b]">
              Employment start date
              <input
                type="date"
                required
                className="mt-1 w-full rounded-xl border border-[#e8e8e8] bg-[#faf9f6] px-3 py-2 text-[13px] focus:border-[#121212] focus:outline-none"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </label>
            <div className="flex gap-2 sm:col-span-3">
              <button type="submit" disabled={busy} className="rounded-lg bg-[#121212] px-4 py-2 text-[13px] font-medium text-white disabled:opacity-50">
                {busy ? 'Starting…' : 'Start'}
              </button>
              <button type="button" disabled={busy} onClick={() => setShowStartForm(false)} className="rounded-lg border border-[#e8e8e8] bg-white px-4 py-2 text-[13px] font-medium text-[#6b6b6b] hover:bg-[#faf9f6] disabled:opacity-50">
                Cancel
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {/* Create template form */}
      {showTemplateForm ? (
        <div className="mb-6 rounded-2xl border border-[#e8e8e8] bg-white p-5">
          <h2 className="text-[15px] font-semibold text-[#121212]">New template</h2>
          <form className="mt-4 space-y-3" onSubmit={(e) => void createTemplate(e)}>
            <label className="block text-[12.5px] font-medium text-[#6b6b6b]">
              Name
              <input type="text" required value={tplName} onChange={(e) => setTplName(e.target.value)} className="mt-1 w-full rounded-xl border border-[#e8e8e8] bg-[#faf9f6] px-3 py-2 text-[13px] focus:border-[#121212] focus:outline-none" placeholder="e.g. Standard Onboarding" />
            </label>
            <label className="block text-[12.5px] font-medium text-[#6b6b6b]">
              Description (optional)
              <input type="text" value={tplDesc} onChange={(e) => setTplDesc(e.target.value)} className="mt-1 w-full rounded-xl border border-[#e8e8e8] bg-[#faf9f6] px-3 py-2 text-[13px] focus:border-[#121212] focus:outline-none" />
            </label>
            <label className="flex items-center gap-2 text-[13px] text-[#4a4a4a]">
              <input type="checkbox" checked={tplDefault} onChange={(e) => setTplDefault(e.target.checked)} />
              Set as default template
            </label>
            <div className="flex gap-2">
              <button type="submit" disabled={busy} className="rounded-lg bg-[#121212] px-4 py-2 text-[13px] font-medium text-white disabled:opacity-50">{busy ? 'Creating…' : 'Create'}</button>
              <button type="button" disabled={busy} onClick={() => setShowTemplateForm(false)} className="rounded-lg border border-[#e8e8e8] bg-white px-4 py-2 text-[13px] font-medium text-[#6b6b6b] hover:bg-[#faf9f6] disabled:opacity-50">Cancel</button>
            </div>
          </form>
        </div>
      ) : null}

      {/* Tabs */}
      <div className="mb-4 flex border-b border-[#ececec]">
        {canRuns && (
          <button type="button" onClick={() => setTab('runs')} className={['px-4 py-2 text-[13px] font-medium border-b-2 -mb-px transition-colors', tab === 'runs' ? 'border-[#121212] text-[#121212]' : 'border-transparent text-[#9b9b9b] hover:text-[#4a4a4a]'].join(' ')}>
            Runs {activeRuns.length > 0 ? <span className="ml-1 rounded-full bg-[#dcfce7] px-1.5 py-0.5 text-[10px] font-bold text-[#166534]">{activeRuns.length}</span> : null}
          </button>
        )}
        {canTemplates && (
          <button type="button" onClick={() => setTab('templates')} className={['px-4 py-2 text-[13px] font-medium border-b-2 -mb-px transition-colors', tab === 'templates' ? 'border-[#121212] text-[#121212]' : 'border-transparent text-[#9b9b9b] hover:text-[#4a4a4a]'].join(' ')}>
            Templates ({activeTemplates.length})
          </button>
        )}
      </div>

      {/* Runs tab */}
      {tab === 'runs' && canRuns ? (
        <div className="space-y-6">
          {activeRuns.length > 0 ? (
            <section>
              <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-[#9b9b9b]">Active</h2>
              <ul className="space-y-2">
                {activeRuns.map((r) => (
                  <li key={r.id}>
                    <Link href={`/hr/onboarding/${r.id}`} className="flex items-center justify-between rounded-xl border border-[#e8e8e8] bg-white p-4 hover:bg-[#faf9f6] transition-colors">
                      <div>
                        <p className="font-medium text-[#121212]">{r.display_name}</p>
                        <p className="text-[12px] text-[#9b9b9b]">
                          {r.template_name} · starts {r.employment_start_date}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        {statusBadge(r.status)}
                        <span className="text-[12px] text-[#9b9b9b]">Open →</span>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : (
            <div className="rounded-2xl border border-[#e8e8e8] bg-white px-4 py-8 text-center">
              <p className="text-[14px] font-medium text-[#121212]">No active onboarding runs</p>
              <p className="mt-1 text-[13px] text-[#9b9b9b]">Use &ldquo;Start onboarding&rdquo; to begin one.</p>
            </div>
          )}
          {pastRuns.length > 0 ? (
            <section>
              <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-[#9b9b9b]">Past</h2>
              <ul className="space-y-2">
                {pastRuns.map((r) => (
                  <li key={r.id}>
                    <Link href={`/hr/onboarding/${r.id}`} className="flex items-center justify-between rounded-xl border border-[#e8e8e8] bg-[#faf9f6] p-4 hover:bg-[#f0efe9] transition-colors">
                      <div>
                        <p className="text-[13px] font-medium text-[#4a4a4a]">{r.display_name}</p>
                        <p className="text-[12px] text-[#9b9b9b]">{r.template_name} · started {new Date(r.created_at).toLocaleDateString()}</p>
                      </div>
                      {statusBadge(r.status)}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      ) : null}

      {/* Templates tab */}
      {tab === 'templates' && canTemplates ? (
        <div className="space-y-4">
          {activeTemplates.length === 0 ? (
            <div className="rounded-2xl border border-[#e8e8e8] bg-white px-4 py-8 text-center">
              <p className="text-[14px] font-medium text-[#121212]">No templates yet</p>
              <p className="mt-1 text-[13px] text-[#9b9b9b]">Create a template to get started.</p>
            </div>
          ) : (
            <ul className="space-y-2">
              {activeTemplates.map((t) => (
                <li key={t.id}>
                  <Link href={`/hr/onboarding?template=${t.id}`} className={['flex items-center justify-between rounded-xl border bg-white p-4 hover:bg-[#faf9f6] transition-colors', currentTemplateId === t.id ? 'border-[#121212]' : 'border-[#e8e8e8]'].join(' ')}>
                    <div>
                      <p className="font-medium text-[#121212]">
                        {t.name}
                        {t.is_default ? (
                          <span className="ml-2 rounded-full bg-[#fff7ed] px-2 py-0.5 text-[10px] font-semibold text-[#c2410c]">Default</span>
                        ) : null}
                      </p>
                      {t.description ? <p className="text-[12px] text-[#9b9b9b]">{t.description}</p> : null}
                    </div>
                    <span className="text-[12px] text-[#9b9b9b]">Manage tasks →</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {currentTemplateId ? (
            <section className="rounded-2xl border border-[#e8e8e8] bg-white p-5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-[15px] font-semibold text-[#121212]">Template tasks</h2>
                <span className="text-[12px] text-[#9b9b9b]">{selectedTemplateTasks.length} task(s)</span>
              </div>
              {taskMsg ? (
                <p
                  className={[
                    'mt-3 rounded-lg px-3 py-2 text-[13px]',
                    taskMsg.type === 'error'
                      ? 'border border-[#fecaca] bg-[#fef2f2] text-[#b91c1c]'
                      : 'border border-[#86efac] bg-[#f0fdf4] text-[#166534]',
                  ].join(' ')}
                >
                  {taskMsg.text}
                </p>
              ) : null}
              <form className="mt-4 grid gap-3 sm:grid-cols-4" onSubmit={(e) => void upsertTask(e)}>
                <label className="block text-[12px] font-medium text-[#6b6b6b] sm:col-span-2">
                  Title
                  <input value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} required className="mt-1 w-full rounded-lg border border-[#e8e8e8] bg-[#faf9f6] px-3 py-2 text-[13px] focus:border-[#121212] focus:outline-none" />
                </label>
                <label className="block text-[12px] font-medium text-[#6b6b6b]">
                  Category
                  <select value={taskCategory} onChange={(e) => setTaskCategory(e.target.value)} className="mt-1 w-full rounded-lg border border-[#e8e8e8] bg-[#faf9f6] px-3 py-2 text-[13px] focus:border-[#121212] focus:outline-none">
                    <option value="documents">Documents</option>
                    <option value="it_setup">IT setup</option>
                    <option value="introductions">Introductions</option>
                    <option value="compliance">Compliance</option>
                    <option value="other">Other</option>
                  </select>
                </label>
                <label className="block text-[12px] font-medium text-[#6b6b6b]">
                  Assignee
                  <select value={taskAssignee} onChange={(e) => setTaskAssignee(e.target.value)} className="mt-1 w-full rounded-lg border border-[#e8e8e8] bg-[#faf9f6] px-3 py-2 text-[13px] focus:border-[#121212] focus:outline-none">
                    <option value="employee">Employee</option>
                    <option value="manager">Manager</option>
                    <option value="hr">HR</option>
                  </select>
                </label>
                <label className="block text-[12px] font-medium text-[#6b6b6b]">
                  Due offset days
                  <input type="number" min={0} value={taskDueOffset} onChange={(e) => setTaskDueOffset(e.target.value)} className="mt-1 w-full rounded-lg border border-[#e8e8e8] bg-[#faf9f6] px-3 py-2 text-[13px] focus:border-[#121212] focus:outline-none" />
                </label>
                <div className="flex items-end gap-2 sm:col-span-3">
                  <button type="submit" disabled={taskBusy} className="rounded-lg bg-[#121212] px-3 py-2 text-[13px] font-medium text-white disabled:opacity-50">
                    {editTaskId ? 'Update task' : 'Add task'}
                  </button>
                  {editTaskId ? (
                    <button type="button" className="rounded-lg border border-[#e8e8e8] bg-white px-3 py-2 text-[13px] text-[#6b6b6b]" onClick={() => {
                      setEditTaskId(null);
                      setTaskTitle('');
                      setTaskCategory('other');
                      setTaskAssignee('hr');
                      setTaskDueOffset('1');
                    }}>
                      Cancel edit
                    </button>
                  ) : null}
                </div>
              </form>

              <ul className="mt-4 space-y-2">
                {[...selectedTemplateTasks].sort((a, b) => a.sort_order - b.sort_order).map((task, idx, arr) => (
                  <li key={task.id} className="flex items-center justify-between gap-3 rounded-lg border border-[#ececec] bg-[#faf9f6] p-3">
                    <div>
                      <p className="text-[13px] font-medium text-[#121212]">{task.title}</p>
                      <p className="text-[12px] text-[#6b6b6b]">
                        {task.category} · {task.assignee_type} · due +{task.due_offset_days}d
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button type="button" disabled={taskBusy || idx === 0} onClick={() => void moveTask(task, -1)} className="rounded border border-[#d8d8d8] px-2 py-1 text-[12px] disabled:opacity-40">↑</button>
                      <button type="button" disabled={taskBusy || idx === arr.length - 1} onClick={() => void moveTask(task, 1)} className="rounded border border-[#d8d8d8] px-2 py-1 text-[12px] disabled:opacity-40">↓</button>
                      <button type="button" onClick={() => startEditTask(task)} className="rounded border border-[#d8d8d8] px-2 py-1 text-[12px]">Edit</button>
                      <button type="button" disabled={taskBusy} onClick={() => void deleteTask(task.id)} className="rounded border border-[#fecaca] px-2 py-1 text-[12px] text-[#b91c1c] disabled:opacity-40">Delete</button>
                    </div>
                  </li>
                ))}
                {selectedTemplateTasks.length === 0 ? (
                  <li className="rounded-lg border border-dashed border-[#e8e8e8] bg-white p-3 text-[12px] text-[#9b9b9b]">
                    No tasks yet for this template.
                  </li>
                ) : null}
              </ul>
            </section>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
