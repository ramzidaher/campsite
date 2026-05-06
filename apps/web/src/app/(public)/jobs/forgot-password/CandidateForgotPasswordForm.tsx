'use client';

import { tenantJobsSubrouteRelativePath } from '@/lib/tenant/adminUrl';
import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Check } from 'lucide-react';

type Props = {
  orgSlug: string;
  hostHeader: string;
};

export function CandidateForgotPasswordForm({ orgSlug, hostHeader }: Props) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loginHref = tenantJobsSubrouteRelativePath('login', orgSlug || null, hostHeader);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    // Route the recovery link through /auth/callback so it exchanges the token,
    // then lands on /auth/set-password with the org-aware login page as `next`.
    // This preserves org context for both subdomain and ?org= tenants.
    const loginHrefFull = `${window.location.origin}${loginHref}`;
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(`/auth/set-password?next=${encodeURIComponent(loginHrefFull)}`)}`;
    const { error: authError } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
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
          <Check className="h-6 w-6 text-[var(--org-brand-primary)]" aria-hidden />
        </div>
        <h2
          className="mt-4 font-authSerif text-[1.5rem] tracking-[-0.02em]"
          style={{ color: 'var(--org-brand-text, #121212)' }}
        >
          Check your inbox
        </h2>
        <p className="mt-2 text-[14px] leading-relaxed" style={{ color: 'var(--org-brand-muted, #6b6b6b)' }}>
          We sent a reset link to <strong style={{ color: 'var(--org-brand-text)' }}>{email}</strong>. Follow the link to set a new password.
        </p>
        <Link
          href={loginHref}
          className="mt-5 inline-flex w-full items-center justify-center rounded-xl px-4 py-3 text-[14px] font-semibold transition-opacity hover:opacity-90"
          style={{ background: 'var(--org-brand-primary, #121212)', color: 'var(--jobs-on-primary, #fff)' }}
        >
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <div
      className="w-full rounded-2xl border p-5 shadow-lg"
      style={{
        borderColor: 'var(--org-brand-border, #e0ddd8)',
        background: 'var(--org-brand-surface, #f5f4f1)',
      }}
    >
      <form className="space-y-4" onSubmit={(e) => void onSubmit(e)}>
        <div>
          <label
            className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.08em]"
            htmlFor="fp-email"
            style={{ color: 'var(--org-brand-muted, #6b6b6b)' }}
          >
            Email
          </label>
          <input
            id="fp-email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
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
          {loading ? 'Sending…' : 'Send reset link'}
        </button>
      </form>

      <p className="mt-5 text-center text-[13px]" style={{ color: 'var(--org-brand-muted, #6b6b6b)' }}>
        Remembered it?{' '}
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
