import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useCampsiteTheme } from './ThemeProvider';
import { Button } from './Button';

export interface EmptyStateProps {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ title, description, actionLabel, onAction }: EmptyStateProps) {
  const { tokens } = useCampsiteTheme();

  return (
    <View style={styles.wrap} accessibilityRole="text">
      <View style={[styles.icon, { borderColor: tokens.border, backgroundColor: tokens.surface }]}>
        <Text style={{ fontSize: 28 }} accessibilityElementsHidden>
          ◎
        </Text>
      </View>
      <Text style={[styles.title, { color: tokens.textPrimary }]}>{title}</Text>
      {description ? (
        <Text style={[styles.desc, { color: tokens.textSecondary }]}>{description}</Text>
      ) : null}
      {actionLabel && onAction ? (
        <View style={styles.cta}>
          <Button onPress={onAction}>{actionLabel}</Button>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 24,
    gap: 8,
  },
  icon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  title: { fontSize: 18, fontWeight: '700', textAlign: 'center' },
  desc: { fontSize: 15, textAlign: 'center', maxWidth: 320 },
  cta: { marginTop: 12, width: '100%', maxWidth: 280 },
});
