import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  type PressableProps,
  type PressableStateCallbackType,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useCampsiteTheme } from './ThemeProvider';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive';

export interface ButtonProps extends Omit<PressableProps, 'children'> {
  children: React.ReactNode;
  variant?: ButtonVariant;
  loading?: boolean;
  loadingLabel?: string;
}

export function Button({
  children,
  variant = 'primary',
  loading,
  loadingLabel = 'Loading',
  disabled,
  style,
  accessibilityLabel,
  accessibilityState,
  ...rest
}: ButtonProps) {
  const { tokens } = useCampsiteTheme();
  const isDisabled = disabled || loading;

  const bg =
    variant === 'primary'
      ? tokens.accent
      : variant === 'secondary'
        ? tokens.surface
        : variant === 'destructive'
          ? tokens.warning
          : 'transparent';

  const fg =
    variant === 'primary' || variant === 'destructive'
      ? '#ffffff'
      : variant === 'secondary'
        ? tokens.textPrimary
        : tokens.accent;

  const borderColor =
    variant === 'secondary' ? tokens.border : variant === 'ghost' ? tokens.border : bg;

  const resolvedA11yLabel =
    accessibilityLabel ?? (typeof children === 'string' ? children : undefined);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={resolvedA11yLabel}
      accessibilityState={{
        ...(accessibilityState ?? {}),
        disabled: Boolean(isDisabled),
        busy: Boolean(loading),
      }}
      accessibilityHint={loading ? loadingLabel : undefined}
      disabled={isDisabled}
      style={(state: PressableStateCallbackType) => {
        const { pressed } = state;
        const user = typeof style === 'function' ? style(state) : style;
        return [
          styles.base,
          {
            backgroundColor: bg,
            borderColor,
            opacity: pressed ? 0.92 : isDisabled ? 0.5 : 1,
          },
          user,
        ];
      }}
      {...rest}
    >
      <View style={styles.inner}>
        {loading ? (
          <ActivityIndicator color={fg} />
        ) : typeof children === 'string' ? (
          <Text style={[styles.label, { color: fg }]}>{children}</Text>
        ) : (
          children
        )}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    minHeight: 44,
    justifyContent: 'center',
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
  },
});
