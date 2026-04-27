import { getReportsViewerFromRequest } from '@/lib/reports/auth';
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await getReportsViewerFromRequest(req);
  if (!viewer) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!viewer.canManage) return NextResponse.json({ error: 'reports.manage required' }, { status: 403 });
  const { id } = await params;
  const body = await req.json();

  const recurrence = String(body?.recurrence ?? 'weekly');
  const cronExpr = body?.cronExpr ? String(body.cronExpr) : null;
  const delivery = body?.delivery && typeof body.delivery === 'object'
    ? body.delivery
    : { in_app: true, email_org_users: false };

  const supabase = await createClient();
  const nextRunAt = body?.nextRunAt ? new Date(String(body.nextRunAt)).toISOString() : null;
  const { data, error } = await supabase
    .from('report_schedules')
    .insert({
      org_id: viewer.orgId,
      report_id: id,
      created_by: viewer.userId,
      recurrence,
      cron_expr: cronExpr,
      delivery,
      next_run_at: nextRunAt,
    })
    .select('id, recurrence, cron_expr, delivery, is_paused, next_run_at, last_run_at')
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ schedule: data }, { status: 201 });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await getReportsViewerFromRequest(req);
  if (!viewer) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!viewer.canManage) return NextResponse.json({ error: 'reports.manage required' }, { status: 403 });
  const { id } = await params;
  const body = await req.json();
  const scheduleId = String(body?.scheduleId ?? '');
  if (!scheduleId) return NextResponse.json({ error: 'scheduleId required' }, { status: 400 });

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('report_schedules')
    .update({
      is_paused: body?.isPaused,
      recurrence: body?.recurrence,
      cron_expr: body?.cronExpr,
      delivery: body?.delivery,
      next_run_at: body?.nextRunAt ? new Date(String(body.nextRunAt)).toISOString() : undefined,
      updated_at: new Date().toISOString(),
    })
    .eq('org_id', viewer.orgId)
    .eq('report_id', id)
    .eq('id', scheduleId)
    .select('id, recurrence, cron_expr, delivery, is_paused, next_run_at, last_run_at')
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ schedule: data });
}
