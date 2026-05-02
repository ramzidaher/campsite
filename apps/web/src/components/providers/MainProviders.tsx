'use client';

import { NetworkStatusBanner } from '@/components/providers/NetworkStatusBanner';
import { OfflineReadQueueSync } from '@/components/providers/OfflineReadQueueSync';
import { ShellBadgeRealtime } from '@/components/providers/ShellBadgeRealtime';
import { TenantReauthEnforcer } from '@/components/providers/TenantReauthEnforcer';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';

const MAX_QUERY_RETRIES = 2;

function retryDelayWithJitter(attemptIndex: number) {
  const baseDelay = Math.min(1000 * 2 ** attemptIndex, 15_000);
  return Math.floor(Math.random() * baseDelay);
}

export function MainProviders({
  children,
  reauthRequiredAt = null,
  skipTenantReauth = false,
  shellRealtimeUserId = null,
  shellRealtimeOrgId = null,
}: {
  children: React.ReactNode;
  /** ISO timestamp from main_shell_layout_bundle.profile_reauth_required_at */
  reauthRequiredAt?: string | null;
  /** When true, do not force sign-out (e.g. platform operator). */
  skipTenantReauth?: boolean;
  /** Pre-resolved identity from shell bundle to avoid client auth bootstrap calls. */
  shellRealtimeUserId?: string | null;
  /** Pre-resolved org from shell bundle to avoid client profile lookup calls. */
  shellRealtimeOrgId?: string | null;
}) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000,
            gcTime: 5 * 60_000,
            // Focus refetches can fan out into many concurrent RPCs and cause
            // visible UI stalls. Individual hot queries can opt in explicitly.
            refetchOnWindowFocus: false,
            // Keep retries bounded and jittered to avoid synchronized spikes.
            retry: (failureCount, error) => {
              if (failureCount >= MAX_QUERY_RETRIES) return false;
              const message =
                error instanceof Error ? error.message.toLowerCase() : '';
              // Do not retry obvious auth / permission / invalid request failures.
              if (
                message.includes('jwt') ||
                message.includes('permission') ||
                message.includes('forbidden') ||
                message.includes('unauthorized') ||
                message.includes('invalid')
              ) {
                return false;
              }
              return true;
            },
            retryDelay: retryDelayWithJitter,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <TenantReauthEnforcer reauthRequiredAt={reauthRequiredAt} skip={skipTenantReauth} />
      <NetworkStatusBanner />
      <OfflineReadQueueSync />
      <ShellBadgeRealtime userId={shellRealtimeUserId} orgId={shellRealtimeOrgId} />
      {children}
    </QueryClientProvider>
  );
}
