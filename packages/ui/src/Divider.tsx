import React from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';
import { useCampsiteTheme } from './ThemeProvider';

export interface DividerProps extends ViewProps {
  vertical?: boolean;
}

export function Divider({ vertical, style, ...rest }: DividerProps) {
  const { tokens } = useCampsiteTheme();
  return (
    <View
      accessibilityRole="none"
      style={[
        vertical ? styles.vertical : styles.horizontal,
        { backgroundColor: tokens.border },
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  horizontal: { height: StyleSheet.hairlineWidth, width: '100%' },
  vertical: { width: StyleSheet.hairlineWidth, alignSelf: 'stretch' },
});
