import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useCampsiteTheme } from './ThemeProvider';

export interface AvatarProps {
  /** Remote or local URI */
  uri?: string | null;
  name?: string;
  size?: number;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return `${parts[0]![0]}${parts[parts.length - 1]![0]}`.toUpperCase();
}

export function Avatar({ uri, name = '', size = 40 }: AvatarProps) {
  const { tokens } = useCampsiteTheme();
  const label = initials(name);

  return (
    <View
      accessibilityLabel={name ? `Avatar for ${name}` : 'Avatar'}
      style={[
        styles.base,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: tokens.surface,
          borderColor: tokens.border,
        },
      ]}
    >
      {uri ? (
        <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} />
      ) : (
        <Text style={[styles.initials, { color: tokens.textSecondary, fontSize: size * 0.35 }]}>
          {label}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    borderWidth: 1,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: { fontWeight: '700' },
});
