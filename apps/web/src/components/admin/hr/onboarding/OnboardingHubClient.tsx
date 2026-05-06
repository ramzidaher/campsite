'use client';

import { campusSurface, FormSelect } from '@campsite/ui/web';
import { invalidateClientCaches } from '@/lib/cache/clientInvalidate';
import { createClient } from '@/lib/supabase/client';
import { emitGlobalActionFeedback } from '@/lib/ui/globalActionFeedback';
import { ArrowRight, Plus } from 'lucide-react';
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
type HiringReadinessRow = {
  job_application_id: string;
  contract_assigned: boolean;
  rtw_required: boolean;
  rtw_complete: boolean;
  payroll_bank_complete: boolean;
  payroll_tax_complete: boolean;
  policy_ack_complete: boolean;
  it_access_complete: boolean;
  start_confirmed_at: string | null;
};

type ActionErrorKind = 'validation' | 'network' | 'permission' | 'server';
type UiActionError = {
  kind: ActionErrorKind;
  title: string;
  description: string;
  retryLabel?: string;
  raw?: string;
};

function classifyActionError(input: unknown): UiActionError {
  const maybe = input as { message?: string; code?: string; status?: number } | null;
  const rawMessage = String(maybe?.message ?? 'Action failed');
  const lower = rawMessage.toLowerCase();
  const code = String(maybe?.code ?? '');
  const status = Number(maybe?.status ?? 0);

  if (!rawMessage.trim()) {
    return {
      kind: 'server',
      title: 'We could not complete that action',
      description: 'Refresh and try again. If this keeps happening, contact support.',
      retryLabel: 'Refresh',
    };
  }

  if (status === 403 || code === '42501' || lower.includes('permission') || lower.includes('not allowed') || lower.includes('forbidden')) {
    return {
      kind: 'permission',
      title: 'You do not have permission',
      description: 'Ask an admin for access or contact support if this looks wrong.',
      raw: rawMessage,
    };
  }

  if (
    !globalThis.navigator?.onLine ||
    lower.includes('network') ||
    lower.includes('fetch') ||
    lower.includes('timeout') ||
    lower.includes('connection') ||
    status === 408
  ) {
    return {
      kind: 'network',
      title: 'Lost connection',
      description: 'Check your internet connection. We will reconnect automatically.',
      retryLabel: 'Retry',
      raw: rawMessage,
    };
  }

  if (
    code === '23505' ||
    code === '23514' ||
    code === '23503' ||
    lower.includes('invalid') ||
    lower.includes('required') ||
    lower.includes('must') ||
    lower.includes('cannot')
  ) {
    return {
      kind: 'validation',
      title: 'Please check the highlighted fields',
      description: rawMessage,
      raw: rawMessage,
    };
  }

  return {
    kind: 'server',
    title: 'The server hit a problem',
    description: 'Refresh and try again. If this keeps happening, contact support.',
    retryLabel: 'Refresh',
    raw: rawMessage,
  };
}

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
  orgId,
  canTemplates,
  canRuns,
  canManageRuns,
  templates,
  runs,
  members,
  selectedTemplateId,
  selectedTemplateTasks,
  readinessRows,
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
  readinessRows: HiringReadinessRow[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const [tab, setTab] = useState<'runs' | 'templates'>(canRuns ? 'runs' : 'templates');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success'; text: string } | null>(null);
  const [actionError, setActionError] = useState<UiActionError | null>(null);

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
  const [taskMsg, setTaskMsg] = useState<{ type: 'success'; text: string } | null>(null);
  const [taskError, setTaskError] = useState<UiActionError | null>(null);
  const [editTaskId, setEditTaskId] = useState<string | null>(null);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskCategory, setTaskCategory] = useState('other');
  const [taskAssignee, setTaskAssignee] = useState('hr');
  const [taskDueOffset, setTaskDueOffset] = useState('1');

  const isStartFormValid = Boolean(startUserId && startTemplateId && startDate);
  const isTemplateFormValid = Boolean(tplName.trim());

  async function startRun(e: React.FormEvent) {
    e.preventDefault();
    if (!isStartFormValid) {
      setActionError({
        kind: 'validation',
        title: 'Complete required fields',
        description: 'Select employee, template, and employment start date to continue.',
      });
      return;
    }
    setBusy(true);
    setMsg(null);
    setActionError(null);
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
      const parsed = classifyActionError(error);
      if (parsed.kind === 'network') {
        emitGlobalActionFeedback({ tone: 'err', message: `${parsed.title}. Reconnecting in five seconds.` });
      }
      setActionError(parsed);
      return;
    }
    setShowStartForm(false);
    setMsg({ type: 'success', text: 'Onboarding run started.' });
    router.push(`/hr/onboarding/${runId as string}`);
  }

  async function createTemplate(e: React.FormEvent) {
    e.preventDefault();
    if (!isTemplateFormValid) {
      setActionError({
        kind: 'validation',
        title: 'Template name is required',
        description: 'Enter a template name before creating.',
      });
      return;
    }
    setBusy(true);
    setMsg(null);
    setActionError(null);
    const { error } = await withMinimumDelay(
      supabase.from('onboarding_templates').insert({
        org_id: orgId,
        name: tplName.trim(),
        description: tplDesc.trim() || null,
        is_default: tplDefault,
      })
    );
    setBusy(false);
    if (error) {
      const parsed = classifyActionError(error);
      if (parsed.kind === 'network') {
        emitGlobalActionFeedback({ tone: 'err', message: `${parsed.title}. Reconnecting in five seconds.` });
      }
      setActionError(parsed);
      return;
    }
    setShowTemplateForm(false);
    setTplName(''); setTplDesc(''); setTplDefault(false);
    setMsg({ type: 'success', text: 'Template created.' });
    await invalidateClientCaches({ scopes: ['onboarding'] }).catch(() => null);
    router.refresh();
  }

  const activeRuns = runs.filter((r) => r.status === 'active');
  const pastRuns = runs.filter((r) => r.status !== 'active');
  const activeTemplates = templates.filter((t) => !t.is_archived);
  const currentTemplateId = selectedTemplateId && activeTemplates.some((t) => t.id === selectedTemplateId)
    ? selectedTemplateId
    : null;
  const isTaskFormValid = Boolean(currentTemplateId && taskTitle.trim());

  async function upsertTask(e: React.FormEvent) {
    e.preventDefault();
    if (!isTaskFormValid) {
      setTaskError({
        kind: 'validation',
        title: 'Task title is required',
        description: 'Add a title before saving this task.',
      });
      return;
    }
    setTaskBusy(true);
    setTaskMsg(null);
    setTaskError(null);
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
      const parsed = classifyActionError(error);
      if (parsed.kind === 'network') {
        emitGlobalActionFeedback({ tone: 'err', message: `${parsed.title}. Reconnecting in five seconds.` });
      }
      setTaskError(parsed);
      return;
    }
    setEditTaskId(null);
    setTaskTitle('');
    setTaskCategory('other');
    setTaskAssignee('hr');
    setTaskDueOffset('1');
    setTaskMsg({ type: 'success', text: editTaskId ? 'Task updated.' : 'Task added.' });
    await invalidateClientCaches({ scopes: ['onboarding'] }).catch(() => null);
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
    setTaskError(null);
    const { error } = await withMinimumDelay(
      supabase.rpc('onboarding_template_task_delete', { p_task_id: taskId })
    );
    setTaskBusy(false);
    if (error) {
      const parsed = classifyActionError(error);
      if (parsed.kind === 'network') {
        emitGlobalActionFeedback({ tone: 'err', message: `${parsed.title}. Reconnecting in five seconds.` });
      }
      setTaskError(parsed);
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
    await invalidateClientCaches({ scopes: ['onboarding'] }).catch(() => null);
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
    setTaskError(null);
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
      const parsed = classifyActionError(first.error ?? second.error ?? { message: 'Could not reorder tasks' });
      if (parsed.kind === 'network') {
        emitGlobalActionFeedback({ tone: 'err', message: `${parsed.title}. Reconnecting in five seconds.` });
      }
      setTaskError(parsed);
      return;
    }
    setTaskMsg({ type: 'success', text: 'Task order updated.' });
    await invalidateClientCaches({ scopes: ['onboarding'] }).catch(() => null);
    router.refresh();
  }

  async function confirmStart(applicationId: string) {
    setBusy(true);
    setMsg(null);
    setActionError(null);
    const { error } = await withMinimumDelay(
      supabase.rpc('hiring_confirm_start', { p_job_application_id: applicationId })
    );
    setBusy(false);
    if (error) {
      const parsed = classifyActionError(error);
      if (parsed.kind === 'network') {
        emitGlobalActionFeedback({ tone: 'err', message: `${parsed.title}. Reconnecting in five seconds.` });
      }
      setActionError(parsed);
      return;
    }
    setMsg({ type: 'success', text: 'Start confirmed.' });
    await invalidateClientCaches({ scopes: ['onboarding'] }).catch(() => null);
    router.refresh();
  }

  async function markPrestartChecksComplete(applicationId: string) {
    setBusy(true);
    setMsg(null);
    setActionError(null);
    const { error } = await withMinimumDelay(
      supabase
        .from('hiring_start_readiness')
        .update({
          rtw_complete: true,
          payroll_bank_complete: true,
          payroll_tax_complete: true,
          policy_ack_complete: true,
          it_access_complete: true,
        })
        .eq('job_application_id', applicationId)
    );
    setBusy(false);
    if (error) {
      const parsed = classifyActionError(error);
      if (parsed.kind === 'network') {
        emitGlobalActionFeedback({ tone: 'err', message: `${parsed.title}. Reconnecting in five seconds.` });
      }
      setActionError(parsed);
      return;
    }
    setMsg({ type: 'success', text: 'Pre-start checks marked complete.' });
    await invalidateClientCaches({ scopes: ['onboarding'] }).catch(() => null);
    router.refresh();
  }

  return (
    <div className="w-full px-5 py-6 sm:px-[28px] sm:py-7">
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
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-[#121212] px-4 text-[13px] font-medium text-[#faf9f6] transition-opacity hover:opacity-90"
            >
              <Plus className="h-4 w-4" aria-hidden />
              New template
            </button>
          )}
          {canManageRuns && activeTemplates.length > 0 && (
            <button
              type="button"
              onClick={() => setShowStartForm(true)}
              className="inline-flex h-10 items-center rounded-lg bg-[#121212] px-4 text-[13px] font-medium text-[#faf9f6] hover:bg-[#2a2a2a]"
            >
              Start onboarding
            </button>
          )}
        </div>
      </div>

      {msg ? (
        <p
          className="mb-4 rounded-lg border border-[#86efac] bg-[#f0fdf4] px-3 py-2 text-[13px] text-[#166534]"
        >
          {msg.text}
        </p>
      ) : null}
      {actionError ? (
        <div className="mb-4 rounded-lg border border-[#fecaca] bg-[#fef2f2] px-3 py-2 text-[13px] text-[#7f1d1d]">
          <p className="font-medium">{actionError.title}</p>
          <p className="mt-0.5 text-[#991b1b]">{actionError.description}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {actionError.retryLabel ? (
              <button
                type="button"
                onClick={() => router.refresh()}
                className="rounded-md border border-[#fca5a5] bg-white px-2.5 py-1 text-[12px] font-medium text-[#7f1d1d] hover:bg-[#fff1f2]"
              >
                {actionError.retryLabel}
              </button>
            ) : null}
            <a
              href="mailto:support@campsiteapp.com"
              className="rounded-md border border-[#fca5a5] bg-white px-2.5 py-1 text-[12px] font-medium text-[#7f1d1d] hover:bg-[#fff1f2]"
            >
              Contact us
            </a>
          </div>
        </div>
      ) : null}

      {/* Start run form */}
      {showStartForm && canManageRuns ? (
        <div className="mb-6 rounded-2xl border border-[#e8e8e8] bg-white p-5">
          <h2 className="text-[15px] font-semibold text-[#121212]">Start onboarding run</h2>
          <form className="mt-4 grid gap-4 sm:grid-cols-3" onSubmit={(e) => void startRun(e)}>
            <label className="block text-[12.5px] font-medium text-[#6b6b6b]">
              Employee
              <FormSelect
                className="mt-1 w-full rounded-xl border border-[#e8e8e8] bg-[#faf9f6] px-3 py-2 text-[13px] focus:border-[#121212] focus:outline-none"
                value={startUserId}
                onChange={(e) => setStartUserId(e.target.value)}
                required
              >
                {members.map((m) => (
                  <option key={m.id} value={m.id}>{m.display_name}</option>
                ))}
              </FormSelect>
            </label>
            <label className="block text-[12.5px] font-medium text-[#6b6b6b]">
              Template
              <FormSelect
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
              </FormSelect>
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
              <button type="submit" disabled={busy || !isStartFormValid} className="rounded-lg bg-[#121212] px-4 py-2 text-[13px] font-medium text-white disabled:opacity-50">
                {busy ? 'Starting…' : 'Start'}
              </button>
              <button type="button" disabled={busy} onClick={() => setShowStartForm(false)} className="rounded-lg border border-[#e8e8e8] bg-white px-4 py-2 text-[13px] font-medium text-[#6b6b6b] hover:bg-[#faf9f6] disabled:opacity-50">
                Cancel
              </button>
            </div>
          </form>
          {!isStartFormValid ? (
            <p className="mt-2 text-[12px] text-[#b45309]">Complete all fields before starting onboarding.</p>
          ) : null}
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
              <button type="submit" disabled={busy || !isTemplateFormValid} className="rounded-lg bg-[#121212] px-4 py-2 text-[13px] font-medium text-white disabled:opacity-50">{busy ? 'Creating…' : 'Create'}</button>
              <button type="button" disabled={busy} onClick={() => setShowTemplateForm(false)} className="rounded-lg border border-[#e8e8e8] bg-white px-4 py-2 text-[13px] font-medium text-[#6b6b6b] hover:bg-[#faf9f6] disabled:opacity-50">Cancel</button>
            </div>
            {!isTemplateFormValid ? (
              <p className="text-[12px] text-[#b45309]">Template name is required.</p>
            ) : null}
          </form>
        </div>
      ) : null}

      {/* Tabs */}
      <div className="mb-4 inline-flex max-w-full flex-wrap gap-1 rounded-lg border border-[#d8d8d8] bg-[#f5f4f1] p-1">
        {canRuns && (
          <button type="button" onClick={() => setTab('runs')} className={['rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors', tab === 'runs' ? 'bg-white text-[#121212] shadow-sm' : 'text-[#6b6b6b] hover:text-[#121212]'].join(' ')}>
            Runs {activeRuns.length > 0 ? <span className="ml-1 rounded-full bg-[#dcfce7] px-1.5 py-0.5 text-[10px] font-bold text-[#166534]">{activeRuns.length}</span> : null}
          </button>
        )}
        {canTemplates && (
          <button type="button" onClick={() => setTab('templates')} className={['rounded-md px-3 py-1.5 text-[12px] font-medium transition-colors', tab === 'templates' ? 'bg-white text-[#121212] shadow-sm' : 'text-[#6b6b6b] hover:text-[#121212]'].join(' ')}>
            Templates ({activeTemplates.length})
          </button>
        )}
      </div>

      {/* Runs tab */}
      {tab === 'runs' && canRuns ? (
        <div className="space-y-6">
          {readinessRows.length > 0 ? (
            <section className="rounded-2xl border border-[#e8e8e8] bg-white p-5">
              <h2 className="text-[13px] font-semibold uppercase tracking-wide text-[#9b9b9b]">Pre-start readiness</h2>
              <ul className="mt-3 space-y-2">
                {readinessRows.slice(0, 8).map((r) => {
                  const ready =
                    r.contract_assigned &&
                    (!r.rtw_required || r.rtw_complete) &&
                    r.payroll_bank_complete &&
                    r.payroll_tax_complete &&
                    r.policy_ack_complete;
                  return (
                    <li key={r.job_application_id} className="rounded-lg border border-[#ececec] bg-[#faf9f6] p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-[12px] font-semibold text-[#121212]">Application {r.job_application_id.slice(0, 8)}</p>
                          <p className="text-[12px] text-[#6b6b6b]">
                            Contract {r.contract_assigned ? 'yes' : 'no'} · RTW{' '}
                            {r.rtw_required ? (r.rtw_complete ? 'done' : 'pending') : 'not required'} · Payroll bank{' '}
                            {r.payroll_bank_complete ? 'done' : 'pending'} · Payroll tax {r.payroll_tax_complete ? 'done' : 'pending'} · Policy{' '}
                            {r.policy_ack_complete ? 'done' : 'pending'}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {r.start_confirmed_at ? (
                            <span className="rounded-full bg-[#dcfce7] px-2 py-0.5 text-[11px] font-medium text-[#166534]">Started</span>
                          ) : (
                            <>
                              {!ready ? (
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => void markPrestartChecksComplete(r.job_application_id)}
                                  className="rounded-lg border border-[#d8d8d8] bg-white px-3 py-1.5 text-[12px] font-medium text-[#121212] disabled:opacity-40"
                                >
                                  Mark checks complete
                                </button>
                              ) : null}
                              <button
                                type="button"
                                disabled={busy || !ready}
                                onClick={() => void confirmStart(r.job_application_id)}
                                className="rounded-lg bg-[#121212] px-3 py-1.5 text-[12px] font-medium text-white disabled:opacity-40"
                              >
                                Confirm start
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
          {activeRuns.length > 0 ? (
            <section>
              <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-[#9b9b9b]">Active</h2>
              <ul className="space-y-2">
                {activeRuns.map((r) => (
                  <li key={r.id}>
                    <Link
                      href={`/hr/onboarding/${r.id}`}
                      className={`flex items-center justify-between rounded-xl border border-[#e8e8e8] bg-white p-4 ${campusSurface.interactiveSheetRow}`}
                    >
                      <div>
                        <p className="font-medium text-[#121212]">{r.display_name}</p>
                        <p className="text-[12px] text-[#9b9b9b]">
                          {r.template_name} · starts {r.employment_start_date}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        {statusBadge(r.status)}
                        <span className="inline-flex items-center gap-1 text-[12px] text-[#9b9b9b]">
                          Open <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                        </span>
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
                    <span className="inline-flex items-center gap-1 text-[12px] text-[#9b9b9b]">
                      Manage tasks <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                    </span>
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
                  className="mt-3 rounded-lg border border-[#86efac] bg-[#f0fdf4] px-3 py-2 text-[13px] text-[#166534]"
                >
                  {taskMsg.text}
                </p>
              ) : null}
              {taskError ? (
                <div className="mt-3 rounded-lg border border-[#fecaca] bg-[#fef2f2] px-3 py-2 text-[13px] text-[#7f1d1d]">
                  <p className="font-medium">{taskError.title}</p>
                  <p className="mt-0.5 text-[#991b1b]">{taskError.description}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {taskError.retryLabel ? (
                      <button
                        type="button"
                        onClick={() => router.refresh()}
                        className="rounded-md border border-[#fca5a5] bg-white px-2.5 py-1 text-[12px] font-medium text-[#7f1d1d] hover:bg-[#fff1f2]"
                      >
                        {taskError.retryLabel}
                      </button>
                    ) : null}
                    <a
                      href="mailto:support@campsiteapp.com"
                      className="rounded-md border border-[#fca5a5] bg-white px-2.5 py-1 text-[12px] font-medium text-[#7f1d1d] hover:bg-[#fff1f2]"
                    >
                      Contact us
                    </a>
                  </div>
                </div>
              ) : null}
              <form className="mt-4 grid gap-3 sm:grid-cols-4" onSubmit={(e) => void upsertTask(e)}>
                <label className="block text-[12px] font-medium text-[#6b6b6b] sm:col-span-2">
                  Title
                  <input value={taskTitle} onChange={(e) => setTaskTitle(e.target.value)} required className="mt-1 w-full rounded-lg border border-[#e8e8e8] bg-[#faf9f6] px-3 py-2 text-[13px] focus:border-[#121212] focus:outline-none" />
                </label>
                <label className="block text-[12px] font-medium text-[#6b6b6b]">
                  Category
                  <FormSelect value={taskCategory} onChange={(e) => setTaskCategory(e.target.value)} className="mt-1 w-full rounded-lg border border-[#e8e8e8] bg-[#faf9f6] px-3 py-2 text-[13px] focus:border-[#121212] focus:outline-none">
                    <option value="documents">Documents</option>
                    <option value="it_setup">IT setup</option>
                    <option value="introductions">Introductions</option>
                    <option value="compliance">Compliance</option>
                    <option value="other">Other</option>
                  </FormSelect>
                </label>
                <label className="block text-[12px] font-medium text-[#6b6b6b]">
                  Assignee
                  <FormSelect value={taskAssignee} onChange={(e) => setTaskAssignee(e.target.value)} className="mt-1 w-full rounded-lg border border-[#e8e8e8] bg-[#faf9f6] px-3 py-2 text-[13px] focus:border-[#121212] focus:outline-none">
                    <option value="employee">Employee</option>
                    <option value="manager">Manager</option>
                    <option value="hr">HR</option>
                  </FormSelect>
                </label>
                <label className="block text-[12px] font-medium text-[#6b6b6b]">
                  Due offset days
                  <input type="number" min={0} value={taskDueOffset} onChange={(e) => setTaskDueOffset(e.target.value)} className="mt-1 w-full rounded-lg border border-[#e8e8e8] bg-[#faf9f6] px-3 py-2 text-[13px] focus:border-[#121212] focus:outline-none" />
                </label>
                <div className="flex items-end gap-2 sm:col-span-3">
                  <button type="submit" disabled={taskBusy || !isTaskFormValid} className="rounded-lg bg-[#121212] px-3 py-2 text-[13px] font-medium text-white disabled:opacity-50">
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
              {!isTaskFormValid ? (
                <p className="mt-2 text-[12px] text-[#b45309]">Task title is required before saving.</p>
              ) : null}

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
