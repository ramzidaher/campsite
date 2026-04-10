import { ApplyJobFormClient } from '@/app/(public)/jobs/[slug]/apply/ApplyJobFormClient';
import { createClient } from '@/lib/supabase/server';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';

type PublicJobRow = {
  job_listing_id: string;
  org_name: string;
  title: string;
  application_mode: string;
  allow_cv: boolean;
  allow_loom: boolean;
  allow_staffsavvy: boolean;
};

export default async function ApplyJobPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug: rawSlug } = await params;
  const jobSlug = rawSlug?.trim();
  if (!jobSlug) notFound();

  const h = await headers();
  const orgSlug = h.get('x-campsite-org-slug')?.trim();
  if (!orgSlug) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? '';

  const { data, error } = await supabase.rpc('public_job_listing_by_slug', {
    p_org_slug: orgSlug,
    p_job_slug: jobSlug,
  });

  if (error || !data || !Array.isArray(data) || data.length === 0) {
    notFound();
  }

  const job = data[0] as PublicJobRow;
  await supabase.rpc('track_public_job_metric', {
    p_org_slug: orgSlug,
    p_job_slug: jobSlug,
    p_event_type: 'apply_start',
  });

  return (
    <ApplyJobFormClient
      jobSlug={jobSlug}
      listing={job}
      orgSlug={orgSlug}
      hostHeader={host}
      defaultEmail={user?.email ?? null}
      isAuthenticated={Boolean(user)}
    />
  );
}
