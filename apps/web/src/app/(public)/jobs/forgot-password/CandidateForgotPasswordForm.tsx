'use client';

import { tenantJobsSubrouteRelativePath } from '@/lib/tenant/adminUrl';
import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type Props = {
  orgSlug: string;
  hostHeader: string;
};

export function CandidateForgotPasswordForm({ orgSlug, hostHeader }: Props) {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loginHref = tenantJobsSubrouteRelativePath('login', orgSlug || null, hostHeader);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);
    const supabase = createClient();
    const { error: authError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/set-password`,
    });
    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }
    setMessage('Reset link sent. Check your inbox.');
    setLoading(false);
  }

  return (
    <main className="mt-6 w-full rounded-xl border border-[#e8e8e8] bg-white p-6 shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[#9b9b9b]">Account</p>
        <h1 className="mt-1 font-authSerif text-[30px]">Reset password</h1>
        <p className="mt-2 text-[13px] text-[#6b6b6b]">Enter your account email and we will send a reset link.</p>
        <form className="mt-5 space-y-4" onSubmit={(e) => void onSubmit(e)}>
          <div>
            <label className="mb-1 block text-[12px] font-medium text-[#6b6b6b]" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              className="w-full rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2 text-[14px]"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          {error ? (
            <p className="text-[13px] text-[#b91c1c]" role="alert">
              {error}
            </p>
          ) : null}
          {message ? <p className="text-[13px] text-[#14532d]">{message}</p> : null}
          <button
            disabled={loading}
            className="w-full rounded-lg bg-[#121212] px-4 py-2.5 text-[14px] font-medium text-white disabled:bg-[#d8d8d8] disabled:text-[#9b9b9b]"
          >
            {loading ? 'Sending...' : 'Send reset link'}
          </button>
        </form>
        <p className="mt-5 text-[12px] text-[#6b6b6b]">
          Back to{' '}
          <Link className="underline" href={loginHref}>
            sign in
          </Link>
          .
        </p>
    </main>
  );
}
