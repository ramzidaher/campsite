'use client';

import { createClient } from '@/lib/supabase/client';
import { OrgStateOverlay } from '@/components/tenant/OrgStateOverlay';
import { ShieldCheck } from 'lucide-react';
import { useEffect, useRef } from 'react';

/**
 * When the founder triggers org force-logout, member profiles get `reauth_required_at`.
 * Existing browser sessions must sign out so the user re-authenticates (platform_admins are not flagged).
 */
export function TenantReauthEnforcer({
  reauthRequiredAt,
  skip,
}: {
  reauthRequiredAt: string | null;
  /** Platform operators are never flagged; also skip when unauthenticated. */
  skip: boolean;
}) {
  const ran = useRef(false);
  const shouldForceReauth = !skip && Boolean(reauthRequiredAt);

  useEffect(() => {
    if (!shouldForceReauth || ran.current) return;
    ran.current = true;
    const supabase = createClient();
    const next = typeof window !== 'undefined' ? `${window.location.pathname}${window.location.search}` : '/';
    const timer = window.setTimeout(() => {
      void supabase.auth.signOut({ scope: 'local' }).then(() => {
        window.location.assign(`/login?next=${encodeURIComponent(next)}`);
      });
    }, 1000);

    return () => {
      window.clearTimeout(timer);
    };
  }, [shouldForceReauth]);

  if (!shouldForceReauth) return null;

  return (
    <OrgStateOverlay
      icon={ShieldCheck}
      title="Session updated"
      message="Your organisation admin requested reauthentication for all members. Signing you out now."
      liveMessage="assertive"
    />
  );
}
