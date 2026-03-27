'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type Props = {
  /** From server `searchParams` — avoids `useSearchParams` + Suspense on the login page. */
  nextPath?: string;
  errorParam?: string | null;
};

export function LoginForm({ nextPath = '/', errorParam }: Props) {
  const router = useRouter();
  const next = nextPath || '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [keepSignedIn, setKeepSignedIn] = useState(true);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(
    errorParam === 'inactive' ? 'Your account is inactive.' : null
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    router.replace(next);
    router.refresh();
  }

  return (
    <div>
      <h2 className="auth-title">Welcome back</h2>
      <p className="auth-sub mb-8">Sign in to your Campsite account</p>

      <form onSubmit={(e) => void onSubmit(e)}>
        <div className="mb-4">
          <label className="auth-label" htmlFor="email">
            Email address
          </label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="auth-input"
            placeholder="you@organisation.ac.uk"
          />
        </div>

        <div className="mb-4">
          <div className="mb-1.5 flex items-end justify-between gap-2">
            <label className="auth-label mb-0" htmlFor="password">
              Password
            </label>
            <Link href="/forgot-password" className="text-[12.5px] text-[#9b9b9b] hover:text-[#121212]">
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <input
              id="password"
              type={showPw ? 'text' : 'password'}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="auth-input pr-12"
              placeholder="Enter your password"
            />
            <button
              type="button"
              className="absolute right-3 top-1/2 -translate-y-1/2 border-0 bg-transparent p-1 text-[13px] text-[#9b9b9b] hover:text-[#121212]"
              onClick={() => setShowPw((s) => !s)}
            >
              {showPw ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>

        <label className="mb-4 flex cursor-pointer items-start gap-2.5">
          <input
            type="checkbox"
            checked={keepSignedIn}
            onChange={(e) => setKeepSignedIn(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-[#121212]"
          />
          <span className="text-[12.5px] leading-snug text-[#6b6b6b]">
            Keep me signed in on this device
          </span>
        </label>

        {message ? (
          <p className="mb-4 text-sm text-[#b91c1c]" role="alert">
            {message}
          </p>
        ) : null}

        <button type="submit" disabled={loading} className="auth-btn-primary">
          {loading ? (
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          ) : null}
          Sign in
        </button>
      </form>

      <p className="mt-6 text-center text-[13px] text-[#6b6b6b]">
        Don&apos;t have an account?{' '}
        <Link
          href="/register"
          className="inline-block rounded-md border border-[#d8d8d8] px-2 py-0.5 font-medium text-[#121212] underline decoration-[#121212] underline-offset-2"
        >
          Create one
        </Link>
      </p>
    </div>
  );
}
