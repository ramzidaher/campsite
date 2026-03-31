import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { isOrgAdminRole } from '@campsite/types';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const applicationId = id?.trim();
  if (!applicationId) return new Response('Bad request', { status: 400 });

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response('Unauthorized', { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id, role, status')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile?.org_id || profile.status !== 'active' || !isOrgAdminRole(profile.role)) {
    return new Response('Forbidden', { status: 403 });
  }

  const orgId = profile.org_id as string;

  const { data: row, error } = await supabase
    .from('job_applications')
    .select('cv_storage_path')
    .eq('id', applicationId)
    .eq('org_id', orgId)
    .maybeSingle();

  if (error || !row?.cv_storage_path) return new Response('Not found', { status: 404 });

  const path = row.cv_storage_path as string;

  let admin;
  try {
    admin = createServiceRoleClient();
  } catch {
    return new Response('Server misconfigured', { status: 500 });
  }

  const { data: blob, error: dlErr } = await admin.storage.from('job-application-cvs').download(path);
  if (dlErr || !blob) return new Response('Not found', { status: 404 });

  const filename = path.split('/').pop() ?? 'cv';
  const contentType =
    blob.type && blob.type !== 'application/octet-stream' ? blob.type : 'application/octet-stream';

  return new Response(blob, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}"`,
    },
  });
}
