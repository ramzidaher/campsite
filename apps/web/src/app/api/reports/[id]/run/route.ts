import { runReport } from '@/lib/reports/engine';
import { getReportsViewerFromRequest } from '@/lib/reports/auth';
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const requestStartedAt = Date.now();
  const viewer = await getReportsViewerFromRequest(req);
  if (!viewer) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!viewer.canView) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await params;
  const supabase = await createClient();

  const { data: report } = await supabase
    .from('reports')
    .select('id, config')
    .eq('org_id', viewer.orgId)
    .eq('id', id)
    .eq('is_archived', false)
    .maybeSingle();
  if (!report) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data: runRow, error: runInsertErr } = await supabase
    .from('report_runs')
    .insert({
      org_id: viewer.orgId,
      report_id: id,
      run_by: viewer.userId,
      status: 'running',
      started_at: new Date().toISOString(),
      filters_snapshot: (report.config as Record<string, unknown>) ?? {},
    })
    .select('id')
    .maybeSingle();
  if (runInsertErr || !runRow) return NextResponse.json({ error: runInsertErr?.message ?? 'Failed to start run' }, { status: 400 });

  try {
    const result = await runReport(report.config, {
      orgId: viewer.orgId,
      userId: viewer.userId,
      departmentId: viewer.departmentId,
      orgWideDataAccess: viewer.orgWideDataAccess,
    });
    const { error: updateError } = await supabase
      .from('report_runs')
      .update({
        status: 'completed',
        row_count: result.totalRows,
        result_preview: result.previewRows,
        completed_at: new Date().toISOString(),
      })
      .eq('id', runRow.id)
      .eq('org_id', viewer.orgId);
    if (updateError) {
      return NextResponse.json({ error: updateError.message, runId: runRow.id }, { status: 500 });
    }
    console.info('[reports.run] completed', {
      runId: runRow.id,
      reportId: id,
      orgId: viewer.orgId,
      durationMs: Date.now() - requestStartedAt,
      totalRows: result.totalRows,
      ...result.diagnostics,
    });
    return NextResponse.json({ runId: runRow.id, status: 'completed', ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Run failed';
    await supabase
      .from('report_runs')
      .update({
        status: 'failed',
        error_message: message,
        completed_at: new Date().toISOString(),
      })
      .eq('id', runRow.id)
      .eq('org_id', viewer.orgId);
    console.error('[reports.run] failed', {
      runId: runRow.id,
      reportId: id,
      orgId: viewer.orgId,
      durationMs: Date.now() - requestStartedAt,
      error: message,
    });
    return NextResponse.json({ error: message, runId: runRow.id }, { status: 500 });
  }
}
