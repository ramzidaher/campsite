import { OfferTemplateFormClient } from '@/app/(main)/admin/offer-templates/OfferTemplateFormClient';
import { viewerHasPermission } from '@/lib/authz/serverGuards';
import { createClient } from '@/lib/supabase/server';
import { notFound, redirect } from 'next/navigation';

export default async function EditOfferTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = rawId?.trim();
  if (!id) notFound();

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

  const orgId = profile.org_id as string;

  const { data: row } = await supabase
    .from('offer_letter_templates')
    .select('id, name, body_html')
    .eq('id', id)
    .eq('org_id', orgId)
    .maybeSingle();

  if (!row) notFound();

  return (
    <OfferTemplateFormClient
      mode="edit"
      templateId={id}
      initialName={(row.name as string) ?? ''}
      initialHtml={(row.body_html as string) ?? '<p></p>'}
    />
  );
}
