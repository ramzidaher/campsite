'use client';

import { NetworkStatusBanner } from '@/components/providers/NetworkStatusBanner';
import { OfflineReadQueueSync } from '@/components/providers/OfflineReadQueueSync';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

export function MainProviders({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000,
            gcTime: 5 * 60_000,
            refetchOnWindowFocus: true,
            retry: 1,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <NetworkStatusBanner />
      <OfflineReadQueueSync />
      {children}
    </QueryClientProvider>
  );
}
