'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { tenantHostMatchesOrg, tenantSubdomainOriginForHost } from '@/lib/tenant/adminUrl';

export type LoginOrgOption = {
  org_id: string;
  name: string;
  slug: string;
};

type Props = {
  open: boolean;
  orgs: LoginOrgOption[];
  nextPath: string;
  onClose: () => void;
};

export function LoginOrgChoiceModal({ open, orgs, nextPath, onClose }: Props) {
  const router = useRouter();
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  function safeNextPath(path: string): string {
    if (!path || !path.startsWith('/') || path.startsWith('//')) return '/';
    return path;
  }

  async function navigateToSelectedOrg(slug: string) {
    const safeNext = safeNextPath(nextPath || '/');
    if (slug && !tenantHostMatchesOrg(slug, window.location.host)) {
      const supabase = createClient();
      const { data } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token;
      const refreshToken = data.session?.refresh_token;
      const orgOrigin = tenantSubdomainOriginForHost(slug, window.location.host);
      let target = `${orgOrigin}${safeNext}`;
      if (accessToken && refreshToken) {
        const callbackUrl = new URL('/auth/callback', orgOrigin);
        callbackUrl.searchParams.set('next', safeNext);
        callbackUrl.hash = new URLSearchParams({
          access_token: accessToken,
          refresh_token: refreshToken,
          type: 'magiclink',
        }).toString();
        target = callbackUrl.toString();
      }
      window.location.assign(target);
      return;
    }
    router.replace(safeNext);
    router.refresh();
  }

  async function choose(orgId: string) {
    setError(null);
    setLoadingId(orgId);
    const supabase = createClient();
    const { error: rpcErr } = await supabase.rpc('set_my_active_org', { p_org_id: orgId });
    if (rpcErr) {
      setLoadingId(null);
      setError(rpcErr.message);
      return;
    }
    setLoadingId(null);
    onClose();
    const selected = orgs.find((o) => o.org_id === orgId);
    void navigateToSelectedOrg(selected?.slug || '');
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 px-4 py-8"
      role="dialog"
      aria-modal="true"
      aria-labelledby="org-choice-title"
    >
      <div className="max-h-[min(90vh,520px)] w-full max-w-md overflow-y-auto rounded-[14px] border border-[#e8e6e3] bg-[#faf9f6] p-6 shadow-lg">
        <h2 id="org-choice-title" className="font-authSerif text-xl text-[#121212]">
          Choose organisation
        </h2>
        <p className="mt-2 text-[13px] leading-relaxed text-[#6b6b6b]">
          Your account is linked to more than one workspace. Pick which one to open. You can change this later
          in Settings.
        </p>
        {error ? (
          <p className="mt-4 rounded-[10px] bg-red-500/10 px-3 py-2 text-sm text-[#b91c1c]" role="alert">
            {error}
          </p>
        ) : null}
        <ul className="mt-5 flex flex-col gap-2">
          {orgs.map((o) => (
            <li key={o.org_id}>
              <button
                type="button"
                disabled={loadingId !== null}
                onClick={() => void choose(o.org_id)}
                className="flex w-full flex-col items-start rounded-xl border border-[#d8d8d8] bg-white px-4 py-3.5 text-left transition hover:border-[#121212] disabled:opacity-50"
              >
                <span className="text-[14px] font-medium text-[#121212]">{o.name}</span>
                <span className="mt-0.5 font-mono text-[12px] text-[#9b9b9b]">{o.slug}</span>
                {loadingId === o.org_id ? (
                  <span className="mt-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-[#121212]/25 border-t-[#121212]" />
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
