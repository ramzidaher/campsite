import { headers } from 'next/headers';
import { redirect } from 'next/navigation';

import { tenantSubdomainOriginForHost } from '@/lib/tenant/adminUrl';
import { createClient } from '@/lib/supabase/server';

function normSlug(s: string | null | undefined): string {
  return (s ?? '').trim().toLowerCase();
}

/**
 * Tenant subdomains identify an org in the URL, but shell data follows `profiles.org_id`.
 * When those diverge (multi-org members, bookmarks, partial navigations after switching
 * workspace), keep the **active profile org** as source of truth and redirect to its
 * canonical host — never call `set_my_active_org` here (that would undo an intentional
 * workspace switch while the browser is still on the old subdomain).
 */
export async function enforceTenantHostMatchesActiveOrg(
  shellBundle: Record<string, unknown>
): Promise<void> {
  const h = await headers();
  if (h.get('x-campsite-platform-admin') === '1') return;

  const hostSlug = normSlug(h.get('x-campsite-org-slug'));
  if (!hostSlug) return;

  const profileOrgId =
    typeof shellBundle.org_id === 'string' ? shellBundle.org_id.trim() : '';
  if (!profileOrgId) return;

  let profileSlug = normSlug(
    typeof shellBundle.org_slug === 'string' ? shellBundle.org_slug : ''
  );

  if (!profileSlug) {
    const supabase = await createClient();
    const { data: row } = await supabase
      .from('organisations')
      .select('slug')
      .eq('id', profileOrgId)
      .maybeSingle();
    profileSlug = normSlug((row?.slug as string | undefined) ?? '');
  }

  if (!profileSlug || hostSlug === profileSlug) return;

  const pathnameRaw = h.get('x-campsite-pathname')?.trim() || '/dashboard';
  const safePath =
    pathnameRaw.startsWith('/') && !pathnameRaw.startsWith('//') ? pathnameRaw : '/dashboard';

  const hostHeader = h.get('x-forwarded-host') ?? h.get('host') ?? '';
  const origin = tenantSubdomainOriginForHost(profileSlug, hostHeader);
  redirect(`${origin}${safePath}`);
}
