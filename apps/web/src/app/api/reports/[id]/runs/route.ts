import { getReportsViewerFromRequest } from '@/lib/reports/auth';
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await getReportsViewerFromRequest(req);
  if (!viewer) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!viewer.canView) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await params;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('report_runs')
    .select('id, status, row_count, created_at, started_at, completed_at, run_by, error_message, result_preview')
    .eq('org_id', viewer.orgId)
    .eq('report_id', id)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const runs = (data ?? []).map((run) => ({
    ...run,
    error_message: run.error_message ? String(run.error_message).slice(0, 300) : null,
    result_preview: Array.isArray(run.result_preview) ? run.result_preview.slice(0, 10) : [],
  }));
  return NextResponse.json({ runs });
}
