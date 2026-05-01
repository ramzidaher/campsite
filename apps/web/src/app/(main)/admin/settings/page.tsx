import { OrgSettingsClient } from '@/components/admin/OrgSettingsClient';
import { getCachedAdminSettingsPageData } from '@/lib/admin/getCachedAdminSettingsPageData';
import { hasPermission } from '@/lib/adminGates';
import { parseShellPermissionKeys, shellBundleOrgId, shellBundleProfileStatus } from '@/lib/shell/shellBundleAccess';
import { getCachedMainShellLayoutBundle } from '@/lib/supabase/cachedMainShellLayoutBundle';
import { redirect } from 'next/navigation';

export default async function OrgAdminSettingsPage() {
  const bundle = await getCachedMainShellLayoutBundle();
  const orgId = shellBundleOrgId(bundle);
  if (!orgId) redirect('/login');
  if (shellBundleProfileStatus(bundle) !== 'active') redirect('/broadcasts');
  const permissionKeys = parseShellPermissionKeys(bundle);
  if (!hasPermission(permissionKeys, 'roles.manage')) redirect('/admin');

  const pageData = await getCachedAdminSettingsPageData(orgId);
  const org = pageData.org;
  const orgCelebrationModes = pageData.orgCelebrationModes;

  if (!org) redirect('/admin');

  return (
    <OrgSettingsClient
      initial={{
        id: org.id as string,
        name: org.name as string,
        slug: org.slug as string,
        logo_url: (org.logo_url as string | null) ?? null,
        default_notifications_enabled: org.default_notifications_enabled as boolean,
        deactivation_requested_at: (org.deactivation_requested_at as string | null) ?? null,
        timezone: (org.timezone as string | null) ?? null,
        brand_preset_key: (org.brand_preset_key as string | null) ?? null,
        brand_tokens: (org.brand_tokens as Record<string, string> | null) ?? null,
        brand_policy: (org.brand_policy as string | null) ?? null,
      }}
      initialCelebrationModes={
        (orgCelebrationModes ?? []) as Array<{
          id: string;
          mode_key: string;
          label: string;
          is_enabled: boolean;
          display_order: number;
          auto_start_month: number | null;
          auto_start_day: number | null;
          auto_end_month: number | null;
          auto_end_day: number | null;
          gradient_override: string | null;
          emoji_primary: string | null;
          emoji_secondary: string | null;
        }>
      }
    />
  );
}
