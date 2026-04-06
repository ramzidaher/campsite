import { useCampsiteTheme } from '@campsite/ui';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { LeaveScreen } from '@/components/leave/LeaveScreen';
import { OnboardingScreen } from '@/components/onboarding/OnboardingScreen';
import { PerformanceScreen } from '@/components/performance/PerformanceScreen';
import { TabSafeScreen } from '@/components/shell/TabSafeScreen';
import type { ProfileRow } from '@/lib/AuthContext';

type HrTab = 'leave' | 'performance' | 'onboarding';

const TABS: { key: HrTab; label: string }[] = [
  { key: 'leave', label: 'Time off' },
  { key: 'performance', label: 'Reviews' },
  { key: 'onboarding', label: 'Onboarding' },
];

export function HrHubScreen({ profile }: { profile: ProfileRow }) {
  const { tokens, scheme } = useCampsiteTheme();
  const isDark = scheme === 'dark';
  const [tab, setTab] = useState<HrTab>('leave');

  const barBg = isDark ? tokens.surface : '#ffffff';
  const border = isDark ? tokens.border : '#e8e8e8';
  const textPrimary = isDark ? tokens.textPrimary : '#121212';
  const textSecondary = isDark ? tokens.textSecondary : '#6b6b6b';
  const activePill = isDark ? 'rgba(255,255,255,0.1)' : '#f0eeea';

  return (
    <View style={{ flex: 1 }}>
      {/* Internal tab bar */}
      <View style={[styles.tabBar, { backgroundColor: barBg, borderBottomColor: border }]}>
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <Pressable
              key={t.key}
              style={[styles.tabItem, active && [styles.tabItemActive, { backgroundColor: activePill }]]}
              onPress={() => setTab(t.key)}
            >
              <Text style={[styles.tabLabel, { color: active ? textPrimary : textSecondary, fontWeight: active ? '600' : '400' }]}>
                {t.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* Content — each screen manages its own scroll + loading */}
      <View style={{ flex: 1 }}>
        {tab === 'leave' && <LeaveScreen profile={profile} />}
        {tab === 'performance' && <PerformanceScreen profile={profile} />}
        {tab === 'onboarding' && <OnboardingScreen profile={profile} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: 8,
  },
  tabItemActive: {},
  tabLabel: { fontSize: 13 },
});
