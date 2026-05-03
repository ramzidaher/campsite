'use client';

import { ArrowRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { tenantHostMatchesOrg, tenantSubdomainOriginForHost } from '@/lib/tenant/adminUrl';

export type LoginOrgOption = {
  org_id: string;
  name: string;
  slug: string;
  logo_url?: string | null;
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
  const [failedLogos, setFailedLogos] = useState<Record<string, true>>({});

  if (!open) return null;

  function orgInitials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0]!.slice(0, 1).toUpperCase();
    return parts[0]![0]!.toUpperCase();
  }

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
      <div className="max-h-[min(90vh,560px)] w-full max-w-md overflow-y-auto rounded-[16px] border border-[#e8e6e3] bg-[#faf9f6] p-6 shadow-lg">
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#767068]">
            Workspace access
          </p>
          <h2
            id="org-choice-title"
            className="mt-2 font-authSerif text-[28px] leading-tight tracking-[-0.03em] text-[#121212]"
          >
            Choose organisation
          </h2>
          <p className="mt-2 text-[13px] leading-relaxed text-[#6b6b6b]">
            We noticed that you are enrolled in two organisations. Select the workspace you want to open.
            You can switch organisation later from Settings.
          </p>
          {error ? (
            <p
              className="mt-4 rounded-[10px] border border-[#efc0c0] bg-[#fff4f4] px-3 py-2 text-sm text-[#9a2f2f]"
              role="alert"
            >
              {error}
            </p>
          ) : null}
          <ul className="mt-5 flex flex-col gap-2.5">
            {orgs.map((o) => {
              const isLoading = loadingId === o.org_id;
              const showLogo = Boolean(o.logo_url?.trim()) && !failedLogos[o.org_id];

              return (
                <li key={o.org_id}>
                  <button
                    type="button"
                    disabled={loadingId !== null}
                    onClick={() => void choose(o.org_id)}
                    className="group flex w-full items-center gap-3 rounded-xl border border-[#d8d8d8] bg-white px-4 py-3.5 text-left transition hover:border-[#121212] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#121212]/15 disabled:cursor-wait disabled:opacity-60"
                  >
                    {showLogo ? (
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-[14px] border border-[#ece8e2] bg-white">
                        <img
                          src={o.logo_url!.trim()}
                          alt=""
                          className="h-full w-full object-contain p-2.5"
                          loading="lazy"
                          decoding="async"
                          onError={() =>
                            setFailedLogos((current) =>
                              current[o.org_id] ? current : { ...current, [o.org_id]: true }
                            )
                          }
                        />
                      </span>
                    ) : (
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-[#191919] text-[16px] font-semibold text-white">
                        {orgInitials(o.name)}
                      </span>
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-medium text-[#121212]">
                        {o.name}
                      </span>
                      <span className="mt-0.5 block truncate font-mono text-[12px] text-[#9b9b9b]">
                        {o.slug}
                      </span>
                    </span>
                    <span className="ml-auto flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[#9b9b9b] transition-colors group-hover:text-[#121212]">
                      {isLoading ? (
                        <span
                          className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-[#121212]/20 border-t-[#121212]"
                          aria-hidden
                        />
                      ) : (
                        <ArrowRight className="h-5 w-5" aria-hidden strokeWidth={1.8} />
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
      </div>
    </div>
  );
}
