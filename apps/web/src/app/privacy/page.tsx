import type { Metadata } from 'next';
import { LegalPolicyPublicLayout } from '@/components/legal/LegalPolicyPublicLayout';
import { headingsByDocFromPlatformSettings } from '@/lib/legal/publicLegalDocs';
import { loadPlatformLegalSettings } from '@/lib/legal/loadPlatformLegalSettings';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: 'Privacy · Campsite',
  description: 'Privacy information for the Campsite app - Common Ground Studios Ltd',
};

export default async function PrivacyPage() {
  const supabase = await createClient();
  const s = await loadPlatformLegalSettings(supabase);
  const headingsByDoc = headingsByDocFromPlatformSettings(s);

  return (
    <LegalPolicyPublicLayout
      activeDoc="privacy"
      title="Privacy policy"
      bundleVersion={s.bundle_version}
      effectiveLabel={s.effective_label}
      markdown={s.privacy_markdown}
      headingsByDoc={headingsByDoc}
    />
  );
}
