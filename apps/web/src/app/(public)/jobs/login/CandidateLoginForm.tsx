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
  const next = searchParams.get('next') || defaultNext;
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

  return (
    <div className="min-h-screen bg-[#faf9f6] px-5 py-10 text-[#121212]">
      <main className="mx-auto w-full max-w-md rounded-xl border border-[#e8e8e8] bg-white p-6 shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[#9b9b9b]">Candidate portal</p>
        <h1 className="mt-1 font-authSerif text-[30px]">Sign in</h1>
        <p className="mt-2 text-[13px] text-[#6b6b6b]">Access your job applications and status updates.</p>
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
          <div>
            <label className="mb-1 block text-[12px] font-medium text-[#6b6b6b]" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              className="w-full rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2 text-[14px]"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error ? (
            <p className="text-[13px] text-[#b91c1c]" role="alert">
              {error}
            </p>
          ) : null}
          <button
            disabled={loading}
            className="w-full rounded-lg bg-[#121212] px-4 py-2.5 text-[14px] font-medium text-white disabled:bg-[#d8d8d8] disabled:text-[#9b9b9b]"
          >
            {loading ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
        <div className="mt-5 flex justify-between text-[12px] text-[#6b6b6b]">
          <Link className="underline" href={forgotHref}>
            Forgot password?
          </Link>
          <Link className="underline" href={registerHref}>
            Create account
          </Link>
        </div>
      </main>
    </div>
  );
}
