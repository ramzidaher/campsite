'use client';

import { tenantJobsSubrouteRelativePath, tenantPublicJobsIndexRelativePath } from '@/lib/tenant/adminUrl';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type Tab = 'login' | 'register';
type RegStep = 0 | 1;

export type CandidateAuthCardProps = {
  orgSlug: string;
  hostHeader: string;
  orgName: string;
  orgLogoUrl?: string | null;
  defaultTab?: Tab;
  defaultNext?: string;
};

const SKILL_OPTIONS = [
  'React', 'Python', 'Design', 'Leadership', 'Data',
  'DevOps', 'Marketing', 'Sales', 'Strategy', 'Finance', 'AI/ML', 'Writing',
];

const PERSONA_OPTIONS = [
  { emoji: '🚀', label: 'Rockstar' },
  { emoji: '🧙', label: 'Wizard' },
  { emoji: '🥷', label: 'Ninja' },
  { emoji: '🤖', label: 'Robot' },
  { emoji: '🐉', label: 'Dragon' },
  { emoji: '🦅', label: 'Phoenix' },
];

// ─── helpers ─────────────────────────────────────────────────────────────────

function getInitials(name: string) {
  const words = name.trim().split(/\s+/);
  return words.length >= 2
    ? `${words[0]?.[0] ?? ''}${words[words.length - 1]?.[0] ?? ''}`.toUpperCase()
    : name.slice(0, 2).toUpperCase();
}

function passwordStrength(pw: string): { score: number; label: string; color: string } {
  if (!pw) return { score: 0, label: 'Start typing', color: '' };
  let s = 0;
  if (pw.length >= 6) s++;
  if (pw.length >= 10) s++;
  if (/[A-Z]/.test(pw) && /[0-9]/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  const labels = ['', 'Weak', 'Fair', 'Strong', 'Unbreakable 🔒'];
  const colors = ['', '#ef4444', '#f59e0b', '#22c55e', '#22c55e'];
  return { score: s, label: labels[s] ?? '', color: colors[s] ?? '' };
}

// ─── component ───────────────────────────────────────────────────────────────

export function CandidateAuthCard({
  orgSlug,
  hostHeader,
  orgName,
  orgLogoUrl,
  defaultTab = 'login',
  defaultNext = '/jobs/me',
}: CandidateAuthCardProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextUrl = searchParams.get('next') || defaultNext;

  const [tab, setTab] = useState<Tab>(defaultTab);
  const [regStep, setRegStep] = useState<RegStep>(0);
  const [toast, setToast] = useState<string | null>(null);
  const toastRef = useRef<ReturnType<typeof setTimeout>>();

  // ── login state
  const [liEmail, setLiEmail] = useState('');
  const [liPw, setLiPw] = useState('');
  const [liLoading, setLiLoading] = useState(false);
  const [liError, setLiError] = useState<string | null>(null);
  const liEmailValid = liEmail.includes('@') && liEmail.includes('.');
  const liEmailValidRef = useRef(false);

  // ── register state — step 0
  const [rName, setRName] = useState('');
  const [rEmail, setREmail] = useState('');
  const [rPw, setRPw] = useState('');
  const rEmailValid = rEmail.includes('@') && rEmail.includes('.');
  const rEmailValidRef = useRef(false);

  // ── register state — step 1 (persona / skills)
  const [selectedPersona, setSelectedPersona] = useState<string | null>(null);
  const [selectedSkills, setSelectedSkills] = useState<string[]>([]);

  // ── register submit state
  const [rLoading, setRLoading] = useState(false);
  const [rError, setRError] = useState<string | null>(null);
  const [rDone, setRDone] = useState(false);

  const pw = passwordStrength(rPw);
  const initials = getInitials(orgName);

  const forgotHref = tenantJobsSubrouteRelativePath('forgot-password', orgSlug || null, hostHeader);
  const jobsIndexHref = tenantPublicJobsIndexRelativePath(orgSlug, hostHeader);

  // ── XP
  const loginXp = Math.min((liEmailValid ? 50 : 0) + (liPw.length >= 6 ? 50 : 0), 100);
  const regXp = Math.min(
    (rName.trim().length > 1 ? 15 : 0) +
      (rEmailValid ? 20 : 0) +
      (rPw.length >= 8 ? 20 : 0) +
      pw.score * 5 +
      (selectedPersona ? 15 : 0) +
      selectedSkills.length * 8,
    100,
  );
  const currentXp = tab === 'login' ? loginXp : regXp;
  const xpLabel = tab === 'login' ? 'Profile XP' : 'Signup XP';

  // ── toast
  function showToast(msg: string) {
    setToast(msg);
    clearTimeout(toastRef.current);
    toastRef.current = setTimeout(() => setToast(null), 2400);
  }

  useEffect(() => () => clearTimeout(toastRef.current), []);

  // One-shot XP toast: login email
  useEffect(() => {
    if (liEmailValid && !liEmailValidRef.current) {
      liEmailValidRef.current = true;
      showToast('+50 XP — email confirmed!');
    } else if (!liEmailValid) {
      liEmailValidRef.current = false;
    }
   
  }, [liEmailValid]);

  // One-shot XP toast: register email
  useEffect(() => {
    if (rEmailValid && !rEmailValidRef.current) {
      rEmailValidRef.current = true;
      showToast('+20 XP — email saved!');
    } else if (!rEmailValid) {
      rEmailValidRef.current = false;
    }
   
  }, [rEmailValid]);

  // ── actions
  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setLiLoading(true);
    setLiError(null);
    const { error } = await createClient().auth.signInWithPassword({ email: liEmail, password: liPw });
    if (error) {
      setLiError(error.message);
      setLiLoading(false);
      return;
    }
    showToast('Welcome back, job hunter!');
    router.replace(nextUrl);
    router.refresh();
  }

  async function handleRegister(e: FormEvent) {
    e.preventDefault();
    if (rPw.length < 8) return;
    setRLoading(true);
    setRError(null);

    // Build an org-aware post-confirmation redirect so the candidate lands back
    // on the right org portal after clicking the email verification link.
    const meHref = tenantJobsSubrouteRelativePath('me', orgSlug || null, hostHeader);
    const emailRedirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(meHref)}`;

    const { error } = await createClient().auth.signUp({
      email: rEmail,
      password: rPw,
      options: {
        emailRedirectTo,
        data: {
          account_type: 'candidate',
          full_name: rName,
          // Stored in raw_user_meta_data → picked up by DB trigger → candidate_profiles
          persona: selectedPersona ?? '',
          skills: selectedSkills,
        },
      },
    });
    if (error) {
      setRError(error.message);
      setRLoading(false);
      return;
    }
    setRDone(true);
    setRLoading(false);
  }

  function switchTab(t: Tab) {
    setTab(t);
    setLiError(null);
    setRError(null);
  }

  function goStep(s: RegStep) {
    if (s === 1) {
      if (!rName.trim()) { showToast('What do we call you?'); return; }
      if (!rEmailValid) { showToast('Hmm, check your email first'); return; }
      if (rPw.length < 8) { showToast('Password needs 8+ characters'); return; }
      showToast('+25 XP — step 1 complete!');
    }
    setRegStep(s);
  }

  function toggleSkill(skill: string) {
    if (selectedSkills.includes(skill)) {
      setSelectedSkills((s) => s.filter((x) => x !== skill));
    } else if (selectedSkills.length < 5) {
      setSelectedSkills((s) => [...s, skill]);
      showToast(`+8 XP — ${skill} added!`);
    } else {
      showToast('Max 5 superpowers!');
    }
  }

  function pickPersona(emoji: string, label: string) {
    setSelectedPersona(emoji);
    showToast(`+15 XP — ${label} selected!`);
  }

  // ── shared styles
  const inputStyle = (active: boolean) => ({
    borderColor: active ? 'var(--org-brand-primary)' : 'var(--org-brand-border, #d8d8d8)',
    background: 'var(--org-brand-bg, #faf9f6)',
    color: 'var(--org-brand-text, #121212)',
  });
  const inputClass =
    'w-full rounded-xl border px-3.5 py-2.5 text-[14px] outline-none transition-all focus:ring-2 placeholder:opacity-40';
  const labelClass = 'mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em]';

  return (
    <div className="relative w-full max-w-[420px]">
      {/* ── Org identity + badge ── */}
      <div className="mb-4 flex items-center gap-2.5">
        {orgLogoUrl ? (
          <img
            src={orgLogoUrl}
            alt=""
            aria-hidden
            width={32}
            height={32}
            className="h-8 w-8 shrink-0 rounded-lg object-contain"
            style={{
              background: 'var(--org-brand-surface)',
              border: '1px solid var(--org-brand-border)',
            }}
          />
        ) : (
          <div
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold"
            style={{ background: 'var(--org-brand-primary)', color: 'var(--jobs-on-primary, #fff)' }}
            aria-hidden
          >
            {initials}
          </div>
        )}
        <span className="text-[14px] font-semibold" style={{ color: 'var(--org-brand-text)' }}>
          {orgName}
        </span>
        <span
          className="ml-auto shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.1em]"
          style={{
            background: 'color-mix(in oklab, var(--org-brand-primary) 12%, var(--org-brand-surface))',
            color: 'var(--org-brand-primary)',
          }}
        >
          Careers unlocked
        </span>
      </div>

      {/* ── Headline ── */}
      <h1
        className="font-authSerif text-[2.25rem] leading-[1.15] tracking-[-0.025em]"
        style={{ color: 'var(--org-brand-text)' }}
      >
        {tab === 'login' ? (
          <>
            Your{' '}
            <em style={{ color: 'var(--org-brand-primary)', fontStyle: 'italic' }}>career</em>,
            <br />
            continued.
          </>
        ) : (
          <>
            Your{' '}
            <em style={{ color: 'var(--org-brand-primary)', fontStyle: 'italic' }}>dream job</em>
            <br />
            starts here.
          </>
        )}
      </h1>
      <p className="mt-2 mb-5 text-[13.5px] leading-relaxed" style={{ color: 'var(--org-brand-muted)' }}>
        {tab === 'login'
          ? 'Sign in to track applications and receive updates.'
          : 'Level up your career. No more boring applications.'}
      </p>

      {/* ── Tab switcher ── */}
      <div
        className="mb-4 flex rounded-xl p-[3px]"
        style={{
          background: 'var(--org-brand-surface, #f5f4f1)',
          border: '1px solid var(--org-brand-border, #e0ddd8)',
        }}
      >
        {(['login', 'register'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => switchTab(t)}
            className="flex-1 rounded-[9px] py-2.5 text-[13px] transition-all duration-200"
            style={
              tab === t
                ? {
                    background: 'var(--org-brand-primary, #121212)',
                    color: 'var(--jobs-on-primary, #fff)',
                    fontWeight: 700,
                  }
                : {
                    background: 'transparent',
                    color: 'var(--org-brand-muted, #6b6b6b)',
                    fontWeight: 500,
                  }
            }
          >
            {t === 'login' ? 'Sign in' : 'Create account'}
          </button>
        ))}
      </div>

      {/* ── Card ── */}
      <div
        className="rounded-2xl p-5 shadow-lg"
        style={{
          background: 'var(--org-brand-surface, #f5f4f1)',
          border: '1px solid var(--org-brand-border, #e0ddd8)',
        }}
      >
        {/* XP bar */}
        <div
          className="mb-4 flex items-center gap-3 rounded-xl px-3.5 py-2"
          style={{
            background: 'var(--org-brand-bg, #faf9f6)',
            border: '1px solid var(--org-brand-border, #e0ddd8)',
          }}
        >
          <span
            className="shrink-0 text-[10px] font-bold uppercase tracking-[0.1em]"
            style={{ color: 'var(--org-brand-muted, #9b9b9b)' }}
          >
            {xpLabel}
          </span>
          <div
            className="relative h-1.5 flex-1 overflow-hidden rounded-full"
            style={{ background: 'var(--org-brand-border, #e0ddd8)' }}
          >
            <div
              className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
              style={{
                width: `${currentXp}%`,
                background:
                  'linear-gradient(90deg, var(--org-brand-primary, #121212), color-mix(in oklab, var(--org-brand-primary) 75%, var(--org-brand-secondary, #4f4f4f)))',
              }}
            />
          </div>
          <span
            className="shrink-0 tabular-nums text-[11px] font-semibold"
            style={{ color: 'var(--org-brand-primary, #121212)' }}
          >
            {currentXp} pts
          </span>
        </div>

        {/* ── Login form ── */}
        {tab === 'login' ? (
          <form onSubmit={(e) => void handleLogin(e)} className="space-y-3.5">
            <div>
              <label
                className={labelClass}
                htmlFor="auth-li-email"
                style={{ color: 'var(--org-brand-muted, #6b6b6b)' }}
              >
                Email address
              </label>
              <input
                id="auth-li-email"
                type="email"
                required
                autoComplete="email"
                placeholder="you@awesome.com"
                className={inputClass}
                style={inputStyle(liEmailValid)}
                value={liEmail}
                onChange={(e) => setLiEmail(e.target.value)}
              />
              {liEmail.length > 0 ? (
                <p
                  className="mt-1 text-[11px] font-medium transition-colors"
                  style={{ color: liEmailValid ? '#22c55e' : '#ef4444' }}
                >
                  {liEmailValid ? 'Looks good!' : 'Hmm, needs an @ and a domain'}
                </p>
              ) : null}
            </div>

            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label
                  className={labelClass}
                  htmlFor="auth-li-pw"
                  style={{ color: 'var(--org-brand-muted, #6b6b6b)' }}
                >
                  Password
                </label>
                <Link
                  href={forgotHref}
                  className="text-[11px] underline underline-offset-2 hover:opacity-70"
                  style={{ color: 'var(--org-brand-muted, #6b6b6b)' }}
                >
                  Forgot?
                </Link>
              </div>
              <input
                id="auth-li-pw"
                type="password"
                required
                autoComplete="current-password"
                placeholder="super secret"
                className={inputClass}
                style={inputStyle(liPw.length >= 6)}
                value={liPw}
                onChange={(e) => setLiPw(e.target.value)}
              />
            </div>

            {liError ? (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-[12px] text-[#b91c1c]" role="alert">
                {liError}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={liLoading}
              className="mt-1 w-full rounded-xl px-4 py-3 text-[14px] font-semibold transition-all hover:-translate-y-px hover:opacity-95 active:translate-y-0 active:scale-[0.99] disabled:opacity-40"
              style={{
                background: 'var(--org-brand-primary, #121212)',
                color: 'var(--jobs-on-primary, #fff)',
              }}
            >
              {liLoading ? 'Signing in…' : 'Launch my career →'}
            </button>
          </form>
        ) : /* ── Register form ── */
        rDone ? (
          <div className="py-2 text-center">
            <div
              className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full text-[22px]"
              style={{
                background: `color-mix(in oklab, var(--org-brand-primary) 12%, var(--org-brand-surface))`,
              }}
              aria-hidden
            >
              ✓
            </div>
            <h3
              className="font-authSerif text-[1.375rem]"
              style={{ color: 'var(--org-brand-text, #121212)' }}
            >
              Check your inbox
            </h3>
            <p
              className="mt-2 text-[13px] leading-relaxed"
              style={{ color: 'var(--org-brand-muted, #6b6b6b)' }}
            >
              Confirmation sent to{' '}
              <strong style={{ color: 'var(--org-brand-text)' }}>{rEmail}</strong>. Verify then sign in.
            </p>
            <button
              type="button"
              onClick={() => { setRDone(false); switchTab('login'); }}
              className="mt-5 w-full rounded-xl px-4 py-3 text-[14px] font-semibold transition-opacity hover:opacity-90"
              style={{
                background: 'var(--org-brand-primary, #121212)',
                color: 'var(--jobs-on-primary, #fff)',
              }}
            >
              Go to sign in →
            </button>
          </div>
        ) : (
          <form onSubmit={(e) => void handleRegister(e)}>
            {/* Step dots — 2 steps */}
            <div className="mb-4 flex items-center justify-center gap-1.5">
              {([0, 1] as const).map((i) => (
                <div
                  key={i}
                  className="h-1.5 rounded-full transition-all duration-300"
                  style={{
                    width: regStep === i ? '20px' : '8px',
                    background:
                      regStep === i
                        ? 'var(--org-brand-primary, #121212)'
                        : 'var(--org-brand-border, #d8d8d8)',
                  }}
                  aria-hidden
                />
              ))}
            </div>

            {/* ── Step 0: name / email / password ── */}
            {regStep === 0 ? (
              <div className="space-y-3.5">
                <div>
                  <label
                    className={labelClass}
                    htmlFor="auth-r-name"
                    style={{ color: 'var(--org-brand-muted)' }}
                  >
                    Your name
                  </label>
                  <input
                    id="auth-r-name"
                    autoComplete="name"
                    placeholder="What do we call you?"
                    className={inputClass}
                    style={inputStyle(rName.trim().length > 1)}
                    value={rName}
                    onChange={(e) => setRName(e.target.value)}
                  />
                </div>
                <div>
                  <label
                    className={labelClass}
                    htmlFor="auth-r-email"
                    style={{ color: 'var(--org-brand-muted)' }}
                  >
                    Work email
                  </label>
                  <input
                    id="auth-r-email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@company.com"
                    className={inputClass}
                    style={inputStyle(rEmailValid)}
                    value={rEmail}
                    onChange={(e) => setREmail(e.target.value)}
                  />
                  {rEmail.length > 0 ? (
                    <p
                      className="mt-1 text-[11px] font-medium transition-colors"
                      style={{ color: rEmailValid ? '#22c55e' : '#ef4444' }}
                    >
                      {rEmailValid ? 'Looks good!' : 'Hmm, check your email'}
                    </p>
                  ) : null}
                </div>
                <div>
                  <label
                    className={labelClass}
                    htmlFor="auth-r-pw"
                    style={{ color: 'var(--org-brand-muted)' }}
                  >
                    Password
                  </label>
                  <input
                    id="auth-r-pw"
                    type="password"
                    autoComplete="new-password"
                    placeholder="Make it strong!"
                    className={inputClass}
                    style={inputStyle(pw.score >= 2)}
                    value={rPw}
                    onChange={(e) => setRPw(e.target.value)}
                  />
                  {/* Strength bar — always visible once focused/typed */}
                  <div className="mt-2">
                    <div className="flex gap-1">
                      {[1, 2, 3, 4].map((i) => (
                        <div
                          key={i}
                          className="h-[3px] flex-1 rounded-full transition-all duration-300"
                          style={{
                            background:
                              rPw && i <= pw.score
                                ? pw.color
                                : 'var(--org-brand-border)',
                          }}
                        />
                      ))}
                    </div>
                    <p
                      className="mt-1 text-[11px] font-medium transition-colors"
                      style={{ color: pw.score > 0 ? pw.color : 'var(--org-brand-muted)' }}
                    >
                      {rPw ? pw.label : 'Start typing'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => goStep(1)}
                  className="mt-1 w-full rounded-xl px-4 py-3 text-[14px] font-semibold transition-all hover:-translate-y-px hover:opacity-95 active:scale-[0.99]"
                  style={{
                    background: 'var(--org-brand-primary, #121212)',
                    color: 'var(--jobs-on-primary, #fff)',
                  }}
                >
                  Next: pick your vibe →
                </button>
              </div>
            ) : (
              /* ── Step 1: persona + skills ── */
              <div className="space-y-4">
                <div>
                  <p
                    className="mb-2.5 text-[12px] font-semibold uppercase tracking-[0.08em]"
                    style={{ color: 'var(--org-brand-muted)' }}
                  >
                    Pick your work persona
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {PERSONA_OPTIONS.map(({ emoji, label }) => (
                      <button
                        key={emoji}
                        type="button"
                        title={label}
                        onClick={() => pickPersona(emoji, label)}
                        className="flex h-10 w-10 items-center justify-center rounded-full text-[20px] transition-all duration-200 hover:scale-110"
                        style={{
                          background:
                            selectedPersona === emoji
                              ? 'color-mix(in oklab, var(--org-brand-primary) 15%, var(--org-brand-bg))'
                              : 'var(--org-brand-bg)',
                          border: `2px solid ${selectedPersona === emoji ? 'var(--org-brand-primary)' : 'var(--org-brand-border)'}`,
                        }}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <p
                    className="mb-2.5 text-[12px] font-semibold uppercase tracking-[0.08em]"
                    style={{ color: 'var(--org-brand-muted)' }}
                  >
                    Your superpowers{' '}
                    <span style={{ color: 'var(--org-brand-primary)', textTransform: 'none', letterSpacing: 0 }}>
                      (pick up to 5)
                    </span>
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {SKILL_OPTIONS.map((skill) => {
                      const sel = selectedSkills.includes(skill);
                      return (
                        <button
                          key={skill}
                          type="button"
                          onClick={() => toggleSkill(skill)}
                          className="rounded-full px-3 py-1 text-[12px] transition-all duration-200"
                          style={{
                            background: sel
                              ? 'color-mix(in oklab, var(--org-brand-primary) 15%, var(--org-brand-bg))'
                              : 'var(--org-brand-bg)',
                            border: `1px solid ${sel ? 'var(--org-brand-primary)' : 'var(--org-brand-border)'}`,
                            color: sel ? 'var(--org-brand-primary)' : 'var(--org-brand-muted)',
                            fontWeight: sel ? 600 : 400,
                          }}
                        >
                          {skill}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {rError ? (
                  <p
                    className="rounded-lg bg-red-50 px-3 py-2 text-[12px] text-[#b91c1c]"
                    role="alert"
                  >
                    {rError}
                  </p>
                ) : null}

                <div className="flex gap-2 pt-0.5">
                  <button
                    type="button"
                    onClick={() => setRegStep(0)}
                    className="flex-1 rounded-xl border px-4 py-3 text-[13px] font-medium transition-opacity hover:opacity-70"
                    style={{
                      borderColor: 'var(--org-brand-border)',
                      color: 'var(--org-brand-muted)',
                      background: 'var(--org-brand-bg)',
                    }}
                  >
                    ← Back
                  </button>
                  <button
                    type="submit"
                    disabled={rLoading || rPw.length < 8}
                    className="flex-[2] rounded-xl px-4 py-3 text-[14px] font-semibold transition-all hover:-translate-y-px hover:opacity-95 active:scale-[0.99] disabled:opacity-40"
                    style={{
                      background: 'var(--org-brand-primary, #121212)',
                      color: 'var(--jobs-on-primary, #fff)',
                    }}
                  >
                    {rLoading ? 'Creating…' : 'Create my profile 🎉'}
                  </button>
                </div>
              </div>
            )}
          </form>
        )}
      </div>

      {/* Switch link */}
      <p className="mt-4 text-center text-[13px]" style={{ color: 'var(--org-brand-muted)' }}>
        {tab === 'login' ? (
          <>
            No account?{' '}
            <button
              type="button"
              onClick={() => switchTab('register')}
              className="font-semibold underline underline-offset-2 hover:opacity-70"
              style={{ color: 'var(--org-brand-text)' }}
            >
              Join the party →
            </button>
          </>
        ) : (
          <>
            Already have an account?{' '}
            <button
              type="button"
              onClick={() => switchTab('login')}
              className="font-semibold underline underline-offset-2 hover:opacity-70"
              style={{ color: 'var(--org-brand-text)' }}
            >
              Sign in →
            </button>
          </>
        )}
      </p>

      {/* Back to jobs */}
      <p className="mt-3 text-center">
        <Link
          href={jobsIndexHref}
          className="text-[12px] transition-opacity hover:opacity-70"
          style={{ color: 'var(--org-brand-muted, #9b9b9b)' }}
        >
          ← Browse open roles
        </Link>
      </p>

      {/* Toast */}
      {toast ? (
        <div
          className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-full px-5 py-2.5 text-[13px] font-semibold shadow-lg"
          style={{
            background: 'var(--org-brand-primary, #121212)',
            color: 'var(--jobs-on-primary, #fff)',
            border: '1px solid rgba(255,255,255,0.15)',
          }}
          role="status"
          aria-live="polite"
        >
          {toast}
        </div>
      ) : null}
    </div>
  );
}
