import { issueCandidatePortalToken } from '@/lib/security/portalTokens';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { createClient } from '@/lib/supabase/server';
import { NextRequest, NextResponse } from 'next/server';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ applicationId: string }> }
) {
  const { applicationId: rawId } = await params;
  const applicationId = rawId?.trim() ?? '';
  if (!UUID_RE.test(applicationId)) {
    return NextResponse.redirect(new URL('/jobs/me', req.url));
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.redirect(new URL('/jobs/login?next=/jobs/me', req.url));
  }
  const { data: row } = await supabase
    .from('job_applications')
    .select('id, org_id, candidate_user_id')
    .eq('id', applicationId)
    .maybeSingle();
  if (!row || row.candidate_user_id !== user.id) {
    return NextResponse.redirect(new URL('/jobs/me', req.url));
  }
  const admin = createServiceRoleClient();
  const token = await issueCandidatePortalToken(admin, {
    applicationId: row.id as string,
    orgId: row.org_id as string,
  });
  return NextResponse.redirect(new URL(`/jobs/status/${encodeURIComponent(token)}`, req.url));
}
