import { decryptBankDetails, encryptBankDetails, maskAccountNumber, maskIban, maskSortCode, type BankDetailPayload } from '@/lib/security/bankDetailsCrypto';
import { getAuthUser } from '@/lib/supabase/getAuthUser';
import { getMyPermissions } from '@/lib/supabase/getMyPermissions';
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

function clean(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

async function getOrgAndPermissions(userId: string) {
  const supabase = await createClient();
  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id, status')
    .eq('id', userId)
    .maybeSingle();
  if (!profile?.org_id || profile.status !== 'active') return null;
  const orgId = profile.org_id as string;
  const permissionKeys = await getMyPermissions(orgId);
  return {
    supabase,
    orgId,
    permissions: {
      viewAll: permissionKeys.includes('payroll.bank_details.view_all'),
      manageAll: permissionKeys.includes('payroll.bank_details.manage_all'),
      viewOwn: permissionKeys.includes('payroll.bank_details.view_own'),
      manageOwn: permissionKeys.includes('payroll.bank_details.manage_own'),
      canExport: permissionKeys.includes('payroll.bank_details.export'),
    },
  };
}

export async function GET(request: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const ctx = await getOrgAndPermissions(user.id);
  if (!ctx) return NextResponse.json({ error: 'No active org profile' }, { status: 403 });
  const { supabase, orgId, permissions } = ctx;

  const { searchParams } = new URL(request.url);
  const requestedUserId = searchParams.get('userId') || user.id;
  const canAccess =
    (requestedUserId === user.id && permissions.viewOwn) || permissions.viewAll;
  if (!canAccess) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });

  const { data, error } = await supabase
    .from('employee_bank_details')
    .select('id, status, is_active, account_holder_display, account_number_last4, sort_code_last4, iban_last4, bank_country, currency, effective_from, submitted_by, reviewed_by, reviewed_at, review_note, created_at')
    .eq('org_id', orgId)
    .eq('user_id', requestedUserId)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({
    rows: data ?? [],
    permissions,
    userId: requestedUserId,
  });
}

export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const ctx = await getOrgAndPermissions(user.id);
  if (!ctx) return NextResponse.json({ error: 'No active org profile' }, { status: 403 });
  const { supabase, orgId, permissions } = ctx;

  const body = await request.json().catch(() => ({}));
  const targetUserId = clean(body.user_id) || user.id;
  const canSubmit =
    (targetUserId === user.id && permissions.manageOwn) || permissions.manageAll;
  if (!canSubmit) return NextResponse.json({ error: 'Not allowed' }, { status: 403 });

  const payload: BankDetailPayload = {
    account_holder_name: clean(body.account_holder_name),
    bank_name: clean(body.bank_name),
    account_number: clean(body.account_number),
    sort_code: clean(body.sort_code),
    iban: clean(body.iban),
    swift_bic: clean(body.swift_bic),
    routing_number: clean(body.routing_number),
    country: clean(body.country),
    currency: clean(body.currency).toUpperCase(),
    payroll_reference: clean(body.payroll_reference),
  };
  const effectiveFrom = clean(body.effective_from) || null;
  if (!payload.account_holder_name || !payload.bank_name || !payload.country || !payload.currency) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }
  if (!payload.account_number && !payload.iban) {
    return NextResponse.json({ error: 'Provide account number or IBAN' }, { status: 400 });
  }

  const encrypted = encryptBankDetails(payload);
  const maskedAccount = maskAccountNumber(payload.account_number);
  const maskedSort = maskSortCode(payload.sort_code);
  const maskedIban = maskIban(payload.iban);

  const { data: inserted, error } = await supabase
    .from('employee_bank_details')
    .insert({
      org_id: orgId,
      user_id: targetUserId,
      status: 'pending',
      is_active: false,
      encrypted_payload: encrypted,
      account_holder_display: payload.account_holder_name,
      account_number_last4: maskedAccount.last4,
      sort_code_last4: maskedSort.last4,
      iban_last4: maskedIban.last4,
      bank_country: payload.country,
      currency: payload.currency,
      effective_from: effectiveFrom,
      submitted_by: user.id,
    })
    .select('id')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await supabase.from('employee_bank_detail_events').insert({
    org_id: orgId,
    bank_detail_id: inserted?.id as string,
    user_id: targetUserId,
    actor_user_id: user.id,
    event_type: 'submitted',
    payload: {
      effective_from: effectiveFrom,
      account_last4: maskedAccount.last4,
      sort_last4: maskedSort.last4,
      iban_last4: maskedIban.last4,
    },
  });

  // Defensive parse check to ensure payload decrypts correctly after write.
  decryptBankDetails(encrypted);

  return NextResponse.json({ ok: true, id: inserted?.id });
}
