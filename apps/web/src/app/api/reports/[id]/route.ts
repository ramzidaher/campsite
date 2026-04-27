import { getReportsViewerFromRequest } from '@/lib/reports/auth';
import { parseReportDomains, parseSharedRoleKeys, parseVisibility, sanitizeReportConfig } from '@/lib/reports/validation';
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await getReportsViewerFromRequest(req);
  if (!viewer) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!viewer.canView) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await params;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('reports')
    .select('id, name, description, domains, config, tags, visibility, shared_role_keys, created_by, created_at, updated_at')
    .eq('org_id', viewer.orgId)
    .eq('id', id)
    .maybeSingle();
  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ report: data });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await getReportsViewerFromRequest(req);
  if (!viewer) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!viewer.canView) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await params;
  const body = await req.json();

  const supabase = await createClient();
  const { data: current } = await supabase
    .from('reports')
    .select('id, created_by, domains, visibility, name, description, config, tags, shared_role_keys')
    .eq('org_id', viewer.orgId)
    .eq('id', id)
    .maybeSingle();
  if (!current) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (String(current.created_by) !== viewer.userId && !viewer.canManage) {
    return NextResponse.json({ error: 'Forbidden by ownership hierarchy' }, { status: 403 });
  }

  const inputDomains = body?.domains === undefined ? current.domains : body.domains;
  const domains = parseReportDomains(inputDomains);
  if (domains.includes('hr') && domains.includes('finance') && !viewer.canManage) {
    return NextResponse.json({ error: 'Cross-domain reports require reports.manage' }, { status: 403 });
  }

  const visibility = body?.visibility === undefined ? undefined : parseVisibility(body.visibility);
  if (visibility === 'org' && !viewer.canManage) {
    return NextResponse.json({ error: 'Only reports.manage can share org-wide' }, { status: 403 });
  }
  if (visibility === 'roles' && !viewer.canManage) {
    return NextResponse.json({ error: 'Only reports.manage can share by role' }, { status: 403 });
  }
  const targetVisibility = (visibility ?? String(current.visibility ?? 'private')) as 'private' | 'roles' | 'org';
  const config = sanitizeReportConfig(body?.config ?? current.config, domains);
  const sharedRoleKeys = targetVisibility === 'roles' ? parseSharedRoleKeys(body?.sharedRoleKeys) : [];
  const updatePayload: Record<string, unknown> = {
    domains,
    config,
    shared_role_keys: sharedRoleKeys,
    updated_by: viewer.userId,
    updated_at: new Date().toISOString(),
  };
  if (body?.name !== undefined) updatePayload.name = String(body.name);
  if (body?.description !== undefined) updatePayload.description = String(body.description);
  if (body?.tags !== undefined) updatePayload.tags = Array.isArray(body.tags) ? body.tags.map(String) : [];
  if (visibility !== undefined) updatePayload.visibility = visibility;

  const { data, error } = await supabase
    .from('reports')
    .update(updatePayload)
    .eq('org_id', viewer.orgId)
    .eq('id', id)
    .select('id, name, description, domains, config, tags, visibility, shared_role_keys, created_by, created_at, updated_at')
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ report: data });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await getReportsViewerFromRequest(req);
  if (!viewer) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!viewer.canView) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await params;

  const supabase = await createClient();
  const { data: current } = await supabase
    .from('reports')
    .select('id, created_by')
    .eq('org_id', viewer.orgId)
    .eq('id', id)
    .maybeSingle();
  if (!current) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (String(current.created_by) !== viewer.userId && !viewer.canManage) {
    return NextResponse.json({ error: 'Forbidden by ownership hierarchy' }, { status: 403 });
  }

  const { error } = await supabase
    .from('reports')
    .update({ is_archived: true, updated_by: viewer.userId, updated_at: new Date().toISOString() })
    .eq('org_id', viewer.orgId)
    .eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
