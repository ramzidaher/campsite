import { decryptBankDetails } from '@/lib/security/bankDetailsCrypto';
import { getAuthUser } from '@/lib/supabase/getAuthUser';
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

function csvEscape(v: string): string {
  if (v.includes(',') || v.includes('"') || v.includes('\n')) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

export async function GET() {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const supabase = await createClient();
  const { data: profile } = await supabase.from('profiles').select('org_id, status').eq('id', user.id).maybeSingle();
  if (!profile?.org_id || profile.status !== 'active') return NextResponse.json({ error: 'No active org profile' }, { status: 403 });
  const orgId = profile.org_id as string;
  const { data: canExport } = await supabase.rpc('has_permission', {
    p_user_id: user.id,
    p_org_id: orgId,
    p_permission_key: 'payroll.bank_details.export',
    p_context: {},
  });
  if (!canExport) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });

  const { data: rows, error } = await supabase
    .from('employee_bank_details')
    .select('id, user_id, encrypted_payload, effective_from, currency, bank_country, account_holder_display')
    .eq('org_id', orgId)
    .eq('is_active', true)
    .eq('status', 'approved')
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const ids = [...new Set((rows ?? []).map((r) => r.user_id as string))];
  const { data: profileRows } = ids.length
    ? await supabase.from('profiles').select('id, full_name, preferred_name, email').in('id', ids)
    : { data: [] as { id: string; full_name: string | null; preferred_name: string | null; email: string | null }[] };
  const profileById = new Map((profileRows ?? []).map((p) => [p.id as string, p]));

  const lines: string[] = [];
  lines.push([
    'employee_id',
    'employee_name',
    'employee_email',
    'account_holder_name',
    'bank_name',
    'account_number',
    'sort_code',
    'iban',
    'swift_bic',
    'routing_number',
    'country',
    'currency',
    'payroll_reference',
    'effective_from',
  ].join(','));

  for (const row of rows ?? []) {
    const decrypted = decryptBankDetails(row.encrypted_payload as string);
    const p = profileById.get(row.user_id as string);
    const name = (p?.preferred_name as string | null) || (p?.full_name as string | null) || '';
    lines.push([
      csvEscape(String(row.user_id ?? '')),
      csvEscape(name),
      csvEscape(String(p?.email ?? '')),
      csvEscape(decrypted.account_holder_name || ''),
      csvEscape(decrypted.bank_name || ''),
      csvEscape(decrypted.account_number || ''),
      csvEscape(decrypted.sort_code || ''),
      csvEscape(decrypted.iban || ''),
      csvEscape(decrypted.swift_bic || ''),
      csvEscape(decrypted.routing_number || ''),
      csvEscape(decrypted.country || String(row.bank_country ?? '')),
      csvEscape(decrypted.currency || String(row.currency ?? '')),
      csvEscape(decrypted.payroll_reference || ''),
      csvEscape(String(row.effective_from ?? '')),
    ].join(','));
  }

  await supabase.from('employee_bank_detail_events').insert({
    org_id: orgId,
    bank_detail_id: null,
    user_id: user.id,
    actor_user_id: user.id,
    event_type: 'exported',
    payload: { row_count: (rows ?? []).length },
  });

  return new NextResponse(lines.join('\n'), {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="payroll-bank-details-${new Date().toISOString().slice(0, 10)}.csv"`,
      'Cache-Control': 'no-store, private',
      Pragma: 'no-cache',
    },
  });
}
