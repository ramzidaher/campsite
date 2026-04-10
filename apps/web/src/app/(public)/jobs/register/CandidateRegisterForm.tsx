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
  const [message, setMessage] = useState<string | null>(null);

  const loginHref = tenantJobsSubrouteRelativePath('login', orgSlug || null, hostHeader);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);
    const supabase = createClient();
    const { error: authError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          account_type: 'candidate',
          full_name: fullName,
        },
      },
    });
    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }
    setMessage('Account created. Check your email to confirm your address, then sign in.');
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-[#faf9f6] px-5 py-10 text-[#121212]">
      <main className="mx-auto w-full max-w-md rounded-xl border border-[#e8e8e8] bg-white p-6 shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[#9b9b9b]">Candidate portal</p>
        <h1 className="mt-1 font-authSerif text-[30px]">Create account</h1>
        <p className="mt-2 text-[13px] text-[#6b6b6b]">
          Register once to apply faster and track your application status.
        </p>
        <form className="mt-5 space-y-4" onSubmit={(e) => void onSubmit(e)}>
          <div>
            <label className="mb-1 block text-[12px] font-medium text-[#6b6b6b]" htmlFor="full_name">
              Full name
            </label>
            <input
              id="full_name"
              required
              autoComplete="name"
              className="w-full rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2 text-[14px]"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>
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
              minLength={8}
              required
              autoComplete="new-password"
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
          {message ? <p className="text-[13px] text-[#14532d]">{message}</p> : null}
          <button
            disabled={loading}
            className="w-full rounded-lg bg-[#121212] px-4 py-2.5 text-[14px] font-medium text-white disabled:bg-[#d8d8d8] disabled:text-[#9b9b9b]"
          >
            {loading ? 'Creating account...' : 'Create account'}
          </button>
        </form>
        <p className="mt-5 text-[12px] text-[#6b6b6b]">
          Already have an account?{' '}
          <Link className="underline" href={loginHref}>
            Sign in
          </Link>
        </p>
      </main>
    </div>
  );
}
