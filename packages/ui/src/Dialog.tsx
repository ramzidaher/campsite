import React, { useId } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ModalProps,
} from 'react-native';
import { useCampsiteTheme } from './ThemeProvider';
import { Button } from './Button';

export interface DialogProps extends Pick<ModalProps, 'visible' | 'onRequestClose'> {
  title: string;
  children: React.ReactNode;
  primaryLabel?: string;
  onPrimary?: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
}

/** Cross-platform dialog using RN Modal (maps to dialog semantics on web via RN-web). */
export function Dialog({
  visible,
  onRequestClose,
  title,
  children,
  primaryLabel = 'OK',
  onPrimary,
  secondaryLabel,
  onSecondary,
}: DialogProps) {
  const { tokens } = useCampsiteTheme();
  const titleId = useId();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onRequestClose}
      accessibilityViewIsModal
    >
      <Pressable
        style={[styles.backdrop, { backgroundColor: 'rgba(0,0,0,0.45)' }]}
        onPress={onRequestClose}
        accessibilityRole="button"
        accessibilityLabel="Close dialog"
      >
        <Pressable
          style={[styles.sheet, { backgroundColor: tokens.surface, borderColor: tokens.border }]}
          onPress={(e) => e.stopPropagation()}
          accessibilityRole="dialog"
          accessibilityLabel={title}
          aria-modal="true"
          aria-labelledby={titleId}
        >
          <Text nativeID={titleId} style={[styles.title, { color: tokens.textPrimary }]} accessibilityRole="header">
            {title}
          </Text>
          <View style={styles.body}>{children}</View>
          <View style={styles.actions}>
            {secondaryLabel ? (
              <Button variant="ghost" onPress={onSecondary}>
                {secondaryLabel}
              </Button>
            ) : null}
            <Button variant="primary" onPress={onPrimary ?? onRequestClose}>
              {primaryLabel}
            </Button>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
  sheet: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    maxWidth: 480,
    width: '100%',
    alignSelf: 'center',
  },
  title: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  body: { marginBottom: 16 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, flexWrap: 'wrap' },
});
