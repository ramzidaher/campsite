'use client';

import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

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
  full_name: string;
  email: string | null;
  status: string;
  employment_start_date: string;
  created_at: string;
  template_name: string;
};

type Member = { id: string; full_name: string; email: string | null };

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
  templates,
  runs,
  members,
}: {
  orgId: string;
  canTemplates: boolean;
  canRuns: boolean;
  templates: Template[];
  runs: Run[];
  members: Member[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const [tab, setTab] = useState<'runs' | 'templates'>(canRuns ? 'runs' : 'templates');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

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

  async function startRun(e: React.FormEvent) {
    e.preventDefault();
    if (!startUserId || !startTemplateId || !startDate) return;
    setBusy(true);
    setMsg(null);
    const { data: runId, error } = await supabase.rpc('onboarding_run_start', {
      p_user_id: startUserId,
      p_template_id: startTemplateId,
      p_employment_start_date: startDate,
      p_offer_id: null,
    });
    setBusy(false);
    if (error) { setMsg(error.message); return; }
    setShowStartForm(false);
    router.push(`/admin/hr/onboarding/${runId as string}`);
  }

  async function createTemplate(e: React.FormEvent) {
    e.preventDefault();
    if (!tplName.trim()) return;
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.from('onboarding_templates').insert({
      name: tplName.trim(),
      description: tplDesc.trim() || null,
      is_default: tplDefault,
    });
    setBusy(false);
    if (error) { setMsg(error.message); return; }
    setShowTemplateForm(false);
    setTplName(''); setTplDesc(''); setTplDefault(false);
    router.refresh();
  }

  const activeRuns = runs.filter((r) => r.status === 'active');
  const pastRuns = runs.filter((r) => r.status !== 'active');
  const activeTemplates = templates.filter((t) => !t.is_archived);

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
          {canRuns && activeTemplates.length > 0 && (
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
        <p className="mb-4 rounded-lg border border-[#fecaca] bg-[#fef2f2] px-3 py-2 text-[13px] text-[#b91c1c]">{msg}</p>
      ) : null}

      {/* Start run form */}
      {showStartForm ? (
        <div className="mb-6 rounded-xl border border-[#d8d8d8] bg-white p-5">
          <h2 className="text-[15px] font-semibold text-[#121212]">Start onboarding run</h2>
          <form className="mt-4 grid gap-4 sm:grid-cols-3" onSubmit={(e) => void startRun(e)}>
            <label className="block text-[12.5px] font-medium text-[#6b6b6b]">
              Employee
              <select
                className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2 text-[13px]"
                value={startUserId}
                onChange={(e) => setStartUserId(e.target.value)}
                required
              >
                {members.map((m) => (
                  <option key={m.id} value={m.id}>{m.full_name}</option>
                ))}
              </select>
            </label>
            <label className="block text-[12.5px] font-medium text-[#6b6b6b]">
              Template
              <select
                className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2 text-[13px]"
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
                className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2 text-[13px]"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </label>
            <div className="flex gap-2 sm:col-span-3">
              <button type="submit" disabled={busy} className="rounded-lg bg-[#121212] px-4 py-2 text-[13px] font-medium text-[#faf9f6] disabled:opacity-50">
                {busy ? 'Starting…' : 'Start'}
              </button>
              <button type="button" onClick={() => setShowStartForm(false)} className="rounded-lg border border-[#d8d8d8] bg-white px-4 py-2 text-[13px] font-medium text-[#6b6b6b] hover:bg-[#f5f4f1]">
                Cancel
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {/* Create template form */}
      {showTemplateForm ? (
        <div className="mb-6 rounded-xl border border-[#d8d8d8] bg-white p-5">
          <h2 className="text-[15px] font-semibold text-[#121212]">New template</h2>
          <form className="mt-4 space-y-3" onSubmit={(e) => void createTemplate(e)}>
            <label className="block text-[12.5px] font-medium text-[#6b6b6b]">
              Name
              <input type="text" required value={tplName} onChange={(e) => setTplName(e.target.value)} className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2 text-[13px]" placeholder="e.g. Standard Onboarding" />
            </label>
            <label className="block text-[12.5px] font-medium text-[#6b6b6b]">
              Description (optional)
              <input type="text" value={tplDesc} onChange={(e) => setTplDesc(e.target.value)} className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2 text-[13px]" />
            </label>
            <label className="flex items-center gap-2 text-[13px] text-[#4a4a4a]">
              <input type="checkbox" checked={tplDefault} onChange={(e) => setTplDefault(e.target.checked)} />
              Set as default template
            </label>
            <div className="flex gap-2">
              <button type="submit" disabled={busy} className="rounded-lg bg-[#121212] px-4 py-2 text-[13px] font-medium text-[#faf9f6] disabled:opacity-50">{busy ? 'Creating…' : 'Create'}</button>
              <button type="button" onClick={() => setShowTemplateForm(false)} className="rounded-lg border border-[#d8d8d8] bg-white px-4 py-2 text-[13px] font-medium text-[#6b6b6b] hover:bg-[#f5f4f1]">Cancel</button>
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
                    <Link href={`/admin/hr/onboarding/${r.id}`} className="flex items-center justify-between rounded-xl border border-[#d8d8d8] bg-white p-4 hover:bg-[#faf9f6]">
                      <div>
                        <p className="font-medium text-[#121212]">{r.full_name}</p>
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
            <p className="rounded-xl border border-[#ececec] bg-[#faf9f6] px-4 py-6 text-center text-[13px] text-[#9b9b9b]">
              No active onboarding runs. Use &ldquo;Start onboarding&rdquo; to begin one.
            </p>
          )}
          {pastRuns.length > 0 ? (
            <section>
              <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wide text-[#9b9b9b]">Past</h2>
              <ul className="space-y-2">
                {pastRuns.map((r) => (
                  <li key={r.id}>
                    <Link href={`/admin/hr/onboarding/${r.id}`} className="flex items-center justify-between rounded-xl border border-[#ececec] bg-[#faf9f6] p-4 hover:bg-[#f0ede8]">
                      <div>
                        <p className="text-[13px] font-medium text-[#4a4a4a]">{r.full_name}</p>
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
        <div>
          {activeTemplates.length === 0 ? (
            <p className="rounded-xl border border-[#ececec] bg-[#faf9f6] px-4 py-6 text-center text-[13px] text-[#9b9b9b]">
              No templates yet. Create one to get started.
            </p>
          ) : (
            <ul className="space-y-2">
              {activeTemplates.map((t) => (
                <li key={t.id}>
                  <Link href={`/admin/hr/onboarding?template=${t.id}`} className="flex items-center justify-between rounded-xl border border-[#d8d8d8] bg-white p-4 hover:bg-[#faf9f6]">
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
        </div>
      ) : null}
    </div>
  );
}
