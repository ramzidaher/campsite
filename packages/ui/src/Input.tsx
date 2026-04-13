import React from 'react';
import { StyleSheet, Text, TextInput, type TextInputProps, View } from 'react-native';
import { useCampsiteTheme } from './ThemeProvider';

export interface InputProps extends TextInputProps {
  label?: string;
  hint?: string;
  error?: string;
  secureTextEntry?: boolean;
}

export function Input({ label, hint, error, style, secureTextEntry, ...rest }: InputProps) {
  const { tokens } = useCampsiteTheme();

  return (
    <View style={styles.wrap}>
      {label ? (
        <Text style={[styles.label, { color: tokens.textSecondary }]} accessibilityRole="text">
          {label}
        </Text>
      ) : null}
      <TextInput
        accessibilityLabel={label}
        accessibilityHint={hint}
        placeholderTextColor={tokens.textMuted}
        secureTextEntry={secureTextEntry}
        style={[
          styles.input,
          {
            color: tokens.textPrimary,
            backgroundColor: tokens.surface,
            borderColor: error ? tokens.warning : tokens.border,
          },
          style,
        ]}
        {...rest}
      />
      {hint && !error ? (
        <Text style={[styles.hint, { color: tokens.textMuted }]} accessibilityRole="text">
          {hint}
        </Text>
      ) : null}
      {error ? (
        <Text style={[styles.error, { color: tokens.warning }]} accessibilityRole="alert">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6, width: '100%' },
  label: { fontSize: 14, fontWeight: '500' },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    fontSize: 16,
    minHeight: 44,
  },
  hint: { fontSize: 12 },
  error: { fontSize: 13 },
});
