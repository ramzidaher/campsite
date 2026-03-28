'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

function safeNextPath(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//')) return '/dashboard';
  return raw;
}

type Props = {
  nextPath?: string | null;
  /** Present for invite links sent before `must_set_password` metadata existed. */
  fromInvite?: boolean;
};

export function InviteSetPasswordForm({ nextPath, fromInvite = false }: Props) {
  const router = useRouter();
  const next = safeNextPath(nextPath ?? undefined);

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [loginEmail, setLoginEmail] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!user) {
        const back = `/auth/set-password?next=${encodeURIComponent(next)}`;
        router.replace(`/login?next=${encodeURIComponent(back)}`);
        return;
      }
      const meta = user.user_metadata as Record<string, unknown> | undefined;
      const needsStep = meta?.must_set_password === true || fromInvite;
      if (!needsStep) {
        router.replace(next);
        return;
      }
      setLoginEmail(typeof user.email === 'string' && user.email.trim() ? user.email.trim() : null);
      setSessionReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [router, next, fromInvite]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    if (password.length < 8) {
      setMessage('Use at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setMessage('Passwords do not match.');
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({
      password,
      data: { must_set_password: false },
    });
    setLoading(false);
    if (error) {
      setMessage(error.message);
      return;
    }
    router.replace(next);
    router.refresh();
  }

  if (!sessionReady) {
    return (
      <div className="flex min-h-[200px] items-center justify-center">
        <span className="inline-block h-8 w-8 animate-spin rounded-full border-2 border-[#d8d8d8] border-t-[#121212]" />
      </div>
    );
  }

  return (
    <div>
      <h2 className="auth-title">Create your password</h2>
      <p className="auth-sub mb-4">
        You&apos;re signed in from your invite. Choose a password so you can sign in next time.
      </p>
      {loginEmail ? (
        <p className="mb-8 rounded-lg border border-[#e5e5e5] bg-[#faf9f6] px-3.5 py-3 text-[13px] leading-relaxed text-[#454545]">
          <span className="font-medium text-[#121212]">Your login email</span> is{' '}
          <span className="font-mono text-[12.5px] text-[#121212]">{loginEmail}</span>
          . Use this same address when you sign in with email and password later — it matches the invite we sent.
        </p>
      ) : (
        <p className="auth-sub mb-8">
          Use the <strong className="font-medium text-[#121212]">same email address</strong> you received the invite on
          when you sign in next time.
        </p>
      )}

      <form onSubmit={(e) => void onSubmit(e)}>
        <div className="mb-4">
          <label className="auth-label mb-1.5" htmlFor="invite-pw">
            New password
          </label>
          <div className="relative">
            <input
              id="invite-pw"
              type={showPw ? 'text' : 'password'}
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="auth-input pr-12"
              placeholder="At least 8 characters"
              minLength={8}
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

        <div className="mb-6">
          <label className="auth-label" htmlFor="invite-pw2">
            Confirm password
          </label>
          <input
            id="invite-pw2"
            type={showPw ? 'text' : 'password'}
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="auth-input"
            placeholder="Repeat password"
            minLength={8}
          />
        </div>

        {message ? (
          <p className="mb-4 text-sm text-[#b91c1c]" role="alert">
            {message}
          </p>
        ) : null}

        <button type="submit" disabled={loading} className="auth-btn-primary">
          {loading ? (
            <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          ) : null}
          Continue
        </button>
      </form>
    </div>
  );
}
