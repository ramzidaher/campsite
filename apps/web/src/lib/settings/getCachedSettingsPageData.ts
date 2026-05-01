import { cache } from 'react';

import type { LoginOrgOption } from '@/components/auth/LoginOrgChoiceModal';
import type { CelebrationMode, OrgCelebrationModeOverride } from '@/lib/holidayThemes';
import type { UiMode } from '@/lib/uiMode';
import { type TtlCacheEntry } from '@/lib/cache/readThroughTtlCache';
import {
  getOrLoadSharedCachedValue,
  invalidateSharedCache,
  registerSharedCacheStore,
} from '@/lib/cache/sharedCache';
import { getAuthUser } from '@/lib/supabase/getAuthUser';
import { createClient } from '@/lib/supabase/server';

export type SettingsIntegrationConnection = {
  connected: boolean;
  accountEmail: string | null;
  expiresAt: string | null;
};

export type SettingsIntegrationConnections = {
  googleCalendar: SettingsIntegrationConnection;
  googleSheets: SettingsIntegrationConnection;
  outlookCalendar: SettingsIntegrationConnection;
};

export type SettingsPageData = {
  currentOrgId: string | null;
  initialProfile: {
    full_name: string;
    preferred_name: string | null;
    pronouns: string | null;
    show_pronouns: boolean;
    avatar_url: string | null;
    role: string;
    accent_preset: string;
    color_scheme: string;
    celebration_mode: CelebrationMode | null;
    celebration_auto_enabled: boolean;
    ui_mode: UiMode | null;
    dnd_enabled: boolean;
    dnd_start: string | null;
    dnd_end: string | null;
    shift_reminder_before_minutes: number | null;
    rota_open_slot_alerts_enabled: boolean;
  };
  tenantOrgs: LoginOrgOption[] | null;
  orgCelebrationOverrides: OrgCelebrationModeOverride[];
  integrationConnections: SettingsIntegrationConnections;
};

const SETTINGS_PAGE_RESPONSE_CACHE_TTL_MS = Number.parseInt(
  process.env.CAMPSITE_SETTINGS_PAGE_RESPONSE_CACHE_TTL_MS ?? '30000',
  10
);
const settingsPageResponseCache = new Map<string, TtlCacheEntry<SettingsPageData | null>>();
const settingsPageInFlight = new Map<string, Promise<SettingsPageData | null>>();
registerSharedCacheStore('campsite:settings:page', settingsPageResponseCache, settingsPageInFlight);

function getSettingsPageCacheKey(userId: string): string {
  return `user:${userId}`;
}

export async function invalidateSettingsPageDataForUser(userId: string): Promise<void> {
  await invalidateSharedCache('campsite:settings:page', getSettingsPageCacheKey(userId));
}

export const getCachedSettingsPageData = cache(async (): Promise<SettingsPageData | null> => {
  const user = await getAuthUser();
  if (!user) return null;
  return getOrLoadSharedCachedValue({
    cache: settingsPageResponseCache,
    inFlight: settingsPageInFlight,
    key: getSettingsPageCacheKey(user.id),
    cacheNamespace: 'campsite:settings:page',
    ttlMs: SETTINGS_PAGE_RESPONSE_CACHE_TTL_MS,
    load: async () => {
      const supabase = await createClient();
      const { data: profile } = await supabase
        .from('profiles')
        .select(
          'full_name,preferred_name,pronouns,show_pronouns,avatar_url,role,accent_preset,color_scheme,celebration_mode,celebration_auto_enabled,ui_mode,dnd_enabled,dnd_start,dnd_end,shift_reminder_before_minutes,rota_open_slot_alerts_enabled,org_id'
        )
        .eq('id', user.id)
        .maybeSingle();

      let tenantOrgs: LoginOrgOption[] | null = null;
      const { data: memRows, error: memErr } = await supabase
        .from('user_org_memberships')
        .select('org_id, organisations(name, slug)')
        .eq('user_id', user.id);
      if (!memErr && memRows?.length) {
        tenantOrgs = memRows
          .map((r) => {
            const o = r.organisations as { name?: string; slug?: string } | null;
            return {
              org_id: r.org_id as string,
              name: o?.name?.trim() || 'Organisation',
              slug: o?.slug?.trim() || '',
            };
          })
          .sort((a, b) => a.name.localeCompare(b.name));
      }

      const orgId = profile?.org_id as string | undefined;
      let orgCelebrationOverrides: OrgCelebrationModeOverride[] = [];
      if (orgId) {
        const { data: celebrationRows } = await supabase
          .from('org_celebration_modes')
          .select(
            'mode_key,label,is_enabled,display_order,auto_start_month,auto_start_day,auto_end_month,auto_end_day,gradient_override,emoji_primary,emoji_secondary'
          )
          .eq('org_id', orgId)
          .order('display_order', { ascending: true })
          .order('label', { ascending: true });
        orgCelebrationOverrides = (celebrationRows ?? []) as OrgCelebrationModeOverride[];
      }

      const defaultConnection: SettingsIntegrationConnection = {
        connected: false,
        accountEmail: null,
        expiresAt: null,
      };
      const integrationConnections: SettingsIntegrationConnections = {
        googleCalendar: { ...defaultConnection },
        googleSheets: { ...defaultConnection },
        outlookCalendar: { ...defaultConnection },
      };

      const [{ data: googleRows }, { data: outlookRow }] = await Promise.all([
        supabase
          .from('google_connections')
          .select('type, google_email, expires_at')
          .eq('user_id', user.id)
          .in('type', ['calendar', 'sheets']),
        supabase
          .from('microsoft_connections')
          .select('microsoft_email, expires_at')
          .eq('user_id', user.id)
          .maybeSingle(),
      ]);

      for (const row of googleRows ?? []) {
        const next: SettingsIntegrationConnection = {
          connected: true,
          accountEmail: (row.google_email as string | null) ?? null,
          expiresAt: (row.expires_at as string | null) ?? null,
        };
        if (row.type === 'calendar') integrationConnections.googleCalendar = next;
        if (row.type === 'sheets') integrationConnections.googleSheets = next;
      }

      if (outlookRow) {
        integrationConnections.outlookCalendar = {
          connected: true,
          accountEmail: (outlookRow.microsoft_email as string | null) ?? null,
          expiresAt: (outlookRow.expires_at as string | null) ?? null,
        };
      }

      return {
        currentOrgId: (profile?.org_id as string | null) ?? null,
        initialProfile: {
          full_name:
            profile?.full_name ??
            user.user_metadata?.full_name ??
            user.email?.split('@')[0] ??
            'Member',
          preferred_name: profile?.preferred_name ?? null,
          pronouns: profile?.pronouns ?? null,
          show_pronouns: profile?.show_pronouns ?? false,
          avatar_url: profile?.avatar_url ?? null,
          role: profile?.role ?? 'unassigned',
          accent_preset: profile?.accent_preset ?? 'midnight',
          color_scheme: profile?.color_scheme ?? 'system',
          celebration_mode: (profile?.celebration_mode as CelebrationMode | null) ?? null,
          celebration_auto_enabled: profile?.celebration_auto_enabled ?? true,
          ui_mode: (profile?.ui_mode as UiMode | null) ?? 'classic',
          dnd_enabled: profile?.dnd_enabled ?? false,
          dnd_start: profile?.dnd_start ?? null,
          dnd_end: profile?.dnd_end ?? null,
          shift_reminder_before_minutes: profile?.shift_reminder_before_minutes ?? null,
          rota_open_slot_alerts_enabled: profile?.rota_open_slot_alerts_enabled ?? false,
        },
        tenantOrgs,
        orgCelebrationOverrides,
        integrationConnections,
      };
    },
  });
});
