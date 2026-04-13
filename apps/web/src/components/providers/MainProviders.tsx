'use client';

import { NetworkStatusBanner } from '@/components/providers/NetworkStatusBanner';
import { OfflineReadQueueSync } from '@/components/providers/OfflineReadQueueSync';
import { ShellAutoRefresh } from '@/components/providers/ShellAutoRefresh';
import { TenantReauthEnforcer } from '@/components/providers/TenantReauthEnforcer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

export function MainProviders({
  children,
  reauthRequiredAt = null,
  skipTenantReauth = false,
}: {
  children: React.ReactNode;
  /** ISO timestamp from main_shell_layout_bundle.profile_reauth_required_at */
  reauthRequiredAt?: string | null;
  /** When true, do not force sign-out (e.g. platform operator). */
  skipTenantReauth?: boolean;
}) {
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
      <TenantReauthEnforcer reauthRequiredAt={reauthRequiredAt} skip={skipTenantReauth} />
      <NetworkStatusBanner />
      <OfflineReadQueueSync />
      <ShellAutoRefresh />
      {children}
    </QueryClientProvider>
  );
}
