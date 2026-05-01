import { cache } from 'react';
import { withServerPerf } from '@/lib/perf/serverPerf';
import { getCachedHrEmployeeFile } from '@/lib/profile/getCachedHrEmployeeFile';
import { getCachedProfileOtherTabData } from '@/lib/profile/getCachedProfileOtherTabData';
import { getCachedProfileOverviewData } from '@/lib/profile/getCachedProfileOverviewData';
import { getCachedProfilePersonalTabData } from '@/lib/profile/getCachedProfilePersonalTabData';
import { createClient } from '@/lib/supabase/server';

export async function updateProfileUiMode(userId: string, mode: 'interactive' | 'classic'): Promise<void> {
  const supabase = await createClient();
  await supabase.from('profiles').update({ ui_mode: mode }).eq('id', userId);
}

export async function getProfilePageIdentityData({
  userId,
  shellBundle,
}: {
  userId: string;
  shellBundle: Record<string, unknown> | null;
}): Promise<{
  profile: {
    org_id: string | null;
    status: string | null;
    full_name: string | null;
    preferred_name: string | null;
    email: string | null;
    avatar_url: string | null;
    role: string | null;
    pronouns: string | null;
    show_pronouns: boolean;
    reports_to_user_id: string | null;
    ui_mode: string | null;
  } | null;
  shellOrgId: string | null;
  shellPermissions: string[] | null;
}> {
  const shellOrgId =
    shellBundle && typeof shellBundle.org_id === 'string' ? shellBundle.org_id : null;
  const shellPermissions = Array.isArray(shellBundle?.permission_keys)
    ? shellBundle.permission_keys.map((key) => String(key))
    : null;

  const profileFromShell =
    shellBundle &&
    typeof shellBundle.profile_full_name === 'string' &&
    typeof shellBundle.email === 'string'
      ? {
          org_id: shellOrgId,
          status: 'active',
          full_name: shellBundle.profile_full_name,
          preferred_name:
            typeof shellBundle.profile_preferred_name === 'string'
              ? shellBundle.profile_preferred_name
              : null,
          email: shellBundle.email,
          avatar_url:
            typeof shellBundle.profile_avatar_url === 'string'
              ? shellBundle.profile_avatar_url
              : null,
          role:
            typeof shellBundle.profile_role === 'string'
              ? shellBundle.profile_role
              : null,
          pronouns: null,
          show_pronouns: false,
          reports_to_user_id: null,
          ui_mode:
            typeof shellBundle.ui_mode === 'string' ? shellBundle.ui_mode : null,
        }
      : null;

  const supabase = await createClient();
  const { data: uiModeRow } = await withServerPerf(
    '/profile',
    'profile_ui_mode_lookup',
    supabase.from('profiles').select('ui_mode').eq('id', userId).maybeSingle(),
    250
  );
  const latestUiMode = (uiModeRow?.ui_mode as string | null) ?? null;

  if (profileFromShell) {
    return {
      profile: {
        ...profileFromShell,
        ui_mode: latestUiMode ?? profileFromShell.ui_mode,
      },
      shellOrgId,
      shellPermissions,
    };
  }
  const { data: profile } = await withServerPerf(
    '/profile',
    'profile_lookup',
    supabase
      .from('profiles')
      .select(
        'org_id, status, full_name, preferred_name, email, avatar_url, role, pronouns, show_pronouns, reports_to_user_id, ui_mode'
      )
      .eq('id', userId)
      .maybeSingle(),
    300
  );

  return {
    profile: profile
      ? {
          org_id: (profile.org_id as string | null) ?? null,
          status: (profile.status as string | null) ?? null,
          full_name: (profile.full_name as string | null) ?? null,
          preferred_name: (profile.preferred_name as string | null) ?? null,
          email: (profile.email as string | null) ?? null,
          avatar_url: (profile.avatar_url as string | null) ?? null,
          role: (profile.role as string | null) ?? null,
          pronouns: (profile.pronouns as string | null) ?? null,
          show_pronouns: Boolean(profile.show_pronouns),
          reports_to_user_id: (profile.reports_to_user_id as string | null) ?? null,
          ui_mode: (profile.ui_mode as string | null) ?? null,
        }
      : null,
    shellOrgId,
    shellPermissions,
  };
}

export async function getProfilePageSectionsData({
  orgId,
  userId,
  needsOnboardingCount,
  needsOtherTabData,
  needsUpcomingData,
  needsRoleData,
}: {
  orgId: string;
  userId: string;
  needsOnboardingCount: boolean;
  needsOtherTabData: boolean;
  needsUpcomingData: boolean;
  needsRoleData: boolean;
}) {
  const [fileRows, profileOverviewData, otherTabData, personalTabData] = await Promise.all([
    withServerPerf('/profile', 'rpc_hr_employee_file', getCachedHrEmployeeFile(orgId, userId), 450),
    withServerPerf(
      '/profile',
      'cached_profile_overview_data',
      getCachedProfileOverviewData(orgId, userId, needsOnboardingCount),
      650
    ),
    needsOtherTabData
      ? withServerPerf(
          '/profile',
          'cached_profile_other_tab_data',
          getCachedProfileOtherTabData(orgId, userId),
          650
        )
      : Promise.resolve({
          ownDocs: [],
          ownDependants: [],
          ownBankRows: [],
          ownUkTaxRows: [],
          ownTaxDocs: [],
          ownEmploymentHistory: [],
          ownCases: [],
          ownCaseEvents: [],
          ownMedical: [],
          ownMedicalEvents: [],
          ownCustomDefs: [],
          ownCustomValues: [],
          ownTrainingRows: [],
          partialSections: [],
        }),
    needsUpcomingData || needsRoleData
      ? withServerPerf(
          '/profile',
          'cached_profile_personal_tab_data',
          getCachedProfilePersonalTabData(orgId, userId, needsUpcomingData, needsRoleData),
          650
        )
      : Promise.resolve({
          upcomingHolidayPeriods: [],
          ownRoleLabelsRaw: [],
          partialSections: [],
        }),
  ]);

  return { fileRows, profileOverviewData, otherTabData, personalTabData };
}

export const getCachedProfilePageIdentityData = cache(
  async (userId: string, shellBundle: Record<string, unknown> | null) => {
    return getProfilePageIdentityData({ userId, shellBundle });
  }
);

export const getCachedProfilePageSectionsData = cache(async ({
  orgId,
  userId,
  needsOnboardingCount,
  needsOtherTabData,
  needsUpcomingData,
  needsRoleData,
}: {
  orgId: string;
  userId: string;
  needsOnboardingCount: boolean;
  needsOtherTabData: boolean;
  needsUpcomingData: boolean;
  needsRoleData: boolean;
}) => {
  return getProfilePageSectionsData({
    orgId,
    userId,
    needsOnboardingCount,
    needsOtherTabData,
    needsUpcomingData,
    needsRoleData,
  });
});
