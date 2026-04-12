import type { Metadata } from 'next';
import { LegalPolicyPublicLayout } from '@/components/legal/LegalPolicyPublicLayout';
import { headingsByDocFromPlatformSettings } from '@/lib/legal/publicLegalDocs';
import { loadPlatformLegalSettings } from '@/lib/legal/loadPlatformLegalSettings';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: 'Data processing · Campsite',
  description: 'How Campsite processes personal data — Common Ground Studios Ltd',
};

export default async function DataProcessingPage() {
  const supabase = await createClient();
  const s = await loadPlatformLegalSettings(supabase);
  const headingsByDoc = headingsByDocFromPlatformSettings(s);

  return (
    <LegalPolicyPublicLayout
      activeDoc="data_processing"
      title="Data processing information"
      bundleVersion={s.bundle_version}
      effectiveLabel={s.effective_label}
      markdown={s.data_processing_markdown}
      headingsByDoc={headingsByDoc}
    />
  );
}
