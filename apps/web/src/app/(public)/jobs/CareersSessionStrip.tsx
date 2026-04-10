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
};

export function CareersSessionStrip({ orgSlug, hostHeader, userEmail }: Props) {
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

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-[#ececec] bg-white px-5 py-3">
      <div>
        <p className="font-authSerif text-[18px] leading-tight text-[#121212]">Campsite Careers</p>
        <p className="text-[12px] text-[#9b9b9b]">Open roles and applications</p>
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
