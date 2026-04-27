'use client';

import Link from 'next/link';
import { useState } from 'react';
import { clientEmailRedirectBaseUrl } from '@/lib/auth/inviteCallbackBaseUrl';
import { createClient } from '@/lib/supabase/client';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    const supabase = createClient();
    const origin =
      typeof window !== 'undefined' ? clientEmailRedirectBaseUrl() || window.location.origin : '';
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${origin}/auth/callback?next=/settings`,
    });
    setLoading(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    setSent(true);
    setMessage('If an account exists for that email, you will receive reset instructions.');
  }

  if (sent) {
    return (
      <div className="py-2 text-center">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-[#f5f4f1] text-[28px]">
          📬
        </div>
        <h2 className="auth-title">Check your email</h2>
        <p className="auth-sub mb-2">
          We&apos;ve sent a password reset link to
          <br />
          <strong className="font-medium text-[#121212]">{email.trim()}</strong>
        </p>
        <div className="mt-6 rounded-[10px] border border-[#d8d8d8] bg-[#f5f4f1] p-4 text-left text-[13px] leading-relaxed text-[#6b6b6b]">
          Didn&apos;t receive it? Check your spam folder, or make sure you used the same email as your
          Campsite account.
        </div>
        <Link href="/login" className="auth-btn-ghost mt-6 inline-flex no-underline">
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <div>
      <Link
        href="/login"
        className="mb-6 flex w-fit items-center gap-1.5 text-[13px] text-[#9b9b9b] transition-colors hover:text-[#121212]"
      >
        ← Back to sign in
      </Link>
      <h2 className="auth-title">Reset your password</h2>
      <p className="auth-sub mb-8">
        Enter your account email and we&apos;ll send a reset link. This password applies across all linked organisations.
      </p>
      <form onSubmit={(e) => void onSubmit(e)}>
        <div className="mb-6">
          <label className="auth-label" htmlFor="forgot-email">
            Email address
          </label>
          <input
            id="forgot-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="auth-input"
            placeholder="you@organisation.ac.uk"
          />
        </div>
        {message ? (
          <p className="mb-4 text-sm text-[#6b6b6b]" role="status">
            {message}
          </p>
        ) : null}
        <button type="submit" disabled={loading} className="auth-btn-primary">
          {loading ? (
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          ) : null}
          Send reset link
        </button>
      </form>
    </div>
  );
}
