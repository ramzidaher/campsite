'use client';

import {
  cloneJobScreeningQuestionsFromJob,
  createOrgApplicationQuestionSetFromQuestions,
  deleteOrgApplicationQuestionSet,
  listOrgApplicationQuestionSets,
  listSiblingJobsForQuestionImport,
  loadOrgApplicationQuestionSetAsPersist,
  type JobScreeningQuestionPersist,
  type OrgApplicationQuestionSetSummary,
} from '@/app/(main)/admin/jobs/actions';
import {
  APPLICATION_QUESTION_TEMPLATE_CATEGORIES,
  APPLICATION_QUESTION_TEMPLATES,
  materializeApplicationQuestionTemplate,
} from '@/lib/jobs/applicationQuestionTemplates';
import type { ScreeningQuestionOption } from '@campsite/types';
import { SCREENING_QUESTION_TYPES } from '@campsite/types';
import { useEffect, useState, useTransition } from 'react';

const fieldClass =
  'mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-[15px] leading-snug text-neutral-900 shadow-sm outline-none placeholder:text-neutral-400 transition-[border-color,box-shadow] focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10 disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:opacity-70';
const labelClass = 'mb-1 block text-sm font-medium text-neutral-800';
const hintClass = 'mt-1 text-xs leading-relaxed text-neutral-500';

function newQuestion(): JobScreeningQuestionPersist {
  return {
    id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `q-${Date.now()}`,
    sortOrder: 0,
    questionType: 'short_text',
    prompt: '',
    helpText: '',
    required: true,
    maxLength: null,
    options: null,
  };
}

function reindex(questions: JobScreeningQuestionPersist[]): JobScreeningQuestionPersist[] {
  return questions.map((q, i) => ({ ...q, sortOrder: i }));
}

function appendCloned(
  existing: JobScreeningQuestionPersist[],
  cloned: JobScreeningQuestionPersist[],
): JobScreeningQuestionPersist[] {
  const base = existing.length;
  return reindex([...existing, ...cloned.map((q, i) => ({ ...q, sortOrder: base + i }))]);
}

export function JobScreeningQuestionsSection({
  disabled,
  currentJobId,
  questions,
  onQuestionsChange,
}: {
  disabled: boolean;
  /** Used to list other jobs and validate clone source. */
  currentJobId: string;
  questions: JobScreeningQuestionPersist[];
  onQuestionsChange: (next: JobScreeningQuestionPersist[]) => void;
}) {
  const [siblingJobs, setSiblingJobs] = useState<{ id: string; title: string; status: string }[]>([]);
  const [siblingLoadErr, setSiblingLoadErr] = useState<string | null>(null);
  const [importSourceId, setImportSourceId] = useState('');
  const [jobImportMerge, setJobImportMerge] = useState<'append' | 'replace'>('append');
  const [importBanner, setImportBanner] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [importPending, startImportTransition] = useTransition();

  const [savedSets, setSavedSets] = useState<OrgApplicationQuestionSetSummary[]>([]);
  const [savedSetsErr, setSavedSetsErr] = useState<string | null>(null);
  const [saveSetName, setSaveSetName] = useState('');
  const [loadSetId, setLoadSetId] = useState('');
  const [savedSetMerge, setSavedSetMerge] = useState<'append' | 'replace'>('append');
  const [setLibraryBanner, setSetLibraryBanner] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [setOpPending, startSetOpTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await listSiblingJobsForQuestionImport(currentJobId);
      if (cancelled) return;
      if (!res.ok) {
        setSiblingLoadErr(res.error);
        setSiblingJobs([]);
        return;
      }
      setSiblingLoadErr(null);
      setSiblingJobs(res.jobs);
    })();
    return () => {
      cancelled = true;
    };
  }, [currentJobId]);

  async function refreshSavedSetsIntoState() {
    const res = await listOrgApplicationQuestionSets();
    if (!res.ok) {
      setSavedSetsErr(res.error);
      setSavedSets([]);
      return;
    }
    setSavedSetsErr(null);
    setSavedSets(res.sets);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await listOrgApplicationQuestionSets();
      if (cancelled) return;
      if (!res.ok) {
        setSavedSetsErr(res.error);
        setSavedSets([]);
        return;
      }
      setSavedSetsErr(null);
      setSavedSets(res.sets);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function applyQuestionsMerge(mode: 'append' | 'replace', imported: JobScreeningQuestionPersist[]): boolean {
    if (mode === 'replace' && questions.length > 0) {
      if (
        typeof window !== 'undefined' &&
        !window.confirm(
          'Replace all current questions on this job? You can still reload the page before Save to discard local changes.',
        )
      ) {
        return false;
      }
    }
    if (mode === 'replace') {
      onQuestionsChange(reindex(imported));
    } else {
      onQuestionsChange(appendCloned(questions, imported));
    }
    return true;
  }

  function patchAt(index: number, patch: Partial<JobScreeningQuestionPersist>) {
    const next = questions.map((q, i) => (i === index ? { ...q, ...patch } : q));
    onQuestionsChange(next);
  }

  function move(index: number, dir: -1 | 1) {
    const j = index + dir;
    if (j < 0 || j >= questions.length) return;
    const next = [...questions];
    const t = next[index]!;
    next[index] = next[j]!;
    next[j] = t;
    onQuestionsChange(reindex(next));
  }

  function remove(index: number) {
    onQuestionsChange(reindex(questions.filter((_, i) => i !== index)));
  }

  function addBlank() {
    onQuestionsChange(reindex([...questions, { ...newQuestion(), sortOrder: questions.length }]));
  }

  function addFromTemplate(templateId: string) {
    const q = materializeApplicationQuestionTemplate(templateId, questions.length);
    if (!q) return;
    onQuestionsChange(reindex([...questions, q]));
  }

  function setOptions(index: number, opts: ScreeningQuestionOption[]) {
    patchAt(index, { options: opts });
  }

  function runImportFromJob() {
    setImportBanner(null);
    const sid = importSourceId.trim();
    if (!sid) {
      setImportBanner({ type: 'err', text: 'Choose a job to copy from.' });
      return;
    }
    startImportTransition(async () => {
      const res = await cloneJobScreeningQuestionsFromJob(sid, currentJobId);
      if (!res.ok) {
        setImportBanner({ type: 'err', text: res.error });
        return;
      }
      const ok = applyQuestionsMerge(jobImportMerge, res.questions);
      if (!ok) return;
      const verb = jobImportMerge === 'replace' ? 'Replaced with' : 'Added';
      setImportBanner({
        type: 'ok',
        text: `${verb} ${res.questions.length} question${res.questions.length === 1 ? '' : 's'}. Save the listing to persist.`,
      });
    });
  }

  function runLoadSavedSet() {
    setSetLibraryBanner(null);
    const id = loadSetId.trim();
    if (!id) {
      setSetLibraryBanner({ type: 'err', text: 'Choose a saved set.' });
      return;
    }
    startSetOpTransition(async () => {
      const res = await loadOrgApplicationQuestionSetAsPersist(id);
      if (!res.ok) {
        setSetLibraryBanner({ type: 'err', text: res.error });
        return;
      }
      const ok = applyQuestionsMerge(savedSetMerge, res.questions);
      if (!ok) return;
      const verb = savedSetMerge === 'replace' ? 'Replaced with' : 'Added';
      setSetLibraryBanner({
        type: 'ok',
        text: `${verb} ${res.questions.length} question${res.questions.length === 1 ? '' : 's'} from the saved set. Save to persist.`,
      });
    });
  }

  function runSaveCurrentAsSet() {
    setSetLibraryBanner(null);
    const name = saveSetName.trim();
    if (!name) {
      setSetLibraryBanner({ type: 'err', text: 'Enter a name for the saved set.' });
      return;
    }
    startSetOpTransition(async () => {
      const res = await createOrgApplicationQuestionSetFromQuestions(name, questions);
      if (!res.ok) {
        setSetLibraryBanner({ type: 'err', text: res.error });
        return;
      }
      setSaveSetName('');
      setSetLibraryBanner({ type: 'ok', text: `Saved “${name}” for your organisation.` });
      await refreshSavedSetsIntoState();
    });
  }

  function runDeleteSavedSet() {
    setSetLibraryBanner(null);
    const id = loadSetId.trim();
    if (!id) {
      setSetLibraryBanner({ type: 'err', text: 'Choose a saved set to delete.' });
      return;
    }
    if (typeof window !== 'undefined' && !window.confirm('Delete this saved question set for everyone in your organisation?')) {
      return;
    }
    startSetOpTransition(async () => {
      const res = await deleteOrgApplicationQuestionSet(id);
      if (!res.ok) {
        setSetLibraryBanner({ type: 'err', text: res.error });
        return;
      }
      setLoadSetId('');
      setSetLibraryBanner({ type: 'ok', text: 'Saved set deleted.' });
      await refreshSavedSetsIntoState();
    });
  }

  return (
    <section className="space-y-8 rounded-2xl border border-neutral-200 bg-gradient-to-b from-white to-neutral-50/80 p-6 shadow-sm sm:p-8">
      <header className="space-y-2 border-b border-neutral-200 pb-6">
        <h2 className="text-base font-semibold tracking-tight text-neutral-900">Role application questions</h2>
        <p className="max-w-3xl text-sm leading-relaxed text-neutral-600">
          These are part of the application. They appear on the public apply form; answers are snapshotted on submit.
          Reviewers can score each answer (1–5); team averages help compare candidates.
        </p>
      </header>

      {/* Library: templates + import */}
      <div className="space-y-5 rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Question library</h3>

        <details className="group rounded-lg border border-neutral-200 bg-neutral-50/80 open:bg-white" open>
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium text-neutral-900 outline-none [&::-webkit-details-marker]:hidden">
            <span className="flex items-center justify-between gap-2">
              <span>Starter templates</span>
              <span className="text-xs font-normal text-neutral-500 group-open:hidden">Show</span>
              <span className="hidden text-xs font-normal text-neutral-500 group-open:inline">Hide</span>
            </span>
          </summary>
          <div className="border-t border-neutral-200 px-4 pb-4 pt-2">
            <p className={hintClass}>
              Insert a question you can edit afterwards. Same prompts are often reused across roles.
            </p>
            <div className="mt-4 space-y-6">
              {APPLICATION_QUESTION_TEMPLATE_CATEGORIES.map((cat) => (
                <div key={cat}>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">{cat}</p>
                  <div className="flex flex-wrap gap-2">
                    {APPLICATION_QUESTION_TEMPLATES.filter((t) => t.category === cat).map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        disabled={disabled}
                        title={t.description}
                        onClick={() => addFromTemplate(t.id)}
                        className="max-w-full rounded-full border border-neutral-300 bg-white px-3 py-1.5 text-left text-[13px] font-medium text-neutral-800 shadow-sm transition-colors hover:border-neutral-900 hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {t.title}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </details>

        <div className="rounded-lg border border-neutral-200 bg-neutral-50/80 p-4">
          <p className="text-sm font-medium text-neutral-900">Copy from another job</p>
          <p className={hintClass}>
            Reuse questions from a draft or live listing. New choice ids are generated automatically.
          </p>
          <fieldset className="mt-3 space-y-2">
            <legend className="text-xs font-medium text-neutral-600">When importing</legend>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-neutral-800">
              <input
                type="radio"
                name="job_import_merge"
                className="h-4 w-4 border-neutral-400 text-neutral-900"
                checked={jobImportMerge === 'append'}
                disabled={disabled || importPending}
                onChange={() => setJobImportMerge('append')}
              />
              Append to current questions
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-neutral-800">
              <input
                type="radio"
                name="job_import_merge"
                className="h-4 w-4 border-neutral-400 text-neutral-900"
                checked={jobImportMerge === 'replace'}
                disabled={disabled || importPending}
                onChange={() => setJobImportMerge('replace')}
              />
              Replace all current questions
            </label>
          </fieldset>
          {siblingLoadErr ? (
            <p className="mt-2 text-sm text-red-700" role="alert">
              {siblingLoadErr}
            </p>
          ) : siblingJobs.length === 0 ? (
            <p className="mt-2 text-sm text-neutral-500">No other draft or live jobs found to copy from.</p>
          ) : (
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1">
                <label className={labelClass} htmlFor="import_job_questions">
                  Job listing
                </label>
                <select
                  id="import_job_questions"
                  className={fieldClass}
                  disabled={disabled || importPending}
                  value={importSourceId}
                  onChange={(e) => {
                    setImportSourceId(e.target.value);
                    setImportBanner(null);
                  }}
                >
                  <option value="">Select a job…</option>
                  {siblingJobs.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.title} ({j.status})
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                disabled={disabled || importPending || !importSourceId}
                onClick={runImportFromJob}
                className="shrink-0 rounded-lg border border-neutral-900 bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:border-neutral-300 disabled:bg-neutral-200 disabled:text-neutral-500"
              >
                {importPending ? 'Working…' : 'Import questions'}
              </button>
            </div>
          )}
          {importBanner ? (
            <p
              className={`mt-3 text-sm ${importBanner.type === 'ok' ? 'text-emerald-800' : 'text-red-700'}`}
              role="status"
            >
              {importBanner.text}
            </p>
          ) : null}
        </div>

        <div className="rounded-lg border border-neutral-200 bg-neutral-50/80 p-4">
          <p className="text-sm font-medium text-neutral-900">Saved sets (organisation)</p>
          <p className={hintClass}>
            Save this job’s current questions as a reusable library entry, or load a set you saved before. Anyone with
            job edit access in your organisation can use these sets.
          </p>
          {savedSetsErr ? (
            <p className="mt-2 text-sm text-red-700" role="alert">
              {savedSetsErr}
            </p>
          ) : null}
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1">
              <label className={labelClass} htmlFor="save_set_name">
                Save current questions as…
              </label>
              <input
                id="save_set_name"
                className={fieldClass}
                disabled={disabled || setOpPending}
                value={saveSetName}
                onChange={(e) => {
                  setSaveSetName(e.target.value);
                  setSetLibraryBanner(null);
                }}
                placeholder="e.g. Camp counsellor — standard pack"
              />
            </div>
            <button
              type="button"
              disabled={disabled || setOpPending || questions.length < 1}
              onClick={runSaveCurrentAsSet}
              className="shrink-0 rounded-lg border border-neutral-900 bg-white px-4 py-2.5 text-sm font-medium text-neutral-900 shadow-sm hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {setOpPending ? 'Saving…' : 'Save as set'}
            </button>
          </div>

          <fieldset className="mt-4 space-y-2 border-t border-neutral-200 pt-4">
            <legend className="text-xs font-medium text-neutral-600">Load a saved set</legend>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-neutral-800">
              <input
                type="radio"
                name="saved_set_merge"
                className="h-4 w-4 border-neutral-400 text-neutral-900"
                checked={savedSetMerge === 'append'}
                disabled={disabled || setOpPending}
                onChange={() => setSavedSetMerge('append')}
              />
              Append to current questions
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-neutral-800">
              <input
                type="radio"
                name="saved_set_merge"
                className="h-4 w-4 border-neutral-400 text-neutral-900"
                checked={savedSetMerge === 'replace'}
                disabled={disabled || setOpPending}
                onChange={() => setSavedSetMerge('replace')}
              />
              Replace all current questions
            </label>
          </fieldset>

          {savedSets.length === 0 ? (
            <p className="mt-3 text-sm text-neutral-500">No saved sets yet. Save one using the field above.</p>
          ) : (
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
              <div className="min-w-0 flex-1 sm:max-w-md">
                <label className={labelClass} htmlFor="load_saved_set">
                  Saved set
                </label>
                <select
                  id="load_saved_set"
                  className={fieldClass}
                  disabled={disabled || setOpPending}
                  value={loadSetId}
                  onChange={(e) => {
                    setLoadSetId(e.target.value);
                    setSetLibraryBanner(null);
                  }}
                >
                  <option value="">Select a set…</option>
                  {savedSets.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                disabled={disabled || setOpPending || !loadSetId}
                onClick={runLoadSavedSet}
                className="shrink-0 rounded-lg border border-neutral-900 bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:opacity-90 disabled:cursor-not-allowed disabled:border-neutral-300 disabled:bg-neutral-200 disabled:text-neutral-500"
              >
                {setOpPending ? 'Working…' : 'Load set'}
              </button>
              <button
                type="button"
                disabled={disabled || setOpPending || !loadSetId}
                onClick={runDeleteSavedSet}
                className="shrink-0 rounded-lg border border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-900 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Delete set
              </button>
            </div>
          )}
          {setLibraryBanner ? (
            <p
              className={`mt-3 text-sm ${setLibraryBanner.type === 'ok' ? 'text-emerald-800' : 'text-red-700'}`}
              role="status"
            >
              {setLibraryBanner.text}
            </p>
          ) : null}
        </div>
      </div>

      <div className="space-y-6">
        {questions.length === 0 ? (
          <p className="rounded-lg border border-dashed border-neutral-300 bg-white px-4 py-8 text-center text-sm text-neutral-600">
            No application questions yet. Add a blank question or pick a template above.
          </p>
        ) : (
          questions.map((q, index) => (
            <article
              key={q.id}
              className="rounded-xl border border-neutral-200 bg-white p-5 shadow-sm sm:p-6"
              aria-labelledby={`q-head-${q.id}`}
            >
              <div className="mb-5 flex flex-wrap items-start justify-between gap-3 border-b border-neutral-100 pb-4">
                <h4 id={`q-head-${q.id}`} className="text-sm font-semibold text-neutral-900">
                  Question {index + 1}
                </h4>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={disabled || index === 0}
                    onClick={() => move(index, -1)}
                    className="rounded-lg border border-neutral-300 bg-neutral-50 px-3 py-1.5 text-xs font-medium text-neutral-800 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Move up
                  </button>
                  <button
                    type="button"
                    disabled={disabled || index === questions.length - 1}
                    onClick={() => move(index, 1)}
                    className="rounded-lg border border-neutral-300 bg-neutral-50 px-3 py-1.5 text-xs font-medium text-neutral-800 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Move down
                  </button>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => remove(index)}
                    className="rounded-lg border border-red-200 bg-red-50/80 px-3 py-1.5 text-xs font-medium text-red-800 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Remove
                  </button>
                </div>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <fieldset className="min-w-0 space-y-1 sm:col-span-1">
                  <legend className={labelClass}>Answer format</legend>
                  <select
                    className={fieldClass}
                    disabled={disabled}
                    value={q.questionType}
                    onChange={(e) => {
                      const t = e.target.value;
                      const patch: Partial<JobScreeningQuestionPersist> = { questionType: t };
                      if (t === 'single_choice') {
                        patch.options = [{ id: crypto.randomUUID(), label: 'Option A' }];
                        patch.maxLength = null;
                      } else if (t === 'short_text') {
                        patch.options = null;
                        patch.maxLength = 500;
                      } else if (t === 'paragraph') {
                        patch.options = null;
                        patch.maxLength = 8000;
                      } else {
                        patch.options = null;
                        patch.maxLength = null;
                      }
                      patchAt(index, patch);
                    }}
                  >
                    {SCREENING_QUESTION_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t === 'short_text'
                          ? 'Short text'
                          : t === 'paragraph'
                            ? 'Paragraph'
                            : t === 'single_choice'
                              ? 'Multiple choice (single answer)'
                              : 'Yes / No'}
                      </option>
                    ))}
                  </select>
                </fieldset>

                <div className="flex min-h-[3rem] items-center rounded-lg border border-neutral-200 bg-neutral-50/60 px-4 py-3 sm:col-span-1">
                  <label className="flex cursor-pointer items-center gap-3 text-sm font-medium text-neutral-900">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-neutral-400 text-neutral-900 focus:ring-neutral-900"
                      checked={q.required}
                      disabled={disabled}
                      onChange={(e) => patchAt(index, { required: e.target.checked })}
                    />
                    Required before submit
                  </label>
                </div>
              </div>

              <div className="mt-5">
                <label className={labelClass} htmlFor={`prompt-${q.id}`}>
                  Prompt
                </label>
                <textarea
                  id={`prompt-${q.id}`}
                  className={`${fieldClass} min-h-[6.5rem] resize-y`}
                  disabled={disabled}
                  value={q.prompt}
                  onChange={(e) => patchAt(index, { prompt: e.target.value })}
                  placeholder="What applicants read (be specific to this role)"
                />
              </div>

              <div className="mt-5">
                <label className={labelClass} htmlFor={`help-${q.id}`}>
                  Help text <span className="font-normal text-neutral-500">(optional)</span>
                </label>
                <input
                  id={`help-${q.id}`}
                  className={fieldClass}
                  disabled={disabled}
                  value={q.helpText}
                  onChange={(e) => patchAt(index, { helpText: e.target.value })}
                  placeholder="Short hint shown under the prompt"
                />
              </div>

              {q.questionType === 'short_text' || q.questionType === 'paragraph' ? (
                <div className="mt-5">
                  <label className={labelClass} htmlFor={`max-${q.id}`}>
                    Max length <span className="font-normal text-neutral-500">(optional)</span>
                  </label>
                  <input
                    id={`max-${q.id}`}
                    type="number"
                    min={1}
                    max={20000}
                    className={`${fieldClass} max-w-xs`}
                    disabled={disabled}
                    value={q.maxLength ?? ''}
                    placeholder={q.questionType === 'short_text' ? '500' : '8000'}
                    onChange={(e) => {
                      const v = e.target.value.trim();
                      patchAt(index, { maxLength: v === '' ? null : Number.parseInt(v, 10) || null });
                    }}
                  />
                  <p className={hintClass}>Character limit enforced when the candidate applies.</p>
                </div>
              ) : null}

              {q.questionType === 'single_choice' ? (
                <div className="mt-5 space-y-3">
                  <p className={labelClass}>Choices</p>
                  <p className={hintClass}>Each choice needs a stable id (for scoring) and the label applicants see.</p>
                  {(q.options ?? []).map((opt, oi) => (
                    <div key={opt.id} className="flex flex-col gap-2 rounded-lg border border-neutral-100 bg-neutral-50/50 p-3 sm:flex-row sm:items-center">
                      <input
                        className={`${fieldClass} sm:w-36`}
                        disabled={disabled}
                        value={opt.id}
                        onChange={(e) => {
                          const opts = [...(q.options ?? [])];
                          opts[oi] = { ...opts[oi]!, id: e.target.value };
                          setOptions(index, opts);
                        }}
                        aria-label={`Choice ${oi + 1} id`}
                        title="Stable id stored with applications"
                      />
                      <input
                        className={`${fieldClass} min-w-0 flex-1`}
                        disabled={disabled}
                        value={opt.label}
                        onChange={(e) => {
                          const opts = [...(q.options ?? [])];
                          opts[oi] = { ...opts[oi]!, label: e.target.value };
                          setOptions(index, opts);
                        }}
                        placeholder="Label shown to applicant"
                        aria-label={`Choice ${oi + 1} label`}
                      />
                      <button
                        type="button"
                        disabled={disabled || (q.options?.length ?? 0) <= 1}
                        onClick={() => {
                          const opts = (q.options ?? []).filter((_, i) => i !== oi);
                          setOptions(index, opts);
                        }}
                        className="shrink-0 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-40"
                      >
                        Remove choice
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => {
                      const opts = [...(q.options ?? []), { id: crypto.randomUUID(), label: '' }];
                      setOptions(index, opts);
                    }}
                    className="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-medium text-neutral-900 hover:bg-neutral-50"
                  >
                    Add choice
                  </button>
                </div>
              ) : null}
            </article>
          ))
        )}
      </div>

      <div className="flex flex-wrap gap-3 border-t border-neutral-200 pt-6">
        <button
          type="button"
          disabled={disabled}
          onClick={addBlank}
          className="rounded-lg border border-neutral-900 bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Add blank question
        </button>
      </div>
    </section>
  );
}
