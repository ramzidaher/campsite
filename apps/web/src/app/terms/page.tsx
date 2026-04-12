import type { Metadata } from 'next';
import { LegalPolicyPublicLayout } from '@/components/legal/LegalPolicyPublicLayout';
import { headingsByDocFromPlatformSettings } from '@/lib/legal/publicLegalDocs';
import { loadPlatformLegalSettings } from '@/lib/legal/loadPlatformLegalSettings';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: 'Terms of service · Campsite',
  description: 'Terms of service for the Campsite app — Common Ground Studios Ltd',
};

export default async function TermsPage() {
  const supabase = await createClient();
  const s = await loadPlatformLegalSettings(supabase);
  const headingsByDoc = headingsByDocFromPlatformSettings(s);

  return (
    <LegalPolicyPublicLayout
      activeDoc="terms"
      title="Terms of service"
      bundleVersion={s.bundle_version}
      effectiveLabel={s.effective_label}
      markdown={s.terms_markdown}
      headingsByDoc={headingsByDoc}
    />
  );
}
