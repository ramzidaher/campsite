'use client';

import { tenantJobsSubrouteRelativePath } from '@/lib/tenant/adminUrl';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type Props = {
  orgSlug: string;
  hostHeader: string;
  userEmail: string | null;
  /** When set, shown under the product line for consistent employer context */
  orgName?: string | null;
};

export function CareersSessionStrip({ orgSlug, hostHeader, userEmail, orgName }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function signOut() {
    setPending(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.refresh();
    setPending(false);
  }

  const initials = userEmail
    ? userEmail
        .split('@')[0]
        ?.slice(0, 2)
        .toUpperCase() ?? '••'
    : '';

  const org = orgName?.trim();

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#e8e6e3] bg-gradient-to-br from-white to-[#f5f4f1] px-5 py-3 shadow-[0_1px_0_0_rgba(18,18,18,0.04)]">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-authSerif text-[18px] leading-tight text-[#121212]">Campsite</p>
          <span className="rounded-full bg-[#121212] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-[#faf9f6]">
            Careers
          </span>
        </div>
        {org ? (
          <p className="mt-1 text-[13px] font-medium text-[#121212]">{org}</p>
        ) : (
          <p className="mt-0.5 text-[12px] text-[#9b9b9b]">Open roles and applications</p>
        )}
      </div>
      {userEmail ? (
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 rounded-full border border-[#d8d8d8] bg-[#f5f4f1] px-3 py-1.5 text-[12px] text-[#6b6b6b]">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#121212] text-[11px] font-medium text-white">
              {initials}
            </span>
            <span className="max-w-[200px] truncate">{userEmail}</span>
          </div>
          <button
            type="button"
            disabled={pending}
            onClick={() => void signOut()}
            className="text-[12px] text-[#9b9b9b] underline hover:text-[#121212] disabled:opacity-50"
          >
            {pending ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2 text-[13px]">
          <Link
            href={tenantJobsSubrouteRelativePath('login', orgSlug, hostHeader)}
            className="rounded-lg border border-[#d8d8d8] bg-white px-3 py-1.5 hover:bg-[#f5f4f1]"
          >
            Sign in
          </Link>
          <Link
            href={tenantJobsSubrouteRelativePath('register', orgSlug, hostHeader)}
            className="rounded-lg bg-[#121212] px-3 py-1.5 text-white hover:bg-[#333]"
          >
            Register
          </Link>
        </div>
      )}
    </div>
  );
}
