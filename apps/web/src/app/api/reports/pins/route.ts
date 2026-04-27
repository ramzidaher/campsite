import { getReportsViewerFromRequest } from '@/lib/reports/auth';
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

async function resolveVisibleReportId(supabase: Awaited<ReturnType<typeof createClient>>, viewer: { orgId: string; userId: string; permissions: string[] }, reportId: string) {
  const { data: report, error } = await supabase
    .from('reports')
    .select('id, created_by, visibility, shared_role_keys')
    .eq('org_id', viewer.orgId)
    .eq('id', reportId)
    .eq('is_archived', false)
    .maybeSingle();
  if (error || !report) return null;

  const visibility = String(report.visibility ?? 'private');
  if (visibility === 'org') return String(report.id);
  if (String(report.created_by) === viewer.userId) return String(report.id);
  if (visibility === 'roles') {
    const shared = Array.isArray(report.shared_role_keys) ? report.shared_role_keys.map(String) : [];
    if (shared.some((role) => viewer.permissions.includes(role))) return String(report.id);
  }
  return null;
}

export async function POST(req: Request) {
  const viewer = await getReportsViewerFromRequest(req);
  if (!viewer) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!viewer.canView) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { reportId } = await req.json();
  if (!reportId) return NextResponse.json({ error: 'reportId required' }, { status: 400 });

  const supabase = await createClient();
  const safeReportId = await resolveVisibleReportId(supabase, viewer, String(reportId));
  if (!safeReportId) return NextResponse.json({ error: 'Report not found or not visible' }, { status: 404 });
  const { error } = await supabase
    .from('user_pinned_reports')
    .insert({ user_id: viewer.userId, report_id: safeReportId });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const viewer = await getReportsViewerFromRequest(req);
  if (!viewer) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!viewer.canView) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { reportId } = await req.json();
  if (!reportId) return NextResponse.json({ error: 'reportId required' }, { status: 400 });

  const supabase = await createClient();
  const safeReportId = await resolveVisibleReportId(supabase, viewer, String(reportId));
  if (!safeReportId) return NextResponse.json({ error: 'Report not found or not visible' }, { status: 404 });
  const { error } = await supabase
    .from('user_pinned_reports')
    .delete()
    .eq('user_id', viewer.userId)
    .eq('report_id', safeReportId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
