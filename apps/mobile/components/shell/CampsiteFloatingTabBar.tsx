import { Ionicons } from '@expo/vector-icons';
import { useCampsiteTheme } from '@campsite/ui';
import {
  BottomTabBarHeightCallbackContext,
  type BottomTabBarProps,
} from '@react-navigation/bottom-tabs';
import { useCallback, useContext } from 'react';
import { type LayoutChangeEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { mainShell } from '@/constants/mainShell';

const FLOATING_GAP = 8;
const HORIZONTAL_MARGIN = 14;
const ROW_MIN_HEIGHT = 52;
const ICON_SIZE = 22;

type Ion = keyof typeof Ionicons.glyphMap;

interface TabSpec {
  name: string;
  label: string;
  icon: Ion;
  iconFilled: Ion;
}

const TABS: TabSpec[] = [
  { name: 'index', label: 'Home', icon: 'home-outline', iconFilled: 'home' },
  { name: 'broadcasts', label: 'Broadcasts', icon: 'megaphone-outline', iconFilled: 'megaphone' },
  { name: 'calendar', label: 'Calendar', icon: 'calendar-outline', iconFilled: 'calendar' },
  { name: 'rota', label: 'Rota', icon: 'clipboard-outline', iconFilled: 'clipboard' },
  { name: 'discount', label: 'Discount', icon: 'pricetag-outline', iconFilled: 'pricetag' },
];

/** Tab bar region height (navigator reserves this; no extra screen padding needed). */
export function campsiteAndroidFloatingTabBarSlotHeight(bottomInset: number): number {
  return ROW_MIN_HEIGHT + Math.max(bottomInset, FLOATING_GAP) + FLOATING_GAP + 4;
}

/**
 * Single floating pill tab bar (Android). Campsite paper chrome; no center FAB.
 */
export function CampsiteFloatingTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const onTabBarHeightChange = useContext(BottomTabBarHeightCallbackContext);
  const { tokens, scheme } = useCampsiteTheme();
  const isDark = scheme === 'dark';

  const activeRouteName = state.routes[state.index]?.name ?? 'index';

  const barBg = isDark ? 'rgba(18,18,18,0.92)' : 'rgba(250,249,246,0.96)';
  const pillBg = isDark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.07)';
  const inactive = tokens.textSecondary;
  const selectedLabel = isDark ? tokens.textPrimary : mainShell.pageText;
  const activeIcon = isDark ? tokens.textPrimary : mainShell.pageText;

  /** Must match `tabBarStyle.height` in `_layout.android.tsx` — never use `flex:1` here (it splits the screen with the tab scenes). */
  const slotHeight = campsiteAndroidFloatingTabBarSlotHeight(insets.bottom);

  const reportHeight = useCallback(
    (e: LayoutChangeEvent) => {
      onTabBarHeightChange?.(e.nativeEvent.layout.height);
    },
    [onTabBarHeightChange],
  );

  const handlePress = (name: string) => {
    const route = state.routes.find((r) => r.name === name);
    if (!route) return;
    navigation.navigate(route.name as never);
  };

  const lift = Math.max(insets.bottom, FLOATING_GAP) + FLOATING_GAP;

  return (
    <View style={[styles.barSlot, { height: slotHeight }]} onLayout={reportHeight}>
      <View style={[styles.inner, { paddingHorizontal: HORIZONTAL_MARGIN, marginBottom: lift }]}>
        <View style={[styles.segment, { minHeight: ROW_MIN_HEIGHT }]}>
          <View style={[styles.surface, { backgroundColor: barBg }]} pointerEvents="none" />
          {TABS.map((tab) => {
            const isActive = activeRouteName === tab.name;
            const iconName = isActive ? tab.iconFilled : tab.icon;
            const iconColor = isActive ? activeIcon : inactive;
            const labelColor = isActive ? selectedLabel : inactive;
            const content = (
              <>
                <Ionicons name={iconName} size={ICON_SIZE} color={iconColor} />
                <Text
                  style={[styles.label, { color: labelColor }]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.75}
                >
                  {tab.label}
                </Text>
              </>
            );
            return (
              <Pressable
                key={tab.name}
                style={styles.item}
                onPress={() => handlePress(tab.name)}
                android_ripple={{ color: 'rgba(0,0,0,0.08)' }}
              >
                {isActive ? (
                  <View style={[styles.pill, { backgroundColor: pillBg }]}>{content}</View>
                ) : (
                  content
                )}
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  barSlot: {
    width: '100%',
    alignSelf: 'stretch',
    justifyContent: 'flex-end',
  },
  inner: {
    width: '100%',
  },
  segment: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderRadius: 999,
    overflow: 'hidden',
    paddingVertical: 6,
    elevation: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
  },
  surface: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 999,
  },
  item: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
    gap: 2,
  },
  pill: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    paddingHorizontal: 6,
    paddingVertical: 4,
    gap: 2,
    alignSelf: 'stretch',
    maxWidth: '100%',
  },
  label: {
    fontSize: 10,
    fontWeight: '600',
    textAlign: 'center',
  },
});
