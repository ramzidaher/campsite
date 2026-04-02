import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';

export async function GET(_req: Request, { params }: { params: Promise<{ offerId: string }> }) {
  const { offerId } = await params;
  const id = offerId?.trim();
  if (!id) return new Response('Bad request', { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id, status')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile?.org_id || profile.status !== 'active') {
    return new Response('Forbidden', { status: 403 });
  }
  const { data: allowed } = await supabase.rpc('has_permission', {
    p_user_id: user.id,
    p_org_id: profile.org_id,
    p_permission_key: 'offers.view_signed_pdf',
    p_context: {},
  });
  if (!allowed) {
    return new Response('Forbidden', { status: 403 });
  }

  const orgId = profile.org_id as string;

  const { data: offer, error } = await supabase
    .from('application_offers')
    .select('signed_pdf_storage_path')
    .eq('id', id)
    .eq('org_id', orgId)
    .maybeSingle();

  if (error || !offer?.signed_pdf_storage_path) return new Response('Not found', { status: 404 });

  const path = offer.signed_pdf_storage_path as string;

  let admin;
  try {
    admin = createServiceRoleClient();
  } catch {
    return new Response('Server misconfigured', { status: 500 });
  }

  const { data: blob, error: dlErr } = await admin.storage.from('application-signed-offers').download(path);
  if (dlErr || !blob) return new Response('Not found', { status: 404 });

  return new Response(blob, {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="signed-offer.pdf"`,
    },
  });
}
