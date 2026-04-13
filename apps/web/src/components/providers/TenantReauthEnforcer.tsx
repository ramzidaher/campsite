'use client';

import { createClient } from '@/lib/supabase/client';
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

  useEffect(() => {
    if (skip || !reauthRequiredAt || ran.current) return;
    ran.current = true;
    const supabase = createClient();
    const next = typeof window !== 'undefined' ? `${window.location.pathname}${window.location.search}` : '/';
    void supabase.auth.signOut({ scope: 'local' }).then(() => {
      window.location.assign(`/login?next=${encodeURIComponent(next)}`);
    });
  }, [reauthRequiredAt, skip]);

  return null;
}
