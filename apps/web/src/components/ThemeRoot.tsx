'use client';

import { ThemeProvider, ToastProvider } from '@campsite/ui';
import { useEffect, useState } from 'react';

export function ThemeRoot({ children }: { children: React.ReactNode }) {
  const [scheme, setScheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => setScheme(mq.matches ? 'dark' : 'light');
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  return (
    <ThemeProvider scheme={scheme} accent="ocean">
      <ToastProvider>{children}</ToastProvider>
    </ThemeProvider>
  );
}
