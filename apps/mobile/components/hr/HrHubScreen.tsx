import { useCampsiteTheme } from '@campsite/ui';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AttendanceScreen } from '@/components/attendance/AttendanceScreen';
import { LeaveScreen } from '@/components/leave/LeaveScreen';
import { OnboardingScreen } from '@/components/onboarding/OnboardingScreen';
import { OneOnOneListScreen } from '@/components/one-on-one/OneOnOneListScreen';
import { PerformanceScreen } from '@/components/performance/PerformanceScreen';
import { TabSafeScreen } from '@/components/shell/TabSafeScreen';
import type { ProfileRow } from '@/lib/AuthContext';
import { getSupabase } from '@/lib/supabase';

type HrTab = 'leave' | 'attendance' | 'performance' | 'onboarding' | 'one_on_one';

export function HrHubScreen({ profile }: { profile: ProfileRow }) {
  const { tokens, scheme } = useCampsiteTheme();
  const isDark = scheme === 'dark';
  const [tab, setTab] = useState<HrTab>('leave');
  const [showOneOnOne, setShowOneOnOne] = useState(false);
  const [showAttendanceTab, setShowAttendanceTab] = useState(false);

  useEffect(() => {
    if (!profile.org_id) return;
    const supabase = getSupabase();
    void (async () => {
      const [a, b, hrRow] = await Promise.all([
        supabase.rpc('has_permission', {
          p_user_id: profile.id,
          p_org_id: profile.org_id,
          p_permission_key: 'one_on_one.view_own',
          p_context: {},
        }),
        supabase.rpc('has_permission', {
          p_user_id: profile.id,
          p_org_id: profile.org_id,
          p_permission_key: 'hr.view_records',
          p_context: {},
        }),
        supabase
          .from('employee_hr_records')
          .select('timesheet_clock_enabled')
          .eq('org_id', profile.org_id)
          .eq('user_id', profile.id)
          .maybeSingle(),
      ]);
      setShowOneOnOne(!!a.data || !!b.data);
      setShowAttendanceTab(Boolean(hrRow.data?.timesheet_clock_enabled));
    })();
  }, [profile.id, profile.org_id]);

  useEffect(() => {
    if (!showAttendanceTab && tab === 'attendance') setTab('leave');
  }, [showAttendanceTab, tab]);

  const tabs: { key: HrTab; label: string }[] = [
    { key: 'leave', label: 'Time off' },
    ...(showAttendanceTab ? [{ key: 'attendance' as const, label: 'Attendance' }] : []),
    { key: 'performance', label: 'Reviews' },
    ...(showOneOnOne ? [{ key: 'one_on_one' as const, label: '1:1' }] : []),
    { key: 'onboarding', label: 'Onboarding' },
  ];

  const barBg = isDark ? tokens.surface : '#ffffff';
  const border = isDark ? tokens.border : '#e8e8e8';
  const textPrimary = isDark ? tokens.textPrimary : '#121212';
  const textSecondary = isDark ? tokens.textSecondary : '#6b6b6b';
  const activePill = isDark ? 'rgba(255,255,255,0.1)' : '#f0eeea';

  return (
    <View style={{ flex: 1 }}>
      {/* Internal tab bar */}
      <View style={[styles.tabBar, { backgroundColor: barBg, borderBottomColor: border }]}>
        {tabs.map((t) => {
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
        {tab === 'attendance' && <AttendanceScreen profile={profile} />}
        {tab === 'performance' && <PerformanceScreen profile={profile} />}
        {tab === 'one_on_one' && <OneOnOneListScreen profile={profile} />}
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
