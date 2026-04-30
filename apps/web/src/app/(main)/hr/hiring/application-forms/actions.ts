'use server';

import { randomUUID } from 'node:crypto';
import { createClient } from '@/lib/supabase/server';
import { getAuthUser } from '@/lib/supabase/getAuthUser';
import { isScreeningQuestionType, type ScreeningQuestionOption } from '@campsite/types';
import { revalidatePath } from 'next/cache';

type ActionResult = { ok: true; id?: string } | { ok: false; error: string };
type FormQuestionPersist = {
  id: string;
  sortOrder: number;
  questionType: string;
  prompt: string;
  helpText: string;
  required: boolean;
  isPageBreak: boolean;
  scoringEnabled: boolean;
  scoringScaleMax: number;
  initiallyHidden: boolean;
  locked: boolean;
  maxLength: number | null;
  options: ScreeningQuestionOption[] | null;
};

type FormQuestionSetItemRow = {
  sort_order: number | null;
  question_type: string | null;
  prompt: string | null;
  help_text: string | null;
  required: boolean | null;
  max_length: number | null;
  options: unknown;
  is_page_break: boolean | null;
  scoring_enabled: boolean | null;
  scoring_scale_max?: number | null;
  initially_hidden: boolean | null;
  locked: boolean | null;
};

function isMissingScoringScaleColumnError(message: string | null | undefined): boolean {
  const msg = String(message ?? '').toLowerCase();
  return msg.includes('scoring_scale_max') && msg.includes('org_application_question_set_items');
}

async function getEditableOrgContext() {
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) return { ok: false as const, error: 'Not signed in.' };

  const { data: profile } = await supabase.from('profiles').select('org_id, status').eq('id', user.id).maybeSingle();
  if (!profile?.org_id || profile.status !== 'active') {
    return { ok: false as const, error: 'Not allowed.' };
  }

  const orgId = profile.org_id as string;
  const { data: canEdit } = await supabase.rpc('has_permission', {
    p_user_id: user.id,
    p_org_id: orgId,
    p_permission_key: 'jobs.edit',
    p_context: {},
  });
  if (!canEdit) return { ok: false as const, error: 'Not allowed.' };

  return { ok: true as const, supabase, orgId, userId: user.id };
}

export async function createApplicationForm(): Promise<ActionResult> {
  const ctx = await getEditableOrgContext();
  if (!ctx.ok) return ctx;
  const { supabase, orgId, userId } = ctx;
  const formId = randomUUID();

  const { error } = await supabase
    .from('org_application_question_sets')
    .insert({
      id: formId,
      org_id: orgId,
      name: 'Untitled application form',
      created_by: userId,
    });

  if (error) return { ok: false, error: error.message };
  revalidatePath('/hr/hiring/application-forms');
  return { ok: true, id: formId };
}

export async function renameApplicationForm(formId: string, name: string): Promise<ActionResult> {
  const ctx = await getEditableOrgContext();
  if (!ctx.ok) return ctx;
  const { supabase, orgId } = ctx;

  const id = String(formId ?? '').trim();
  const trimmedName = String(name ?? '').trim();
  if (!id) return { ok: false, error: 'Missing form id.' };
  if (!trimmedName) return { ok: false, error: 'Name cannot be empty.' };
  if (trimmedName.length > 120) return { ok: false, error: 'Name is too long (max 120 characters).' };

  const { error } = await supabase
    .from('org_application_question_sets')
    .update({ name: trimmedName })
    .eq('id', id)
    .eq('org_id', orgId);

  if (error) return { ok: false, error: error.message };
  revalidatePath('/hr/hiring/application-forms');
  return { ok: true };
}

export async function updateApplicationFormDetails(
  formId: string,
  fields: {
    name: string;
    jobTitle?: string | null;
    gradeLevel?: string | null;
    departmentId?: string | null;
  },
): Promise<ActionResult> {
  const ctx = await getEditableOrgContext();
  if (!ctx.ok) return ctx;
  const { supabase, orgId } = ctx;

  const id = String(formId ?? '').trim();
  const trimmedName = String(fields.name ?? '').trim();
  if (!id) return { ok: false, error: 'Missing form id.' };
  if (!trimmedName) return { ok: false, error: 'Name cannot be empty.' };
  if (trimmedName.length > 120) return { ok: false, error: 'Name is too long (max 120 characters).' };

  const departmentId = String(fields.departmentId ?? '').trim() || null;
  if (departmentId) {
    const { data: dept, error: deptErr } = await supabase
      .from('departments')
      .select('id')
      .eq('id', departmentId)
      .eq('org_id', orgId)
      .maybeSingle();
    if (deptErr || !dept?.id) return { ok: false, error: 'Selected department is invalid.' };
  }

  const { error } = await supabase
    .from('org_application_question_sets')
    .update({
      name: trimmedName,
      job_title: String(fields.jobTitle ?? '').trim() || null,
      grade_level: String(fields.gradeLevel ?? '').trim() || null,
      department_id: departmentId,
    })
    .eq('id', id)
    .eq('org_id', orgId);

  if (error) return { ok: false, error: error.message };
  revalidatePath('/hr/hiring/application-forms');
  revalidatePath(`/hr/hiring/application-forms/${id}/edit`);
  return { ok: true };
}

export async function duplicateApplicationForm(formId: string): Promise<ActionResult> {
  const ctx = await getEditableOrgContext();
  if (!ctx.ok) return ctx;
  const { supabase, orgId, userId } = ctx;

  const id = String(formId ?? '').trim();
  if (!id) return { ok: false, error: 'Missing form id.' };

  const { data: source, error: srcError } = await supabase
    .from('org_application_question_sets')
    .select('id, name')
    .eq('id', id)
    .eq('org_id', orgId)
    .maybeSingle();
  if (srcError || !source?.id) return { ok: false, error: srcError?.message ?? 'Application form not found.' };

  const sourceName = String(source.name ?? '').trim() || 'Untitled application form';
  const newId = randomUUID();
  const { error: insertError } = await supabase
    .from('org_application_question_sets')
    .insert({
      id: newId,
      org_id: orgId,
      name: `${sourceName} (Copy)`,
      created_by: userId,
    });
  if (insertError) {
    return { ok: false, error: insertError?.message ?? 'Could not duplicate application form.' };
  }
  const sourceItemsResultWithScale = await supabase
    .from('org_application_question_set_items')
    .select('sort_order, question_type, prompt, help_text, required, max_length, options, is_page_break, scoring_enabled, scoring_scale_max, initially_hidden, locked')
    .eq('set_id', id)
    .order('sort_order', { ascending: true });
  const sourceItemsResult =
    sourceItemsResultWithScale.error && isMissingScoringScaleColumnError(sourceItemsResultWithScale.error.message)
      ? await supabase
      .from('org_application_question_set_items')
      .select('sort_order, question_type, prompt, help_text, required, max_length, options, is_page_break, scoring_enabled, initially_hidden, locked')
      .eq('set_id', id)
      .order('sort_order', { ascending: true })
      : sourceItemsResultWithScale;
  const sourceItems = (sourceItemsResult.data ?? []) as FormQuestionSetItemRow[];
  if (sourceItemsResult.error) return { ok: false, error: sourceItemsResult.error.message };

  if (sourceItems.length > 0) {
    let itemsInsertResult = await supabase.from('org_application_question_set_items').insert(
      sourceItems.map((item) => ({
        set_id: newId,
        sort_order: item.sort_order,
        question_type: item.question_type,
        prompt: item.prompt,
        help_text: item.help_text,
        required: item.required,
        is_page_break: item.is_page_break,
        scoring_enabled: item.scoring_enabled,
        scoring_scale_max: item.scoring_scale_max,
        initially_hidden: item.initially_hidden,
        locked: item.locked,
        max_length: item.max_length,
        options: item.options,
      })),
    );
    if (itemsInsertResult.error && isMissingScoringScaleColumnError(itemsInsertResult.error.message)) {
      itemsInsertResult = await supabase.from('org_application_question_set_items').insert(
        sourceItems.map((item) => ({
          set_id: newId,
          sort_order: item.sort_order,
          question_type: item.question_type,
          prompt: item.prompt,
          help_text: item.help_text,
          required: item.required,
          is_page_break: item.is_page_break,
          scoring_enabled: item.scoring_enabled,
          initially_hidden: item.initially_hidden,
          locked: item.locked,
          max_length: item.max_length,
          options: item.options,
        })),
      );
    }
    if (itemsInsertResult.error) {
      await supabase.from('org_application_question_sets').delete().eq('id', newId).eq('org_id', orgId);
      return { ok: false, error: itemsInsertResult.error.message };
    }
  }

  revalidatePath('/hr/hiring/application-forms');
  return { ok: true, id: newId };
}

function validateFormQuestions(questions: FormQuestionPersist[]): string | null {
  for (const q of questions) {
    if (!isScreeningQuestionType(q.questionType)) return 'Invalid question type.';
    if (!q.prompt?.trim()) return 'Each question needs a prompt.';
    if (q.questionType === 'single_choice') {
      const opts = q.options ?? [];
      if (opts.length < 1) return 'Multiple-choice questions need at least one option.';
      for (const o of opts) {
        if (!o.id?.trim() || !o.label?.trim()) return 'Each choice needs an id and label.';
      }
    }
    if (q.maxLength != null && (q.maxLength < 1 || q.maxLength > 20000)) {
      return 'Max length must be between 1 and 20000.';
    }
    if (!Number.isInteger(q.scoringScaleMax) || q.scoringScaleMax < 0 || q.scoringScaleMax > 5) {
      return 'Scoring scale must be an integer between 0 and 5.';
    }
  }
  return null;
}

export async function replaceApplicationFormQuestions(
  formId: string,
  questions: FormQuestionPersist[],
): Promise<ActionResult> {
  const ctx = await getEditableOrgContext();
  if (!ctx.ok) return ctx;
  const { supabase, orgId } = ctx;

  const id = String(formId ?? '').trim();
  if (!id) return { ok: false, error: 'Missing form id.' };
  const validationErr = validateFormQuestions(questions);
  if (validationErr) return { ok: false, error: validationErr };

  const { data: setRow, error: setErr } = await supabase
    .from('org_application_question_sets')
    .select('id')
    .eq('id', id)
    .eq('org_id', orgId)
    .maybeSingle();
  if (setErr || !setRow) return { ok: false, error: setErr?.message ?? 'Application form not found.' };

  const { error: delErr } = await supabase.from('org_application_question_set_items').delete().eq('set_id', id);
  if (delErr) return { ok: false, error: delErr.message };

  if (questions.length > 0) {
    let insertResult = await supabase.from('org_application_question_set_items').insert(
      questions.map((q, i) => ({
        set_id: id,
        sort_order: i,
        question_type: q.questionType,
        prompt: q.prompt.trim(),
        help_text: q.helpText.trim() || null,
        required: q.required,
        is_page_break: Boolean(q.isPageBreak),
        scoring_enabled: q.scoringEnabled !== false,
        scoring_scale_max: q.scoringScaleMax,
        initially_hidden: Boolean(q.initiallyHidden),
        locked: Boolean(q.locked),
        max_length: q.maxLength,
        options: q.questionType === 'single_choice' ? (q.options ?? []) : null,
      })),
    );
    if (insertResult.error && isMissingScoringScaleColumnError(insertResult.error.message)) {
      insertResult = await supabase.from('org_application_question_set_items').insert(
        questions.map((q, i) => ({
          set_id: id,
          sort_order: i,
          question_type: q.questionType,
          prompt: q.prompt.trim(),
          help_text: q.helpText.trim() || null,
          required: q.required,
          is_page_break: Boolean(q.isPageBreak),
          scoring_enabled: q.scoringEnabled !== false,
          initially_hidden: Boolean(q.initiallyHidden),
          locked: Boolean(q.locked),
          max_length: q.maxLength,
          options: q.questionType === 'single_choice' ? (q.options ?? []) : null,
        })),
      );
    }
    if (insertResult.error) return { ok: false, error: insertResult.error.message };
  }

  revalidatePath('/hr/hiring/application-forms');
  revalidatePath(`/hr/hiring/application-forms/${id}/edit`);
  return { ok: true };
}

export async function deleteApplicationForms(formIds: string[]): Promise<ActionResult> {
  const ctx = await getEditableOrgContext();
  if (!ctx.ok) return ctx;
  const { supabase, orgId } = ctx;

  const ids = Array.from(
    new Set(
      (formIds ?? [])
        .map((id) => String(id ?? '').trim())
        .filter(Boolean),
    ),
  );
  if (ids.length === 0) return { ok: false, error: 'Select at least one form to delete.' };

  const { data: linkedJobs, error: linkedJobsErr } = await supabase
    .from('job_listings')
    .select('application_question_set_id')
    .eq('org_id', orgId)
    .in('application_question_set_id', ids)
    .limit(1);
  if (linkedJobsErr) return { ok: false, error: linkedJobsErr.message };
  if ((linkedJobs ?? []).length > 0) {
    return { ok: false, error: 'One or more selected forms are linked to job adverts and cannot be deleted.' };
  }

  const { error } = await supabase.from('org_application_question_sets').delete().eq('org_id', orgId).in('id', ids);
  if (error) return { ok: false, error: error.message };

  revalidatePath('/hr/hiring/application-forms');
  return { ok: true };
}
