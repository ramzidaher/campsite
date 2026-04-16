import { decryptBankDetails } from '@/lib/security/bankDetailsCrypto';
import { decryptUkTaxDetails } from '@/lib/security/ukTaxCrypto';
import { getAuthUser } from '@/lib/supabase/getAuthUser';
import { getMyPermissions } from '@/lib/supabase/getMyPermissions';
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

function csvEsc(v: unknown): string {
  const s = v == null ? '' : String(v);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function simplePdf(lines: string[]): string {
  const safe = lines.map((l) => l.replace(/[()\\]/g, '')).join('\n');
  const stream = `BT /F1 10 Tf 40 790 Td (${safe.replace(/\n/g, ') Tj T* (')}) Tj ET`;
  const objs = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj',
    `4 0 obj << /Length ${stream.length} >> stream\n${stream}\nendstream endobj`,
    '5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
  ];
  let body = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (const o of objs) {
    offsets.push(body.length);
    body += `${o}\n`;
  }
  const xrefStart = body.length;
  body += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objs.length; i += 1) body += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  body += `trailer << /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return body;
}

export async function GET(req: Request) {
  const me = await getAuthUser();
  if (!me) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const supabase = await createClient();
  const { data: profile } = await supabase.from('profiles').select('org_id, status').eq('id', me.id).maybeSingle();
  if (!profile?.org_id || profile.status !== 'active') return NextResponse.json({ error: 'No active org profile' }, { status: 403 });
  const orgId = profile.org_id as string;
  const url = new URL(req.url);
  const userId = url.searchParams.get('userId') || me.id;
  const format = (url.searchParams.get('format') || 'csv').toLowerCase();
  const includeSensitive = url.searchParams.get('includeSensitive') === '1';
  const reason = (url.searchParams.get('reason') || '').trim();

  // Single RPC for all permissions + profile fetch in parallel — replaces 6 individual has_permission calls.
  const [permissionKeys, { data: targetProfile }] = await Promise.all([
    getMyPermissions(orgId),
    supabase
      .from('profiles')
      .select('id, org_id, full_name, preferred_name, email, reports_to_user_id')
      .eq('id', userId)
      .eq('org_id', orgId)
      .maybeSingle(),
  ]);
  if (!targetProfile) return NextResponse.json({ error: 'Target user not found' }, { status: 404 });

  const canViewAll    = permissionKeys.includes('hr.records_export.view_all');
  const canViewOwn    = permissionKeys.includes('hr.records_export.view_own');
  const canViewDirect = permissionKeys.includes('hr.records_export.view_direct_reports');
  const canSensitive  = permissionKeys.includes('hr.records_export.include_sensitive');
  const canPdf        = permissionKeys.includes('hr.records_export.generate_pdf');
  const canCsv        = permissionKeys.includes('hr.records_export.generate_csv');

  const canAccess =
    canViewAll ||
    (userId === me.id && canViewOwn) ||
    (canViewDirect && (targetProfile.reports_to_user_id as string | null) === me.id);
  if (!canAccess) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (format === 'pdf' && !canPdf) return NextResponse.json({ error: 'PDF export not allowed' }, { status: 403 });
  if (format === 'csv' && !canCsv) return NextResponse.json({ error: 'CSV export not allowed' }, { status: 403 });
  if (includeSensitive && !canSensitive) return NextResponse.json({ error: 'Sensitive export not allowed' }, { status: 403 });
  if (includeSensitive && !reason) return NextResponse.json({ error: 'Reason required for sensitive export' }, { status: 400 });

  const [{ data: hrFile }, { data: history }, { data: deps }, { data: customVals }] = await Promise.all([
    supabase.rpc('hr_employee_file', { p_user_id: userId }),
    supabase.from('employee_employment_history').select('role_title,start_date,end_date').eq('org_id', orgId).eq('user_id', userId),
    supabase.from('employee_dependants').select('full_name,relationship,is_beneficiary,beneficiary_percentage').eq('org_id', orgId).eq('user_id', userId),
    supabase.from('hr_custom_field_values').select('definition_id,value').eq('org_id', orgId).eq('user_id', userId),
  ]);
  const row = (hrFile ?? [])[0] as Record<string, unknown> | undefined;

  let bankLine = 'bank_details=masked';
  let ukTaxLine = 'uk_tax=masked';
  if (includeSensitive) {
    const [{ data: bank }, { data: tax }] = await Promise.all([
      supabase.from('employee_bank_details').select('encrypted_payload').eq('org_id', orgId).eq('user_id', userId).eq('status', 'approved').eq('is_active', true).maybeSingle(),
      supabase.from('employee_uk_tax_details').select('encrypted_payload').eq('org_id', orgId).eq('user_id', userId).eq('status', 'approved').eq('is_active', true).maybeSingle(),
    ]);
    if (bank?.encrypted_payload) {
      const b = decryptBankDetails(bank.encrypted_payload as string);
      bankLine = `bank_details=${b.account_holder_name}|${b.bank_name}|${b.account_number}`;
    }
    if (tax?.encrypted_payload) {
      const t = decryptUkTaxDetails(tax.encrypted_payload as string);
      ukTaxLine = `uk_tax=${t.ni_number}|${t.tax_code}`;
    }
  }

  const lines = [
    `employee_id=${userId}`,
    `name=${(targetProfile.preferred_name as string | null) || (targetProfile.full_name as string | null) || ''}`,
    `email=${targetProfile.email ?? ''}`,
    `job_title=${row?.job_title ?? ''}`,
    `grade=${row?.grade_level ?? ''}`,
    `employment_start=${row?.employment_start_date ?? ''}`,
    `history_count=${(history ?? []).length}`,
    `dependants_count=${(deps ?? []).length}`,
    `custom_fields_count=${(customVals ?? []).length}`,
    bankLine,
    ukTaxLine,
  ];

  await supabase.from('employee_record_export_events').insert({
    org_id: orgId,
    target_user_id: userId,
    actor_user_id: me.id,
    format: format === 'pdf' ? 'pdf' : 'csv',
    included_sections: ['core_profile', 'employment_history', 'dependants', 'custom_fields', includeSensitive ? 'sensitive' : 'masked'],
    include_sensitive: includeSensitive,
    reason: reason || null,
  });

  if (format === 'pdf') {
    const pdf = simplePdf(lines);
    return new NextResponse(pdf, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="employee-record-${userId}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  }

  const csv = ['key,value', ...lines.map((line) => {
    const [k, ...rest] = line.split('=');
    return `${csvEsc(k)},${csvEsc(rest.join('='))}`;
  })].join('\n');
  return new NextResponse(`${csv}\n`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="employee-record-${userId}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
