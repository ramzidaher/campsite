import { CandidateLoginForm } from '@/app/(public)/jobs/login/CandidateLoginForm';
import { headers } from 'next/headers';
import { Suspense } from 'react';

export default async function CandidateLoginPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string; next?: string }>;
}) {
  const sp = await searchParams;
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? '';
  const orgSlug = (sp.org?.trim() || h.get('x-campsite-org-slug')?.trim() || '') as string;
  const defaultNext = sp.next?.trim() || '/jobs/me';

  return (
    <Suspense fallback={<div className="min-h-screen bg-[#faf9f6] p-8 text-[#6b6b6b]">Loading…</div>}>
      <CandidateLoginForm orgSlug={orgSlug} hostHeader={host} defaultNext={defaultNext} />
    </Suspense>
  );
}
