import type { LoginOrgOption } from '@/components/auth/LoginOrgChoiceModal';
import { ProfileSettings } from '@/components/ProfileSettings';
import { getCelebrationModeOptions, type OrgCelebrationModeOverride } from '@/lib/holidayThemes';
import { getCachedSettingsPageData } from '@/lib/settings/getCachedSettingsPageData';
import { redirect } from 'next/navigation';

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{
    google_connected?: string;
    google_error?: string;
    outlook_connected?: string;
    outlook_error?: string;
  }>;
}) {
  const sp = await searchParams;
  const googleFlash =
    sp.google_connected === '1'
      ? 'Google account connected.'
      : sp.google_error
        ? `Google: ${sp.google_error}`
        : null;
  const googleFlashTone =
    sp.google_connected === '1'
      ? ('success' as const)
      : sp.google_error
        ? ('error' as const)
        : null;
  const outlookFlash =
    sp.outlook_connected === '1'
      ? 'Outlook Calendar connected.'
      : sp.outlook_error
        ? `Outlook: ${sp.outlook_error}`
        : null;
  const outlookFlashTone =
    sp.outlook_connected === '1'
      ? ('success' as const)
      : sp.outlook_error
        ? ('error' as const)
        : null;
  const pageData = await getCachedSettingsPageData();
  if (!pageData) redirect('/login');
  const initialProfile = pageData.initialProfile;
  const tenantOrgs: LoginOrgOption[] | null = pageData.tenantOrgs;
  const orgCelebrationOverrides: OrgCelebrationModeOverride[] = pageData.orgCelebrationOverrides;

  return (
    <div className="mx-auto max-w-4xl px-5 pb-10 pt-6 sm:px-[28px]">
      <header className="mb-7">
        <h1 className="font-authSerif text-[22px] tracking-tight text-[#121212]">Settings</h1>
        <p className="mt-1 text-[13px] text-[#6b6b6b]">
          Manage your profile, preferences, and account security.
        </p>
      </header>
      <ProfileSettings
        googleFlash={googleFlash}
        googleFlashTone={googleFlashTone}
        outlookFlash={outlookFlash}
        outlookFlashTone={outlookFlashTone}
        initialIntegrationConnections={pageData.integrationConnections}
        tenantOrgs={tenantOrgs}
        currentOrgId={pageData.currentOrgId}
        initial={initialProfile}
        initialBroadcastChannels={[]}
        canManageDiscounts={false}
        celebrationModeOptions={getCelebrationModeOptions(orgCelebrationOverrides)}
      />
    </div>
  );
}
