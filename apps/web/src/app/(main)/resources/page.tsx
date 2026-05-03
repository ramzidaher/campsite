import { ResourcesListClient } from '@/components/resources/ResourcesListClient';
import { parseResourcesFolderParam } from '@/lib/resourcesFolderParam';
import { createClient } from '@/lib/supabase/server';
import { getMyPermissions } from '@/lib/supabase/getMyPermissions';
import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/supabase/getAuthUser';
import { Suspense } from 'react';

export default async function ResourcesPage({
  searchParams,
}: {
  searchParams: Promise<{ folder?: string; q?: string; search?: string; archived?: string }>;
}) {
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, org_id, status')
    .eq('id', user.id)
    .single();

  if (!profile?.org_id) redirect('/login');
  if (profile.status !== 'active') redirect('/pending');

  const permissionKeys = await getMyPermissions(profile.org_id as string);
  const canManage = permissionKeys.includes('resources.manage');

  const sp = await searchParams;
  const folderFilter = parseResourcesFolderParam(sp.folder);
  const initialScoutPrompt = typeof sp.q === 'string' ? sp.q : '';
  const initialFileSearch = typeof sp.search === 'string' ? sp.search : '';
  const viewArchived = canManage && (sp.archived === '1' || sp.archived === 'true');

  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-6xl px-4 py-12 text-[13px] text-[var(--org-brand-muted)] sm:px-6 lg:px-8">
          Loading resource library…
        </div>
      }
    >
      <ResourcesListClient
        orgId={profile.org_id as string}
        canManage={canManage}
        folderFilter={folderFilter}
        initialScoutPrompt={initialScoutPrompt}
        initialFileSearch={initialFileSearch}
        viewArchived={viewArchived}
      />
    </Suspense>
  );
}
