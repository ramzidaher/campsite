import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useCampsiteTheme } from './ThemeProvider';

type ToastItem = { id: string; message: string };

interface ToastContextValue {
  show: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const { tokens } = useCampsiteTheme();

  const show = useCallback((message: string) => {
    const id = `${Date.now()}-${Math.random()}`;
    setItems((prev) => [...prev, { id, message }]);
    setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const value = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <View
        style={[styles.stack, StyleSheet.absoluteFillObject, { pointerEvents: 'box-none' }]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {items.map((t) => (
          <View
            key={t.id}
            style={[styles.snack, { backgroundColor: tokens.textPrimary, borderColor: tokens.border }]}
            accessibilityRole="alert"
          >
            <Text style={[styles.snackText, { color: tokens.background }]}>{t.message}</Text>
            <Pressable
              accessibilityLabel="Dismiss"
              onPress={() => setItems((prev) => prev.filter((x) => x.id !== t.id))}
            >
              <Text style={[styles.dismiss, { color: tokens.background }]}>×</Text>
            </Pressable>
          </View>
        ))}
      </View>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return ctx;
}

const styles = StyleSheet.create({
  stack: {
    justifyContent: 'flex-end',
    padding: 16,
    gap: 8,
  },
  snack: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
  },
  snackText: { flex: 1, fontSize: 15 },
  dismiss: { fontSize: 22, lineHeight: 22, paddingHorizontal: 4 },
});
