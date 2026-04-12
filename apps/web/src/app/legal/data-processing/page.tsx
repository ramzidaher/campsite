import type { Metadata } from 'next';
import { LegalPolicyPageShell } from '@/components/legal/LegalPolicyPageShell';
import { loadPlatformLegalSettings } from '@/lib/legal/loadPlatformLegalSettings';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: 'Data processing · Campsite',
  description: 'How Campsite processes personal data — Common Ground Studios Ltd',
};

export default async function DataProcessingPage() {
  const supabase = await createClient();
  const s = await loadPlatformLegalSettings(supabase);

  return (
    <LegalPolicyPageShell
      title="Data processing information"
      bundleVersion={s.bundle_version}
      effectiveLabel={s.effective_label}
      markdown={s.data_processing_markdown}
    />
  );
}
