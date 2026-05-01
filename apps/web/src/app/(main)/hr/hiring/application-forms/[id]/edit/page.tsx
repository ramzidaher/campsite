import { randomUUID } from 'node:crypto';
import { viewerHasPermission } from '@/lib/authz/serverGuards';
import { getAuthUser } from '@/lib/supabase/getAuthUser';
import { createClient } from '@/lib/supabase/server';
import { HiringApplicationFormEditorClient } from '@/components/admin/HiringApplicationFormEditorClient';
import { redirect } from 'next/navigation';

export default async function EditApplicationFormPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: rawId } = await params;
  const formId = rawId?.trim();
  if (!formId) redirect('/hr/hiring/application-forms');

  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id, status')
    .eq('id', user.id)
    .single();
  if (!profile?.org_id || profile.status !== 'active') redirect('/broadcasts');

  const canViewJobs = await viewerHasPermission('jobs.view');
  if (!canViewJobs) redirect('/broadcasts');

  const orgId = profile.org_id as string;
  const [setRowResult, rowsResultWithScale] = await Promise.all([
    supabase
      .from('org_application_question_sets')
      .select('id, name, job_title, grade_level, department_id')
      .eq('id', formId)
      .eq('org_id', orgId)
      .maybeSingle(),
    supabase
      .from('org_application_question_set_items')
      .select('sort_order, question_type, prompt, help_text, required, max_length, options, is_page_break, scoring_enabled, scoring_scale_max, initially_hidden, locked')
      .eq('set_id', formId)
      .order('sort_order', { ascending: true }),
  ]);
  const setRow = setRowResult.data;

  const needsRowsFallback = (() => {
    const msg = String(rowsResultWithScale.error?.message ?? '').toLowerCase();
    return msg.includes('scoring_scale_max') && msg.includes('org_application_question_set_items');
  })();

  const rowsResult = needsRowsFallback
    ? await supabase
        .from('org_application_question_set_items')
        .select('sort_order, question_type, prompt, help_text, required, max_length, options, is_page_break, scoring_enabled, initially_hidden, locked')
        .eq('set_id', formId)
        .order('sort_order', { ascending: true })
    : rowsResultWithScale;
  const rows = rowsResult.data;

  const { data: departments } = await supabase
    .from('departments')
    .select('id, name')
    .eq('org_id', orgId)
    .order('name', { ascending: true });

  const { data: jobRows } = await supabase
    .from('job_listings')
    .select('title, grade_level')
    .eq('org_id', orgId)
    .order('updated_at', { ascending: false })
    .limit(200);

  const jobTitleOptions = Array.from(
    new Set((jobRows ?? []).map((j) => String(j.title ?? '').trim()).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b));
  const gradeOptions = Array.from(
    new Set((jobRows ?? []).map((j) => String(j.grade_level ?? '').trim()).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b));

  if (!setRow?.id) redirect('/hr/hiring/application-forms');

  const questions = (rows ?? []).map((q, i) => {
    const scoringScaleRaw = (q as { scoring_scale_max?: unknown }).scoring_scale_max;
    const options = Array.isArray(q.options)
      ? (q.options as { id?: string; label?: string }[])
          .map((o) => ({ id: String(o.id ?? '').trim(), label: String(o.label ?? '').trim() }))
          .filter((o) => o.id && o.label)
      : null;
    return {
      id: randomUUID(),
      sortOrder: i,
      questionType: String(q.question_type ?? 'short_text'),
      prompt: String(q.prompt ?? ''),
      helpText: String(q.help_text ?? ''),
      required: Boolean(q.required),
      isPageBreak: Boolean(q.is_page_break),
      scoringEnabled: q.scoring_enabled !== false,
      scoringScaleMax:
        Number.isInteger(scoringScaleRaw) && Number(scoringScaleRaw) >= 0 && Number(scoringScaleRaw) <= 5
          ? Number(scoringScaleRaw)
          : 5,
      initiallyHidden: Boolean(q.initially_hidden),
      locked: Boolean(q.locked),
      maxLength: q.max_length == null ? null : Number(q.max_length),
      options: String(q.question_type ?? '') === 'single_choice' ? options : null,
    };
  });

  return (
    <HiringApplicationFormEditorClient
      formId={formId}
      initialName={String(setRow.name ?? '').trim() || 'Untitled application form'}
      initialJobTitle={String((setRow as { job_title?: string | null }).job_title ?? '').trim()}
      initialGradeLevel={String((setRow as { grade_level?: string | null }).grade_level ?? '').trim()}
      initialDepartmentId={String((setRow as { department_id?: string | null }).department_id ?? '').trim()}
      departmentOptions={(departments ?? []) as { id: string; name: string }[]}
      jobTitleOptions={jobTitleOptions}
      gradeOptions={gradeOptions}
      initialQuestions={questions}
    />
  );
}
