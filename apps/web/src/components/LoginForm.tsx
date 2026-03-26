'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type View = 'login' | 'magic' | 'magic-sent';

type Props = {
  /** From server `searchParams` — avoids `useSearchParams` + Suspense on the login page. */
  nextPath?: string;
  errorParam?: string | null;
};

function pillClass(active: boolean) {
  return [
    'h-[34px] rounded-full border px-3.5 text-[13px] font-medium transition-colors',
    active
      ? 'border-[#121212] bg-[#121212] text-white'
      : 'border-[#d8d8d8] bg-[#f0efec] text-[#6b6b6b] hover:border-[#121212] hover:text-[#121212]',
  ].join(' ');
}

export function LoginForm({ nextPath = '/', errorParam }: Props) {
  const router = useRouter();
  const next = nextPath || '/';

  const [view, setView] = useState<View>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [keepSignedIn, setKeepSignedIn] = useState(true);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(
    errorParam === 'inactive' ? 'Your account is inactive.' : null
  );

  function goLogin() {
    setView('login');
    setMessage(null);
  }

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

  async function sendMagicLink() {
    if (!email.trim()) {
      setMessage('Enter your email address.');
      return;
    }
    setLoading(true);
    setMessage(null);
    const supabase = createClient();
    const origin = window.location.origin;
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    setLoading(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    setView('magic-sent');
  }

  if (view === 'magic') {
    return (
      <div>
        <button
          type="button"
          onClick={goLogin}
          className="mb-6 flex items-center gap-1.5 border-0 bg-transparent p-0 text-[13px] text-[#9b9b9b] transition-colors hover:text-[#121212]"
        >
          ← Back
        </button>
        <h2 className="auth-title">Magic link</h2>
        <p className="auth-sub mb-8">
          Enter your email and we&apos;ll send you a sign-in link — no password needed
        </p>
        <div className="mb-4">
          <label className="auth-label" htmlFor="magic-email">
            Email address
          </label>
          <input
            id="magic-email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={`auth-input ${message ? 'auth-input-error' : ''}`}
            placeholder="you@organisation.ac.uk"
          />
        </div>
        {message ? (
          <p className="mb-4 text-sm text-[#b91c1c]" role="alert">
            {message}
          </p>
        ) : null}
        <button
          type="button"
          disabled={loading}
          className="auth-btn-primary"
          onClick={() => void sendMagicLink()}
        >
          {loading ? (
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          ) : null}
          Send magic link
        </button>
        <p className="mt-4 text-center text-[13px] text-[#6b6b6b]">
          <button type="button" onClick={goLogin} className="auth-link">
            Use password instead
          </button>
        </p>
      </div>
    );
  }

  if (view === 'magic-sent') {
    return (
      <div className="py-4 text-center">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-sky-100 text-[28px]">
          ✉️
        </div>
        <h2 className="auth-title">Check your inbox</h2>
        <p className="auth-sub mb-2">
          A magic sign-in link has been sent to
          <br />
          <strong className="font-medium text-[#121212]">{email.trim()}</strong>
        </p>
        <div className="mt-6 rounded-[10px] border border-[#d8d8d8] bg-[#f5f4f1] p-4 text-left text-[13px] leading-relaxed text-[#6b6b6b]">
          The link expires in about an hour. If you&apos;re on a different device, open the email there
          and tap the link.
        </div>
        <button
          type="button"
          className="auth-btn-ghost mt-6"
          onClick={() => {
            goLogin();
            setMessage(null);
          }}
        >
          Back to sign in
        </button>
      </div>
    );
  }

  return (
    <div>
      <nav className="mb-5 flex flex-wrap gap-2" aria-label="Sign-in method">
        <button type="button" className={pillClass(view === 'login')} onClick={goLogin}>
          Password
        </button>
        <button
          type="button"
          className={pillClass(false)}
          onClick={() => {
            setView('magic');
            setMessage(null);
          }}
        >
          Magic link
        </button>
      </nav>

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

      <div className="auth-divider">or</div>

      <button
        type="button"
        className="auth-btn-ghost"
        onClick={() => {
          setView('magic');
          setMessage(null);
        }}
      >
        ✉️ Continue with magic link
      </button>

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
