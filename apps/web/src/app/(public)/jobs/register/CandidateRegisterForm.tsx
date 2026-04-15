'use client';

import { tenantJobsSubrouteRelativePath } from '@/lib/tenant/adminUrl';
import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type Props = {
  orgSlug: string;
  hostHeader: string;
};

export function CandidateRegisterForm({ orgSlug, hostHeader }: Props) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const loginHref = tenantJobsSubrouteRelativePath('login', orgSlug || null, hostHeader);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { account_type: 'candidate', full_name: fullName } },
    });
    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }
    setDone(true);
    setLoading(false);
  }

  const inputClass =
    'w-full rounded-xl border px-3.5 py-2.5 text-[14px] outline-none transition-[border-color,box-shadow] focus:ring-2';

  if (done) {
    return (
      <div
        className="w-full rounded-2xl border p-6"
        style={{
          borderColor: 'var(--org-brand-border, #e0ddd8)',
          background: 'var(--org-brand-surface, #f5f4f1)',
        }}
      >
        <div
          className="flex h-12 w-12 items-center justify-center rounded-full text-[20px]"
          style={{ background: 'color-mix(in oklab, var(--org-brand-primary) 12%, var(--org-brand-surface))' }}
        >
          ✓
        </div>
        <h2
          className="mt-4 font-authSerif text-[1.5rem] tracking-[-0.02em]"
          style={{ color: 'var(--org-brand-text, #121212)' }}
        >
          Check your inbox
        </h2>
        <p className="mt-2 text-[14px] leading-relaxed" style={{ color: 'var(--org-brand-muted, #6b6b6b)' }}>
          We sent a confirmation link to <strong style={{ color: 'var(--org-brand-text)' }}>{email}</strong>. Click it to activate your account, then sign in.
        </p>
        <Link
          href={loginHref}
          className="mt-5 inline-flex w-full items-center justify-center rounded-xl px-4 py-3 text-[14px] font-semibold transition-opacity hover:opacity-90"
          style={{ background: 'var(--org-brand-primary, #121212)', color: 'var(--jobs-on-primary, #fff)' }}
        >
          Go to sign in
        </Link>
      </div>
    );
  }

  return (
    <div
      className="w-full rounded-2xl border p-6 shadow-sm"
      style={{
        borderColor: 'var(--org-brand-border, #e0ddd8)',
        background: 'var(--org-brand-surface, #f5f4f1)',
      }}
    >
      <p
        className="text-[11px] font-semibold uppercase tracking-[0.12em]"
        style={{ color: 'var(--org-brand-muted, #9b9b9b)' }}
      >
        Candidate portal
      </p>
      <h2
        className="mt-1 font-authSerif text-[1.875rem] tracking-[-0.02em]"
        style={{ color: 'var(--org-brand-text, #121212)' }}
      >
        Create account
      </h2>
      <p className="mt-1.5 text-[13px]" style={{ color: 'var(--org-brand-muted, #6b6b6b)' }}>
        Apply faster and track every application in one place.
      </p>

      <form className="mt-6 space-y-4" onSubmit={(e) => void onSubmit(e)}>
        <div>
          <label
            className="mb-1.5 block text-[12px] font-semibold"
            htmlFor="reg-name"
            style={{ color: 'var(--org-brand-text, #121212)' }}
          >
            Full name
          </label>
          <input
            id="reg-name"
            required
            autoComplete="name"
            className={inputClass}
            style={{
              borderColor: 'var(--org-brand-border, #d8d8d8)',
              background: 'var(--org-brand-bg, #faf9f6)',
              color: 'var(--org-brand-text, #121212)',
            }}
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
        </div>
        <div>
          <label
            className="mb-1.5 block text-[12px] font-semibold"
            htmlFor="reg-email"
            style={{ color: 'var(--org-brand-text, #121212)' }}
          >
            Email
          </label>
          <input
            id="reg-email"
            type="email"
            required
            autoComplete="email"
            className={inputClass}
            style={{
              borderColor: 'var(--org-brand-border, #d8d8d8)',
              background: 'var(--org-brand-bg, #faf9f6)',
              color: 'var(--org-brand-text, #121212)',
            }}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <label
            className="mb-1.5 block text-[12px] font-semibold"
            htmlFor="reg-password"
            style={{ color: 'var(--org-brand-text, #121212)' }}
          >
            Password
          </label>
          <input
            id="reg-password"
            type="password"
            minLength={8}
            required
            autoComplete="new-password"
            className={inputClass}
            style={{
              borderColor: 'var(--org-brand-border, #d8d8d8)',
              background: 'var(--org-brand-bg, #faf9f6)',
              color: 'var(--org-brand-text, #121212)',
            }}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <p className="mt-1 text-[11px]" style={{ color: 'var(--org-brand-muted, #9b9b9b)' }}>
            Minimum 8 characters
          </p>
        </div>

        {error ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-[13px] text-[#b91c1c]" role="alert">
            {error}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl px-4 py-3 text-[14px] font-semibold transition-opacity hover:opacity-90 disabled:opacity-40"
          style={{
            background: 'var(--org-brand-primary, #121212)',
            color: 'var(--jobs-on-primary, #fff)',
          }}
        >
          {loading ? 'Creating account…' : 'Create account'}
        </button>
      </form>

      <p className="mt-5 text-center text-[13px]" style={{ color: 'var(--org-brand-muted, #6b6b6b)' }}>
        Already have an account?{' '}
        <Link
          className="font-semibold underline underline-offset-2 hover:opacity-70"
          href={loginHref}
          style={{ color: 'var(--org-brand-text, #121212)' }}
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
