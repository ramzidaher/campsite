import { RotaSyncHistory } from '@/components/admin/RotaSyncHistory';
import { SheetsImportWizard } from '@/components/admin/SheetsImportWizard';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

/** Access control: parent `admin/layout.tsx` (org admin, active, org_id). This page only loads `org_id` for the wizard. */
export default async function RotaImportPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile?.org_id) redirect('/broadcasts');

  return (
    <>
      <SheetsImportWizard orgId={profile.org_id} />
      <RotaSyncHistory orgId={profile.org_id} />
    </>
  );
}
