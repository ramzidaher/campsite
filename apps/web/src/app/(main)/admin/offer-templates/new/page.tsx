import { OfferTemplateFormClient } from '@/app/(main)/admin/offer-templates/OfferTemplateFormClient';
import { viewerHasPermission } from '@/lib/authz/serverGuards';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export default async function NewOfferTemplatePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id, role, status')
    .eq('id', user.id)
    .single();

  if (!profile?.org_id || profile.status !== 'active') redirect('/broadcasts');
  if (!(await viewerHasPermission('offers.manage'))) redirect('/broadcasts');

  return (
    <OfferTemplateFormClient
      mode="create"
      initialName=""
      initialHtml="<p>Dear {{candidate_name}},</p><p>We are pleased to offer you the role of {{job_title}} at a salary of {{salary}} ({{contract_type}}), starting {{start_date}}.</p><p>Sincerely,</p><p>HR</p>"
    />
  );
}
