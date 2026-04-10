import { CandidateForgotPasswordForm } from '@/app/(public)/jobs/forgot-password/CandidateForgotPasswordForm';
import { headers } from 'next/headers';

export default async function CandidateForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string }>;
}) {
  const sp = await searchParams;
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? '';
  const orgSlug = (sp.org?.trim() || h.get('x-campsite-org-slug')?.trim() || '') as string;

  return <CandidateForgotPasswordForm orgSlug={orgSlug} hostHeader={host} />;
}
