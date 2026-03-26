'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

type Org = { id: string; name: string; slug: string; logo_url: string | null };
type Dept = { id: string; name: string; type: 'department' | 'society' | 'club' };
type Cat = { id: string; dept_id: string; name: string };

const STEP_LABELS = ['Account', 'Organisation', 'Teams', 'Subscriptions', 'Review'] as const;

function passwordStrengthScore(pw: string): { score: number; label: string; color: string; width: string } {
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const map: Record<number, [string, string, string]> = {
    0: ['0%', '#d8d8d8', 'Enter a password'],
    1: ['25%', '#b91c1c', 'Weak'],
    2: ['50%', '#d97706', 'Fair'],
    3: ['75%', '#2563eb', 'Good'],
    4: ['100%', '#15803d', 'Strong'],
  };
  const [width, color, label] = map[score] ?? map[0]!;
  return { score, label, color, width };
}

function passwordStrength(pw: string): 'weak' | 'ok' | 'strong' {
  if (pw.length < 8) return 'weak';
  const hasNum = /\d/.test(pw);
  const hasUpper = /[A-Z]/.test(pw);
  if (hasNum && hasUpper && pw.length >= 10) return 'strong';
  if (pw.length >= 8 && (hasNum || hasUpper)) return 'ok';
  return 'weak';
}

function StepProgress({ step }: { step: number }) {
  return (
    <div className="mb-8">
      <p className="mb-3 text-center text-[11.5px] font-medium text-[#9b9b9b] md:hidden">
        Step {step} of {STEP_LABELS.length}
      </p>
      <div className="hidden items-center md:flex">
        {STEP_LABELS.map((label, i) => {
          const n = i + 1;
          const isDone = n < step;
          const isActive = n === step;
          return (
            <div key={label} className="flex min-w-0 flex-1 items-center">
              <div className="flex min-w-0 items-center gap-2">
                <div
                  className={[
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-[1.5px] text-xs font-medium transition-colors',
                    isDone
                      ? 'border-[#15803d] bg-[#15803d] text-white'
                      : isActive
                        ? 'border-[#121212] bg-[#121212] text-white'
                        : 'border-[#d8d8d8] bg-white text-[#9b9b9b]',
                  ].join(' ')}
                >
                  {isDone ? '✓' : n}
                </div>
                <span
                  className={[
                    'truncate text-[11.5px] font-medium',
                    isActive ? 'text-[#121212]' : 'text-[#9b9b9b]',
                  ].join(' ')}
                >
                  {label}
                </span>
              </div>
              {i < STEP_LABELS.length - 1 ? (
                <div
                  className={['mx-2 h-px min-w-[12px] flex-1', n < step ? 'bg-[#15803d]' : 'bg-[#d8d8d8]'].join(
                    ' '
                  )}
                  aria-hidden
                />
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function RegisterWizard({ initialOrgSlug }: { initialOrgSlug: string | null }) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [depts, setDepts] = useState<Dept[]>([]);
  const [cats, setCats] = useState<Cat[]>([]);
  const [selectedDeptIds, setSelectedDeptIds] = useState<Set<string>>(new Set());
  const [subscribed, setSubscribed] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const strength = passwordStrength(password);
  const strengthVis = passwordStrengthScore(password);

  const loadOrgs = useCallback(async () => {
    const supabase = createClient();
    const { data, error: e } = await supabase
      .from('organisations')
      .select('id,name,slug,logo_url')
      .eq('is_active', true)
      .order('name');
    if (e) {
      setError(e.message);
      return;
    }
    setOrgs(data ?? []);
  }, []);

  const loadDepartments = useCallback(async (oId: string) => {
    const supabase = createClient();
    const { data, error: e } = await supabase
      .from('departments')
      .select('id,name,type')
      .eq('org_id', oId)
      .eq('is_archived', false)
      .order('name');
    if (e) {
      setError(e.message);
      return;
    }
    setDepts((data ?? []) as Dept[]);
    const deptIds = (data ?? []).map((d) => d.id);
    if (deptIds.length) {
      const { data: catRows, error: ce } = await supabase
        .from('dept_categories')
        .select('id,dept_id,name')
        .in('dept_id', deptIds);
      if (ce) {
        setError(ce.message);
        return;
      }
      setCats(catRows ?? []);
      const next: Record<string, boolean> = {};
      (catRows ?? []).forEach((c) => {
        next[c.id] = true;
      });
      setSubscribed(next);
    } else {
      setCats([]);
      setSubscribed({});
    }
  }, []);

  useEffect(() => {
    void loadOrgs();
  }, [loadOrgs]);

  useEffect(() => {
    if (!orgs.length || !initialOrgSlug || orgId) return;
    const match = orgs.find((o) => o.slug === initialOrgSlug);
    if (match) {
      setOrgId(match.id);
      void loadDepartments(match.id);
    }
  }, [orgs, initialOrgSlug, orgId, loadDepartments]);

  function toggleDept(id: string) {
    setSelectedDeptIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function toggleSub(catId: string) {
    setSubscribed((prev) => ({ ...prev, [catId]: !prev[catId] }));
  }

  async function submit() {
    setError(null);
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    if (strength === 'weak') {
      setError('Choose a stronger password (8+ characters, mix of letters and numbers).');
      return;
    }
    if (!orgId) {
      setError('Select an organisation.');
      return;
    }
    if (selectedDeptIds.size === 0) {
      setError('Select at least one department, society, or club.');
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const origin = window.location.origin;
    const { data, error: signErr } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: `${origin}/auth/callback?next=/pending`,
      },
    });
    if (signErr || !data.user) {
      setLoading(false);
      setError(signErr?.message ?? 'Could not create account.');
      return;
    }

    const userId = data.user.id;

    const { error: pErr } = await supabase.from('profiles').insert({
      id: userId,
      org_id: orgId,
      full_name: fullName,
      email,
      role: 'csa',
      status: 'pending',
    });
    if (pErr) {
      setLoading(false);
      setError(pErr.message);
      return;
    }

    const ud = [...selectedDeptIds].map((dept_id) => ({ user_id: userId, dept_id }));
    const { error: udErr } = await supabase.from('user_departments').insert(ud);
    if (udErr) {
      setLoading(false);
      setError(udErr.message);
      return;
    }

    const subRows = cats
      .filter((c) => selectedDeptIds.has(c.dept_id))
      .map((c) => ({
        user_id: userId,
        cat_id: c.id,
        subscribed: subscribed[c.id] ?? true,
      }));
    if (subRows.length) {
      const { error: sErr } = await supabase.from('user_subscriptions').insert(subRows);
      if (sErr) {
        setLoading(false);
        setError(sErr.message);
        return;
      }
    }

    setLoading(false);
    router.replace('/register/done');
    router.refresh();
  }

  const groupedDepts = useMemo(() => {
    const g: Record<string, Dept[]> = { department: [], society: [], club: [] };
    depts.forEach((d) => {
      g[d.type].push(d);
    });
    return g;
  }, [depts]);

  const orgName = orgs.find((o) => o.id === orgId)?.name;

  return (
    <div>
      {step === 1 ? (
        <Link
          href="/login"
          className="mb-6 inline-flex items-center gap-1.5 text-[13px] text-[#9b9b9b] transition-colors hover:text-[#121212]"
        >
          ← Back to sign in
        </Link>
      ) : (
        <button
          type="button"
          onClick={() => setStep((s) => s - 1)}
          className="mb-6 flex w-fit items-center gap-1.5 text-[13px] text-[#9b9b9b] transition-colors hover:text-[#121212]"
        >
          ← Back
        </button>
      )}

      <StepProgress step={step} />

      {error ? (
        <p className="mb-6 rounded-[10px] bg-red-500/10 px-3 py-2 text-sm text-[#b91c1c]">{error}</p>
      ) : null}

      {step === 1 ? (
        <div>
          <h2 className="auth-title">Create your account</h2>
          <p className="auth-sub mb-8">
            {orgName ? (
              <>
                Joining <strong className="font-medium text-[#121212]">{orgName}</strong>
              </>
            ) : (
              'Set up your Campsite profile'
            )}
          </p>
          <div className="mb-4">
            <label className="auth-label" htmlFor="reg-name">
              Full name
            </label>
            <input
              id="reg-name"
              className="auth-input"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Alex Johnson"
              required
            />
          </div>
          <div className="mb-4">
            <label className="auth-label" htmlFor="reg-email">
              Email address
            </label>
            <input
              id="reg-email"
              type="email"
              className="auth-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="alex@organisation.ac.uk"
              required
            />
            <p className="mt-1.5 text-[11.5px] text-[#9b9b9b]">
              Use your organisation email for faster verification
            </p>
          </div>
          <div className="mb-4">
            <label className="auth-label" htmlFor="reg-pw">
              Password
            </label>
            <input
              id="reg-pw"
              type="password"
              className="auth-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min. 8 characters"
              required
            />
            <div className="mt-2 h-[3px] overflow-hidden rounded-sm bg-[#d8d8d8]">
              <div
                className="h-full rounded-sm transition-all duration-300"
                style={{ width: strengthVis.width, backgroundColor: strengthVis.color }}
              />
            </div>
            <p className="mt-1.5 text-[11.5px]" style={{ color: strengthVis.color }}>
              {strengthVis.label}
            </p>
          </div>
          <div className="mb-8">
            <label className="auth-label" htmlFor="reg-pw2">
              Confirm password
            </label>
            <input
              id="reg-pw2"
              type="password"
              className="auth-input"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="Repeat password"
              required
            />
          </div>
          <button
            type="button"
            className="auth-btn-primary"
            onClick={() => {
              setError(null);
              if (!fullName.trim() || !email.trim()) {
                setError('Please fill in all required fields.');
                return;
              }
              if (password !== confirm) {
                setError('Passwords do not match.');
                return;
              }
              setStep(2);
            }}
          >
            Continue →
          </button>
        </div>
      ) : null}

      {step === 2 ? (
        <div>
          <h2 className="auth-title">Your organisation</h2>
          <p className="auth-sub mb-8">
            {initialOrgSlug
              ? 'We matched your workspace from the URL. You can change it if needed.'
              : 'Select the organisation you belong to.'}
          </p>
          <div className="mb-8">
            <label className="auth-label" htmlFor="reg-org">
              Organisation
            </label>
            <select
              id="reg-org"
              className="auth-input appearance-none bg-white"
              value={orgId ?? ''}
              onChange={(e) => {
                const id = e.target.value || null;
                setOrgId(id);
                if (id) void loadDepartments(id);
              }}
              required
            >
              <option value="">Select…</option>
              {orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-3">
            <button type="button" className="auth-btn-ghost flex-1" onClick={() => setStep(1)}>
              ← Back
            </button>
            <button
              type="button"
              className="auth-btn-primary flex-[2]"
              onClick={() => orgId && setStep(3)}
              disabled={!orgId}
            >
              Continue →
            </button>
          </div>
        </div>
      ) : null}

      {step === 3 ? (
        <div>
          <h2 className="auth-title">Select teams</h2>
          <p className="auth-sub mb-6">
            Choose every department, society, or club you belong to. You&apos;ll pick broadcast
            categories next.
          </p>
          {(['department', 'society', 'club'] as const).map((t) =>
            groupedDepts[t].length ? (
              <div key={t} className="mb-6">
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#9b9b9b]">
                  {t === 'department' ? 'Departments' : t === 'society' ? 'Societies' : 'Clubs'}
                </p>
                <div className="flex flex-col gap-2.5">
                  {groupedDepts[t].map((d) => {
                    const selected = selectedDeptIds.has(d.id);
                    return (
                      <div
                        key={d.id}
                        className={[
                          'overflow-hidden rounded-xl border transition-colors',
                          selected ? 'border-[#121212]' : 'border-[#d8d8d8]',
                        ].join(' ')}
                      >
                        <button
                          type="button"
                          onClick={() => toggleDept(d.id)}
                          className="flex w-full items-center justify-between bg-white px-4 py-3.5 text-left transition-colors hover:bg-[#f5f4f1]"
                        >
                          <span className="flex items-center gap-2.5 text-sm font-medium text-[#121212]">
                            <span
                              className={[
                                'flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border-[1.5px] text-[10px]',
                                selected
                                  ? 'border-[#121212] bg-[#121212] text-white'
                                  : 'border-[#d8d8d8] bg-[#faf9f6]',
                              ].join(' ')}
                            >
                              {selected ? '✓' : ''}
                            </span>
                            {d.name}
                          </span>
                          <span className="text-xs text-[#9b9b9b]">{selected ? 'Joined' : 'Not joined'}</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null
          )}
          <div className="mt-2 flex gap-3">
            <button type="button" className="auth-btn-ghost flex-1" onClick={() => setStep(2)}>
              ← Back
            </button>
            <button
              type="button"
              className="auth-btn-primary flex-[2]"
              onClick={() => selectedDeptIds.size > 0 && setStep(4)}
              disabled={selectedDeptIds.size === 0}
            >
              Continue →
            </button>
          </div>
        </div>
      ) : null}

      {step === 4 ? (
        <div>
          <h2 className="auth-title">Subscriptions</h2>
          <p className="auth-sub mb-6">
            Choose broadcast categories you want to receive. You can change these later in Settings.
          </p>
          {Array.from(
            new Set(cats.filter((c) => selectedDeptIds.has(c.dept_id)).map((c) => c.dept_id))
          ).map((deptId) => {
            const deptName = depts.find((d) => d.id === deptId)?.name ?? 'Team';
            const deptCats = cats.filter((c) => c.dept_id === deptId);
            return (
              <div key={deptId} className="mb-6">
                <p className="mb-2 text-[12px] font-medium text-[#9b9b9b]">{deptName}</p>
                <div className="flex flex-wrap gap-1.5">
                  {deptCats.map((c) => {
                    const on = subscribed[c.id] ?? true;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => toggleSub(c.id)}
                        className={[
                          'flex h-7 items-center gap-1 rounded-full border px-3 text-xs transition-colors',
                          on
                            ? 'border-[#121212] bg-[#121212] text-white'
                            : 'border-[#d8d8d8] bg-white text-[#6b6b6b] hover:border-[#121212]',
                        ].join(' ')}
                      >
                        {on ? '✓ ' : ''}
                        {c.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
          <div className="mt-4 flex gap-3">
            <button type="button" className="auth-btn-ghost flex-1" onClick={() => setStep(3)}>
              ← Back
            </button>
            <button type="button" className="auth-btn-primary flex-[2]" onClick={() => setStep(5)}>
              Continue →
            </button>
          </div>
        </div>
      ) : null}

      {step === 5 ? (
        <div>
          <h2 className="auth-title">Review & submit</h2>
          <p className="auth-sub mb-6">
            Check your details before sending your registration for approval
          </p>
          <div className="mb-4 rounded-xl bg-[#f5f4f1] p-4">
            <p className="mb-3 text-[13px] font-medium text-[#9b9b9b]">Account details</p>
            <div className="flex flex-col gap-2 text-[13px]">
              <div className="flex justify-between gap-4">
                <span className="text-[#6b6b6b]">Name</span>
                <span className="font-medium text-[#121212]">{fullName || '—'}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-[#6b6b6b]">Email</span>
                <span className="break-all text-right font-medium text-[#121212]">{email || '—'}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-[#6b6b6b]">Organisation</span>
                <span className="text-right font-medium text-[#121212]">{orgName ?? '—'}</span>
              </div>
            </div>
          </div>
          <div className="mb-6 rounded-xl bg-[#f5f4f1] p-4">
            <p className="mb-3 text-[13px] font-medium text-[#9b9b9b]">Selected teams</p>
            <div className="flex flex-wrap gap-1.5">
              {[...selectedDeptIds].map((id) => {
                const name = depts.find((d) => d.id === id)?.name;
                return name ? (
                  <span
                    key={id}
                    className="inline-flex items-center rounded-full border border-[#d8d8d8] bg-white px-2.5 py-1 text-xs text-[#121212]"
                  >
                    {name}
                  </span>
                ) : null;
              })}
            </div>
          </div>
          <div className="mb-6 rounded-[10px] border border-[#d8d8d8] bg-[#f5f4f1] p-4 text-[13px] leading-relaxed text-[#6b6b6b]">
            <strong className="mb-1 block text-[#121212]">What happens next?</strong>A manager in your
            team will review your registration. You&apos;ll receive an email once you&apos;re approved,
            usually within one working day.
          </div>
          <div className="flex gap-3">
            <button type="button" className="auth-btn-ghost flex-1" onClick={() => setStep(4)}>
              ← Back
            </button>
            <button
              type="button"
              disabled={loading}
              className="auth-btn-primary flex-[2]"
              onClick={() => void submit()}
            >
              {loading ? (
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              ) : null}
              Submit registration
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
