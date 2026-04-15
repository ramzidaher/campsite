import { decryptMedicalNotes, encryptMedicalNotes, type MedicalSensitivePayload } from '@/lib/security/medicalNotesCrypto';
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
  const [viewAll, manageAll, viewOwn, revealSensitive, canExport, manageOwn] = await Promise.all([
    supabase.rpc('has_permission', { p_user_id: userId, p_org_id: orgId, p_permission_key: 'hr.medical_notes.view_all', p_context: {} }),
    supabase.rpc('has_permission', { p_user_id: userId, p_org_id: orgId, p_permission_key: 'hr.medical_notes.manage_all', p_context: {} }),
    supabase.rpc('has_permission', { p_user_id: userId, p_org_id: orgId, p_permission_key: 'hr.medical_notes.view_own_summary', p_context: {} }),
    supabase.rpc('has_permission', { p_user_id: userId, p_org_id: orgId, p_permission_key: 'hr.medical_notes.reveal_sensitive', p_context: {} }),
    supabase.rpc('has_permission', { p_user_id: userId, p_org_id: orgId, p_permission_key: 'hr.medical_notes.export', p_context: {} }),
    supabase.rpc('has_permission', { p_user_id: userId, p_org_id: orgId, p_permission_key: 'hr.medical_notes.manage_own', p_context: {} }),
  ]);
  return {
    supabase,
    orgId,
    permissions: {
      viewAll: Boolean(viewAll.data),
      manageAll: Boolean(manageAll.data),
      viewOwn: Boolean(viewOwn.data),
      revealSensitive: Boolean(revealSensitive.data),
      canExport: Boolean(canExport.data),
      manageOwn: Boolean(manageOwn.data),
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
    .from('employee_medical_notes')
    .select('id, case_ref, referral_reason, status, fit_for_work_outcome, recommended_adjustments, review_date, next_review_date, summary_for_employee, archived_at, created_at')
    .eq('org_id', orgId)
    .eq('user_id', requestedUserId)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const noteIds = (data ?? []).map((r) => r.id as string).filter(Boolean);
  const { data: events } = noteIds.length
    ? await supabase
        .from('employee_medical_note_events')
        .select('id, medical_note_id, event_type, reason, created_at')
        .in('medical_note_id', noteIds)
        .order('created_at', { ascending: false })
        .limit(100)
    : { data: [] };

  return NextResponse.json({ rows: data ?? [], events: events ?? [], permissions, userId: requestedUserId });
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

  const payload: MedicalSensitivePayload = {
    clinical_notes: clean(body.clinical_notes),
    diagnosis_summary: clean(body.diagnosis_summary),
    medications_or_restrictions: clean(body.medications_or_restrictions),
    confidential_flags: Array.isArray(body.confidential_flags)
      ? body.confidential_flags.map((v: unknown) => clean(v)).filter(Boolean)
      : [],
  };

  const encrypted = encryptMedicalNotes(payload);
  decryptMedicalNotes(encrypted);

  const caseRef = clean(body.case_ref) || `MED-${Date.now().toString().slice(-6)}`;

  const { data: inserted, error } = await supabase
    .from('employee_medical_notes')
    .insert({
      org_id: orgId,
      user_id: targetUserId,
      case_ref: caseRef,
      referral_reason: clean(body.referral_reason) || null,
      status: clean(body.status) || 'open',
      fit_for_work_outcome: clean(body.fit_for_work_outcome) || null,
      recommended_adjustments: clean(body.recommended_adjustments) || null,
      review_date: clean(body.review_date) || null,
      next_review_date: clean(body.next_review_date) || null,
      summary_for_employee: clean(body.summary_for_employee) || null,
      encrypted_sensitive_payload: encrypted,
      created_by: user.id,
      updated_by: user.id,
    })
    .select('id')
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await supabase.from('employee_medical_note_events').insert({
    org_id: orgId,
    medical_note_id: inserted?.id as string,
    user_id: targetUserId,
    actor_user_id: user.id,
    event_type: 'created',
    payload: { status: clean(body.status) || 'open' },
  });

  return NextResponse.json({ ok: true, id: inserted?.id });
}
