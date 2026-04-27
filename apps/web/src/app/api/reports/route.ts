import { getReportsViewerFromRequest } from '@/lib/reports/auth';
import { parseReportDomains, parseSharedRoleKeys, parseVisibility, sanitizeReportConfig } from '@/lib/reports/validation';
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  const viewer = await getReportsViewerFromRequest(req);
  if (!viewer) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!viewer.canView) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const url = new URL(req.url);
  const q = (url.searchParams.get('q') ?? '').trim().toLowerCase();
  const domain = (url.searchParams.get('domain') ?? '').trim().toLowerCase();
  const tag = (url.searchParams.get('tag') ?? '').trim().toLowerCase();
  const sort = (url.searchParams.get('sort') ?? 'last_run').trim();

  const supabase = await createClient();
  const { data: reports, error } = await supabase
    .from('reports')
    .select('id, name, domains, visibility, tags, created_by, created_at, updated_at')
    .eq('org_id', viewer.orgId)
    .eq('is_archived', false)
    .order(sort === 'name' ? 'name' : sort === 'created' ? 'created_at' : 'updated_at', {
      ascending: sort === 'name',
    })
    .limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const filtered = (reports ?? []).filter((r) => {
    if (q && !String(r.name ?? '').toLowerCase().includes(q)) return false;
    if (domain && !Array.isArray(r.domains)) return false;
    if (domain && !r.domains.map((v: unknown) => String(v)).includes(domain)) return false;
    if (tag && !Array.isArray(r.tags)) return false;
    if (tag && !r.tags.map((v: unknown) => String(v)).map((v: string) => v.toLowerCase()).includes(tag)) return false;
    return true;
  });

  return NextResponse.json({ reports: filtered });
}

export async function POST(req: Request) {
  const viewer = await getReportsViewerFromRequest(req);
  if (!viewer) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!viewer.canView) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = await req.json();
  const name = String(body?.name ?? '').trim();
  if (!name) return NextResponse.json({ error: 'Name required' }, { status: 400 });

  const visibility = parseVisibility(body?.visibility);
  if (visibility === 'org' && !viewer.canManage) {
    return NextResponse.json({ error: 'Only reports.manage can create org-wide reports' }, { status: 403 });
  }

  const domains = parseReportDomains(body?.domains);
  if (domains.includes('hr') && domains.includes('finance') && !viewer.canManage) {
    return NextResponse.json({ error: 'Cross-domain reports require reports.manage' }, { status: 403 });
  }
  if (visibility === 'roles' && !viewer.canManage) {
    return NextResponse.json({ error: 'Only reports.manage can share by role' }, { status: 403 });
  }
  const config = sanitizeReportConfig(body?.config, domains);
  const sharedRoleKeys = visibility === 'roles' ? parseSharedRoleKeys(body?.sharedRoleKeys) : [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('reports')
    .insert({
      org_id: viewer.orgId,
      created_by: viewer.userId,
      updated_by: viewer.userId,
      name,
      description: String(body?.description ?? ''),
      domains,
      config,
      tags: Array.isArray(body?.tags) ? body.tags.map(String) : [],
      visibility,
      shared_role_keys: sharedRoleKeys,
    })
    .select('id, name, domains, visibility, tags, created_by, created_at, updated_at')
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ report: data }, { status: 201 });
}
