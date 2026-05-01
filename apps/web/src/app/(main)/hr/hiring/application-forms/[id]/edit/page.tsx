import { randomUUID } from 'node:crypto';
import { HiringApplicationFormEditorClient } from '@/components/admin/HiringApplicationFormEditorClient';
import { getCachedHiringApplicationFormEditPageData } from '@/lib/recruitment/getCachedHiringApplicationFormEditPageData';
import {
  getCachedMainShellLayoutBundle,
} from '@/lib/supabase/cachedMainShellLayoutBundle';
import {
  parseShellPermissionKeys,
  shellBundleOrgId,
  shellBundleProfileStatus,
} from '@/lib/shell/shellBundleAccess';
import { redirect } from 'next/navigation';

export default async function EditApplicationFormPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: rawId } = await params;
  const formId = rawId?.trim();
  if (!formId) redirect('/hr/hiring/application-forms');

  const shellBundle = await getCachedMainShellLayoutBundle();
  const orgId = shellBundleOrgId(shellBundle);
  if (!orgId) redirect('/login');
  if (shellBundleProfileStatus(shellBundle) !== 'active') redirect('/broadcasts');
  const permissionKeys = parseShellPermissionKeys(shellBundle);
  if (!permissionKeys.includes('jobs.view')) redirect('/forbidden');

  const pageData = await getCachedHiringApplicationFormEditPageData(orgId, formId);
  if (!pageData?.setRow?.id) redirect('/hr/hiring/application-forms');

  const { setRow, rows, departments, jobRows } = pageData;

  const jobTitleOptions = Array.from(
    new Set((jobRows ?? []).map((j) => String(j.title ?? '').trim()).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b));
  const gradeOptions = Array.from(
    new Set((jobRows ?? []).map((j) => String(j.grade_level ?? '').trim()).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b));

  const questions = rows.map((q, i) => {
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
        Number.isInteger(q.scoring_scale_max) && Number(q.scoring_scale_max) >= 0 && Number(q.scoring_scale_max) <= 5
          ? Number(q.scoring_scale_max)
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
