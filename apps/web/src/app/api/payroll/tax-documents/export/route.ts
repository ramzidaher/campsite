import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

function csvEsc(v: unknown): string {
  const s = v == null ? '' : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const me = auth.user;
  if (!me) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile, error: pErr } = await supabase
    .from('profiles')
    .select('org_id')
    .eq('id', me.id)
    .single();
  if (pErr || !profile?.org_id) {
    return NextResponse.json({ error: 'Could not resolve org.' }, { status: 400 });
  }
  const orgId = profile.org_id as string;

  const { data: perm } = await supabase.rpc('has_permission', {
    p_user_id: me.id,
    p_org_id: orgId,
    p_permission_key: 'payroll.tax_docs.export',
    p_context: {},
  });
  if (!perm) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const url = new URL(req.url);
  const userId = url.searchParams.get('userId');
  let query = supabase
    .from('employee_tax_documents')
    .select('user_id, document_type, tax_year, issue_date, payroll_period_end, status, finance_reference, wagesheet_id, payroll_run_reference, file_name, byte_size, created_at, is_current')
    .eq('org_id', orgId)
    .order('created_at', { ascending: false });
  if (userId) query = query.eq('user_id', userId);
  const { data: rows, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const headers = [
    'user_id', 'document_type', 'tax_year', 'issue_date', 'payroll_period_end', 'status',
    'finance_reference', 'wagesheet_id', 'payroll_run_reference', 'file_name', 'byte_size',
    'is_current', 'created_at',
  ];
  const lines = [headers.join(',')];
  for (const r of rows ?? []) {
    lines.push([
      csvEsc(r.user_id),
      csvEsc(r.document_type),
      csvEsc(r.tax_year),
      csvEsc(r.issue_date),
      csvEsc(r.payroll_period_end),
      csvEsc(r.status),
      csvEsc(r.finance_reference),
      csvEsc(r.wagesheet_id),
      csvEsc(r.payroll_run_reference),
      csvEsc(r.file_name),
      csvEsc(r.byte_size),
      csvEsc(r.is_current),
      csvEsc(r.created_at),
    ].join(','));
  }
  const csv = `${lines.join('\n')}\n`;
  const fname = `tax-documents-${new Date().toISOString().slice(0, 10)}.csv`;
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${fname}"`,
      'Cache-Control': 'no-store',
    },
  });
}
