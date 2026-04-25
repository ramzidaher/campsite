'use client';

import { tenantJobsSubrouteRelativePath } from '@/lib/tenant/adminUrl';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type Props = {
  orgSlug: string;
  hostHeader: string;
  defaultNext?: string;
};

export function CandidateLoginForm({ orgSlug, hostHeader, defaultNext = '/jobs/me' }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams?.get('next') || defaultNext;
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const forgotHref = tenantJobsSubrouteRelativePath('forgot-password', orgSlug || null, hostHeader);
  const registerHref = tenantJobsSubrouteRelativePath('register', orgSlug || null, hostHeader);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }
    router.replace(next);
    router.refresh();
  }

  const inputClass =
    'w-full rounded-xl border px-3.5 py-2.5 text-[14px] outline-none transition-[border-color,box-shadow] focus:ring-2';

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
        Sign in
      </h2>
      <p className="mt-1.5 text-[13px]" style={{ color: 'var(--org-brand-muted, #6b6b6b)' }}>
        Access your job applications and status updates.
      </p>

      <form className="mt-6 space-y-4" onSubmit={(e) => void onSubmit(e)}>
        <div>
          <label
            className="mb-1.5 block text-[12px] font-semibold"
            htmlFor="login-email"
            style={{ color: 'var(--org-brand-text, #121212)' }}
          >
            Email
          </label>
          <input
            id="login-email"
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
          <div className="mb-1.5 flex items-center justify-between">
            <label
              className="block text-[12px] font-semibold"
              htmlFor="login-password"
              style={{ color: 'var(--org-brand-text, #121212)' }}
            >
              Password
            </label>
            <Link
              className="text-[12px] underline underline-offset-2 hover:opacity-70"
              href={forgotHref}
              style={{ color: 'var(--org-brand-muted, #6b6b6b)' }}
            >
              Forgot password?
            </Link>
          </div>
          <input
            id="login-password"
            type="password"
            required
            autoComplete="current-password"
            className={inputClass}
            style={{
              borderColor: 'var(--org-brand-border, #d8d8d8)',
              background: 'var(--org-brand-bg, #faf9f6)',
              color: 'var(--org-brand-text, #121212)',
            }}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
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
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>

      <p className="mt-5 text-center text-[13px]" style={{ color: 'var(--org-brand-muted, #6b6b6b)' }}>
        No account?{' '}
        <Link
          className="font-semibold underline underline-offset-2 hover:opacity-70"
          href={registerHref}
          style={{ color: 'var(--org-brand-text, #121212)' }}
        >
          Create one free
        </Link>
      </p>
    </div>
  );
}
