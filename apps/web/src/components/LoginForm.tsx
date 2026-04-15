'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { LoginOrgOption } from '@/components/auth/LoginOrgChoiceModal';
import { LoginOrgChoiceModal } from '@/components/auth/LoginOrgChoiceModal';
import { AppLoaderOverlay } from '@/components/AppLoaderOverlay';
import { createClient } from '@/lib/supabase/client';

type Props = {
  /** From server `searchParams` - avoids `useSearchParams` + Suspense on the login page. */
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
  const [signingIn, setSigningIn] = useState(false);
  const [orgChoiceOpen, setOrgChoiceOpen] = useState(false);
  const [orgChoiceOrgs, setOrgChoiceOrgs] = useState<LoginOrgOption[]>([]);
  const [message, setMessage] = useState<string | null>(
    errorParam === 'inactive' ? 'Your account is inactive.' : null
  );

  useEffect(() => {
    if (errorParam !== 'inactive') return;
    const supabase = createClient();
    void supabase.auth.signOut();
  }, [errorParam]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setLoading(false);
      setMessage(error.message);
      return;
    }

    await supabase.rpc('profile_clear_reauth_required');

    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) {
      setLoading(false);
      setSigningIn(true);
      router.replace(next);
      router.refresh();
      return;
    }

    const { data: memRows, error: memErr } = await supabase
      .from('user_org_memberships')
      .select('org_id, organisations(name, slug)');

    if (memErr || !memRows?.length) {
      setLoading(false);
      setSigningIn(true);
      router.replace(next);
      router.refresh();
      return;
    }

    const orgs: LoginOrgOption[] = memRows
      .map((r) => {
        const o = r.organisations as { name?: string; slug?: string } | null;
        return {
          org_id: r.org_id as string,
          name: o?.name?.trim() || 'Organisation',
          slug: o?.slug?.trim() || '',
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));

    if (orgs.length === 1) {
      const { data: prof } = await supabase.from('profiles').select('org_id').eq('id', uid).maybeSingle();
      if (!prof?.org_id || prof.org_id !== orgs[0]!.org_id) {
        await supabase.rpc('set_my_active_org', { p_org_id: orgs[0]!.org_id });
      }
      setLoading(false);
      setSigningIn(true);
      router.replace(next);
      router.refresh();
      return;
    }

    const { data: prof } = await supabase.from('profiles').select('org_id').eq('id', uid).maybeSingle();
    const activeOk = Boolean(prof?.org_id && orgs.some((o) => o.org_id === prof.org_id));
    if (activeOk) {
      setLoading(false);
      setSigningIn(true);
      router.replace(next);
      router.refresh();
      return;
    }

    setOrgChoiceOrgs(orgs);
    setOrgChoiceOpen(true);
    setLoading(false);
  }

  return (
    <div>
      {signingIn && <AppLoaderOverlay />}
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

      <LoginOrgChoiceModal
        open={orgChoiceOpen}
        orgs={orgChoiceOrgs}
        nextPath={next}
        onClose={() => setOrgChoiceOpen(false)}
      />
    </div>
  );
}
