import { canViewOrgChartFromRequest } from '@/lib/orgChart/auth';
import type { OrgChartLiveNode } from '@/lib/reports/orgChart';
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  const canView = await canViewOrgChartFromRequest(req);
  if (!canView) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const supabase = await createClient();
  const { data, error } = await supabase.rpc('org_chart_live_nodes', { p_recent_window: '15 minutes' });
  if (error) {
    return NextResponse.json({ error: error.message ?? 'Failed to load org chart' }, { status: 500 });
  }

  return NextResponse.json({
    nodes: (data ?? []) as OrgChartLiveNode[],
  });
}
