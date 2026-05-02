import { OfferTemplateFormClient } from '@/app/(main)/admin/offer-templates/OfferTemplateFormClient';
import { viewerHasPermission } from '@/lib/authz/serverGuards';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/supabase/getAuthUser';

export default async function NewOfferTemplatePage({
  searchParams,
}: {
  searchParams: Promise<{ name?: string }>;
}) {
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id, role, status')
    .eq('id', user.id)
    .single();

  if (!profile?.org_id || profile.status !== 'active') redirect('/broadcasts');
  if (!(await viewerHasPermission('offers.manage'))) redirect('/forbidden');

  const { name } = await searchParams;
  const initialName = typeof name === 'string' ? name.trim().slice(0, 240) : '';

  return (
    <OfferTemplateFormClient
      mode="create"
      initialName={initialName}
      initialHtml="<p>Dear {{candidate_name}},</p><p>We are pleased to offer you the role of {{job_title}} at a salary of {{salary}} ({{contract_type}}), starting {{start_date}}.</p><p>Sincerely,</p><p>HR</p>"
    />
  );
}
