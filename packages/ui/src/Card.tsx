import React from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';
import { useCampsiteTheme } from './ThemeProvider';

export interface CardProps extends ViewProps {
  children: React.ReactNode;
}

export function Card({ children, style, ...rest }: CardProps) {
  const { tokens } = useCampsiteTheme();
  return (
    <View
      style={[styles.card, { backgroundColor: tokens.surface, borderColor: tokens.border }, style]}
      {...rest}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
  },
});
