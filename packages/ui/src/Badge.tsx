import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useCampsiteTheme } from './ThemeProvider';

export type BadgeTone = 'neutral' | 'success' | 'warning' | 'accent';

export interface BadgeProps {
  children: React.ReactNode;
  tone?: BadgeTone;
}

export function Badge({ children, tone = 'neutral' }: BadgeProps) {
  const { tokens } = useCampsiteTheme();

  const bg =
    tone === 'success'
      ? tokens.success
      : tone === 'warning'
        ? tokens.warning
        : tone === 'accent'
          ? tokens.accent
          : tokens.border;

  const fg =
    tone === 'neutral' ? tokens.textPrimary : tone === 'warning' ? '#ffffff' : '#ffffff';

  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      <Text style={[styles.text, { color: fg }]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  text: { fontSize: 12, fontWeight: '600' },
});
