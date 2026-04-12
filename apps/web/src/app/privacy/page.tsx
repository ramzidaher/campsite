import type { Metadata } from 'next';
import { LegalPolicyPageShell } from '@/components/legal/LegalPolicyPageShell';
import { loadPlatformLegalSettings } from '@/lib/legal/loadPlatformLegalSettings';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = {
  title: 'Privacy · Campsite',
  description: 'Privacy information for the Campsite app - Common Ground Studios Ltd',
};

export default async function PrivacyPage() {
  const supabase = await createClient();
  const s = await loadPlatformLegalSettings(supabase);

  return (
    <LegalPolicyPageShell
      title="Privacy policy"
      bundleVersion={s.bundle_version}
      effectiveLabel={s.effective_label}
      markdown={s.privacy_markdown}
    />
  );
}
