import { CandidateRegisterForm } from '@/app/(public)/jobs/register/CandidateRegisterForm';
import { headers } from 'next/headers';

export default async function CandidateRegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  const sp = await searchParams;
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? '';
  const orgSlug = (sp.org?.trim() || h.get('x-campsite-org-slug')?.trim() || '') as string;

  return <CandidateRegisterForm orgSlug={orgSlug} hostHeader={host} />;
}
