import { decryptUkTaxDetails, encryptUkTaxDetails, maskNiNumber, maskTaxCode, type UkTaxPayload } from '@/lib/security/ukTaxCrypto';
import { getAuthUser } from '@/lib/supabase/getAuthUser';
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

function clean(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

async function getCtx(userId: string) {
  const supabase = await createClient();
  const { data: profile } = await supabase.from('profiles').select('org_id, status').eq('id', userId).maybeSingle();
  if (!profile?.org_id || profile.status !== 'active') return null;
  const orgId = profile.org_id as string;
  const [viewAll, manageAll, viewOwn, manageOwn, canExport] = await Promise.all([
    supabase.rpc('has_permission', { p_user_id: userId, p_org_id: orgId, p_permission_key: 'payroll.uk_tax.view_all', p_context: {} }),
    supabase.rpc('has_permission', { p_user_id: userId, p_org_id: orgId, p_permission_key: 'payroll.uk_tax.manage_all', p_context: {} }),
    supabase.rpc('has_permission', { p_user_id: userId, p_org_id: orgId, p_permission_key: 'payroll.uk_tax.view_own', p_context: {} }),
    supabase.rpc('has_permission', { p_user_id: userId, p_org_id: orgId, p_permission_key: 'payroll.uk_tax.manage_own', p_context: {} }),
    supabase.rpc('has_permission', { p_user_id: userId, p_org_id: orgId, p_permission_key: 'payroll.uk_tax.export', p_context: {} }),
  ]);
  return {
    supabase,
    orgId,
    permissions: {
      viewAll: Boolean(viewAll.data),
      manageAll: Boolean(manageAll.data),
      viewOwn: Boolean(viewOwn.data),
      manageOwn: Boolean(manageOwn.data),
      canExport: Boolean(canExport.data),
    },
  };
}

export async function GET(request: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const ctx = await getCtx(user.id);
  if (!ctx) return NextResponse.json({ error: 'No active org profile' }, { status: 403 });
  const { supabase, orgId, permissions } = ctx;
  const { searchParams } = new URL(request.url);
  const requestedUserId = searchParams.get('userId') || user.id;
  const canAccess = permissions.viewAll || (requestedUserId === user.id && permissions.viewOwn);
  if (!canAccess) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });

  const { data, error } = await supabase
    .from('employee_uk_tax_details')
    .select('id, status, is_active, ni_number_masked, ni_number_last2, tax_code_masked, tax_code_last2, effective_from, submitted_by, reviewed_by, reviewed_at, review_note, created_at')
    .eq('org_id', orgId)
    .eq('user_id', requestedUserId)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ rows: data ?? [], permissions, userId: requestedUserId });
}

export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const ctx = await getCtx(user.id);
  if (!ctx) return NextResponse.json({ error: 'No active org profile' }, { status: 403 });
  const { supabase, orgId, permissions } = ctx;
  const body = await request.json().catch(() => ({}));
  const targetUserId = clean(body.user_id) || user.id;
  const canSubmit = permissions.manageAll || (targetUserId === user.id && permissions.manageOwn);
  if (!canSubmit) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });

  const payload: UkTaxPayload = {
    ni_number: clean(body.ni_number).toUpperCase(),
    tax_code: clean(body.tax_code).toUpperCase(),
    starter_declaration: clean(body.starter_declaration) || 'A',
    student_loan_plan: clean(body.student_loan_plan) || 'none',
    postgraduate_loan: Boolean(body.postgraduate_loan),
    tax_basis: clean(body.tax_basis) || 'cumulative',
    notes: clean(body.notes),
  };
  const effectiveFrom = clean(body.effective_from) || null;
  if (!payload.ni_number || !payload.tax_code) {
    return NextResponse.json({ error: 'NI number and tax code are required' }, { status: 400 });
  }

  const encrypted = encryptUkTaxDetails(payload);
  const niMask = maskNiNumber(payload.ni_number);
  const taxMask = maskTaxCode(payload.tax_code);

  const { data: inserted, error } = await supabase
    .from('employee_uk_tax_details')
    .insert({
      org_id: orgId,
      user_id: targetUserId,
      status: 'pending',
      is_active: false,
      encrypted_payload: encrypted,
      ni_number_masked: niMask.masked,
      ni_number_last2: niMask.last2,
      tax_code_masked: taxMask.masked,
      tax_code_last2: taxMask.last2,
      effective_from: effectiveFrom,
      submitted_by: user.id,
    })
    .select('id')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await supabase.from('employee_uk_tax_detail_events').insert({
    org_id: orgId,
    uk_tax_detail_id: inserted?.id as string,
    user_id: targetUserId,
    actor_user_id: user.id,
    event_type: 'submitted',
    payload: { effective_from: effectiveFrom, ni_last2: niMask.last2, tax_last2: taxMask.last2 },
  });

  decryptUkTaxDetails(encrypted);
  return NextResponse.json({ ok: true, id: inserted?.id });
}
