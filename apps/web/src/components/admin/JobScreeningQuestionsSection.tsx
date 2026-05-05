'use client';

import {
  type JobScreeningQuestionPersist,
} from '@/app/(main)/admin/jobs/actions';
import {
  APPLICATION_QUESTION_TEMPLATE_CATEGORIES,
  APPLICATION_QUESTION_TEMPLATES,
  materializeApplicationQuestionTemplate,
} from '@/lib/jobs/applicationQuestionTemplates';
import type { ScreeningQuestionOption } from '@campsite/types';
import { SCREENING_QUESTION_TYPES } from '@campsite/types';
import { useEffect, useState } from 'react';

const fieldClass =
  'mt-1 w-full rounded-lg border border-neutral-300 bg-white px-3 py-2.5 text-[15px] leading-snug text-neutral-900 shadow-sm outline-none placeholder:text-neutral-400 transition-[border-color,box-shadow] focus:border-neutral-900 focus:ring-2 focus:ring-neutral-900/10 disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:opacity-70';
const labelClass = 'mb-1 block text-sm font-medium text-neutral-800';
const hintClass = 'mt-1 text-xs leading-relaxed text-neutral-500';

/** Display order for Answer format (matches product copy; all types must remain in `SCREENING_QUESTION_TYPES`). */
const ANSWER_FORMAT_ORDER = [
  'section_title',
  'paragraph',
  'short_text',
  'yes_no',
  'single_choice',
] as const;

function assertAnswerFormatOrder() {
  const set = new Set(SCREENING_QUESTION_TYPES);
  for (const t of ANSWER_FORMAT_ORDER) {
    if (!set.has(t)) {
      throw new Error(`ANSWER_FORMAT_ORDER includes unknown type: ${t}`);
    }
  }
}
assertAnswerFormatOrder();

function answerFormatOptionLabel(t: string): string {
  if (t === 'section_title') return 'Section title text';
  if (t === 'paragraph') return 'Long text';
  if (t === 'short_text') return 'Short answer';
  if (t === 'yes_no') return 'Yes / No';
  if (t === 'single_choice') return 'Single choice';
  return t;
}

function newQuestion(): JobScreeningQuestionPersist {
  return {
    id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `q-${Date.now()}`,
    sortOrder: 0,
    questionType: 'short_text',
    prompt: '',
    helpText: '',
    required: true,
    isPageBreak: false,
    scoringEnabled: true,
    scoringScaleMax: 5,
    initiallyHidden: false,
    locked: false,
    maxLength: null,
    options: null,
  };
}

function reindex(questions: JobScreeningQuestionPersist[]): JobScreeningQuestionPersist[] {
  return questions.map((q, i) => ({ ...q, sortOrder: i }));
}

export function JobScreeningQuestionsSection({
  disabled,
  currentJobId: _currentJobId,
  questions,
  onQuestionsChange,
  simplifiedLayout = false,
}: {
  disabled: boolean;
  /** Used to list other jobs and validate clone source. */
  currentJobId: string;
  questions: JobScreeningQuestionPersist[];
  onQuestionsChange: (next: JobScreeningQuestionPersist[]) => void;
  simplifiedLayout?: boolean;
}) {
  const [expandedById, setExpandedById] = useState<Record<string, boolean>>({});
  const [openMenuQuestionId, setOpenMenuQuestionId] = useState<string | null>(null);

  useEffect(() => {
    if (openMenuQuestionId === null) return;
    const onPointerDown = (e: PointerEvent) => {
      const el = document.querySelector(`[data-question-more-root="${openMenuQuestionId}"]`);
      if (el && e.target instanceof Node && el.contains(e.target)) return;
      setOpenMenuQuestionId(null);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [openMenuQuestionId]);

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

  function addPageBreak() {
    onQuestionsChange(
      reindex([
        ...questions,
        {
          ...newQuestion(),
          sortOrder: questions.length,
          questionType: 'paragraph',
          prompt: 'Page break',
          required: false,
          isPageBreak: true,
          scoringEnabled: false,
          scoringScaleMax: 0,
          maxLength: null,
        },
      ]),
    );
  }

  function addFromTemplate(templateId: string) {
    const q = materializeApplicationQuestionTemplate(templateId, questions.length);
    if (!q) return;
    onQuestionsChange(reindex([...questions, q]));
  }

  function setOptions(index: number, opts: ScreeningQuestionOption[]) {
    patchAt(index, { options: opts });
  }

  function moveOption(questionIndex: number, optionIndex: number, dir: -1 | 1) {
    const q = questions[questionIndex];
    if (!q) return;
    const opts = [...(q.options ?? [])];
    const nextIndex = optionIndex + dir;
    if (nextIndex < 0 || nextIndex >= opts.length) return;
    const next = opts[optionIndex];
    opts[optionIndex] = opts[nextIndex]!;
    opts[nextIndex] = next!;
    setOptions(questionIndex, opts);
  }

  function updateQuestionType(index: number, t: string) {
    const q = questions[index];
    if (!q) return;
    const patch: Partial<JobScreeningQuestionPersist> = { questionType: t };
    if (t === 'single_choice') {
      patch.options = [
        { id: crypto.randomUUID(), label: 'Option 1' },
        { id: crypto.randomUUID(), label: 'Option 2' },
      ];
      patch.maxLength = null;
    } else if (t === 'short_text') {
      patch.options = null;
      patch.maxLength = 500;
    } else if (t === 'paragraph') {
      patch.options = null;
      patch.maxLength = 8000;
    } else if (t === 'section_title') {
      patch.options = null;
      patch.maxLength = null;
      patch.required = false;
      patch.scoringEnabled = false;
      patch.scoringScaleMax = 0;
      patch.isPageBreak = false;
    } else {
      patch.options = null;
      patch.maxLength = null;
    }
    if (q.isPageBreak && t !== 'section_title') {
      patch.required = false;
      patch.scoringEnabled = false;
      patch.scoringScaleMax = 0;
    }
    patchAt(index, patch);
  }

  return (
    <section
      className={[
        'rounded-2xl border border-neutral-200 bg-gradient-to-b from-white to-neutral-50/80 shadow-sm',
        simplifiedLayout ? 'space-y-6 p-5 sm:p-6' : 'space-y-8 p-6 sm:p-8',
      ].join(' ')}
    >
      <header className={['space-y-2 border-b border-neutral-200', simplifiedLayout ? 'pb-4' : 'pb-6'].join(' ')}>
        <h2 className="text-base font-semibold tracking-tight text-neutral-900">Role application questions</h2>
        <p className="max-w-3xl text-sm leading-relaxed text-neutral-600">
          These are part of the application. They appear on the public apply form; answers are snapshotted on submit.
          Reviewers can score each answer using your configured 0–5 scale.
        </p>
      </header>

      {/* Library: templates */}
      <div className={['rounded-xl border border-neutral-200 bg-white shadow-sm', simplifiedLayout ? 'space-y-4 p-4' : 'space-y-5 p-5'].join(' ')}>
        <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Question library</h3>

        <details className="group rounded-lg border border-neutral-200 bg-neutral-50/80 open:bg-white">
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

      </div>

      <div className={simplifiedLayout ? 'space-y-4' : 'space-y-6'}>
        {questions.length === 0 ? (
          <p className="rounded-lg border border-dashed border-neutral-300 bg-white px-4 py-8 text-center text-sm text-neutral-600">
            No application questions yet. Add a blank question or pick a template above.
          </p>
        ) : (
          questions.map((q, index) => (
            <article
              key={q.id}
              className={[
                'rounded-xl border border-neutral-200 bg-white shadow-sm',
                simplifiedLayout ? 'p-4 sm:p-4' : 'p-5 sm:p-6',
              ].join(' ')}
              aria-labelledby={`q-head-${q.id}`}
            >
              <div className="relative" data-question-more-root={q.id}>
                <div
                  className={[
                    'flex flex-wrap items-start justify-between gap-3 border-b border-neutral-100',
                    simplifiedLayout ? 'mb-4 pb-3' : 'mb-5 pb-4',
                  ].join(' ')}
                >
                  <div className="min-w-0 flex-1">
                    <h4 id={`q-head-${q.id}`} className="text-sm font-semibold text-neutral-900">
                      {q.isPageBreak
                        ? 'Page Break'
                        : q.questionType === 'section_title' && !simplifiedLayout
                          ? 'Section title'
                          : simplifiedLayout
                            ? q.questionType === 'section_title'
                              ? String(q.prompt || 'Section title').trim()
                              : String(q.prompt || `Question ${index + 1}`).trim()
                            : `Question ${index + 1}`}
                    </h4>
                    {simplifiedLayout ? (
                      <p className="mt-1 text-[12px] text-neutral-600">
                        {q.isPageBreak ? (
                          <>
                            {String(q.prompt ?? '').trim()
                              ? String(q.prompt).trim()
                              : 'Divider shown to applicants'}
                          </>
                        ) : q.questionType === 'section_title' ? (
                          <>Section title text · No answer field</>
                        ) : (
                          <>
                            {answerFormatOptionLabel(q.questionType)}
                            {' · '}
                            {q.required ? 'Required' : 'Optional'}
                            {q.scoringEnabled && !q.isPageBreak ? ` · Scoring 0-${q.scoringScaleMax || 5}` : ''}
                            {q.initiallyHidden ? ' · Initially hidden' : ''}
                          </>
                        )}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {simplifiedLayout ? (
                      <>
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() =>
                            setExpandedById((prev) => ({
                              ...prev,
                              [q.id]: !(prev[q.id] ?? false),
                            }))
                          }
                          className="rounded-lg border border-[#9acd8f] bg-[#8dc37e] px-3 py-1.5 text-xs font-semibold text-white hover:brightness-95 disabled:opacity-40"
                        >
                          {(expandedById[q.id] ?? false) ? 'Close' : 'Edit'}
                        </button>
                        <button
                          type="button"
                          disabled={disabled}
                          onClick={() => setOpenMenuQuestionId((prev) => (prev === q.id ? null : q.id))}
                          className="rounded-lg border border-[#9acd8f] bg-[#8dc37e] px-3 py-1.5 text-xs font-semibold text-white hover:brightness-95 disabled:opacity-40"
                        >
                          More
                        </button>
                      </>
                    ) : null}
                  <button
                    type="button"
                    disabled={disabled || q.locked || index === 0}
                    onClick={() => move(index, -1)}
                    className="rounded-lg border border-neutral-300 bg-neutral-50 px-3 py-1.5 text-xs font-medium text-neutral-800 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Move up
                  </button>
                  <button
                    type="button"
                    disabled={disabled || q.locked || index === questions.length - 1}
                    onClick={() => move(index, 1)}
                    className="rounded-lg border border-neutral-300 bg-neutral-50 px-3 py-1.5 text-xs font-medium text-neutral-800 hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Move down
                  </button>
                  <button
                    type="button"
                    disabled={disabled || q.locked}
                    onClick={() => remove(index)}
                    className="rounded-lg border border-red-200 bg-red-50/80 px-3 py-1.5 text-xs font-medium text-red-800 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Remove
                  </button>
                  </div>
                </div>

                {simplifiedLayout && openMenuQuestionId === q.id ? (
                  <div className="absolute right-0 top-11 z-10 w-[260px] rounded-lg border border-neutral-200 bg-white p-3 shadow-lg">
                    <div className="space-y-2 text-[12.5px] text-neutral-800">
                      {q.questionType !== 'section_title' ? (
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={q.required}
                          disabled={disabled || q.locked || q.isPageBreak}
                          onChange={(e) => patchAt(index, { required: e.target.checked })}
                        />
                        Require answer
                      </label>
                      ) : null}
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={q.initiallyHidden}
                          disabled={disabled || q.locked}
                          onChange={(e) => patchAt(index, { initiallyHidden: e.target.checked })}
                        />
                        Initially hidden during shortlist
                      </label>
                      {q.questionType === 'section_title' ? (
                        <div>
                          <span className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                            Change to
                          </span>
                          <div className="flex flex-col gap-1">
                            {ANSWER_FORMAT_ORDER.filter((t) => t !== 'section_title').map((t) => (
                              <button
                                key={t}
                                type="button"
                                disabled={disabled || q.locked}
                                onClick={() => {
                                  updateQuestionType(index, t);
                                  setOpenMenuQuestionId(null);
                                }}
                                className="w-full rounded border border-neutral-200 bg-white px-2 py-1.5 text-left text-[12.5px] text-neutral-800 hover:bg-neutral-50 disabled:opacity-40"
                              >
                                {answerFormatOptionLabel(t)}
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <label className="block">
                          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                            Answer format
                          </span>
                          <select
                            className="w-full rounded border border-neutral-300 px-2 py-1.5 text-[12.5px]"
                            disabled={disabled || q.locked}
                            value={q.questionType}
                            onChange={(e) => updateQuestionType(index, e.target.value)}
                          >
                            {ANSWER_FORMAT_ORDER.map((t) => (
                              <option key={t} value={t}>
                                {answerFormatOptionLabel(t)}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                      {q.questionType !== 'section_title' ? (
                      <label className="block">
                        <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                          Scoring
                        </span>
                        <select
                          className="w-full rounded border border-neutral-300 px-2 py-1.5 text-[12.5px]"
                          disabled={disabled || q.locked || q.isPageBreak}
                          value={q.scoringEnabled ? 'enabled' : 'disabled'}
                          onChange={(e) => {
                            const isEnabled = e.target.value === 'enabled';
                            patchAt(index, {
                              scoringEnabled: isEnabled,
                              scoringScaleMax: isEnabled ? Math.max(1, q.scoringScaleMax || 5) : 0,
                            });
                          }}
                        >
                          <option value="enabled">Enabled</option>
                          <option value="disabled">Disabled</option>
                        </select>
                      </label>
                      ) : null}
                      {q.scoringEnabled && !q.isPageBreak && q.questionType !== 'section_title' ? (
                        <label className="block">
                          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                            Scoring scale
                          </span>
                          <select
                            className="w-full rounded border border-neutral-300 px-2 py-1.5 text-[12.5px]"
                            disabled={disabled || q.locked}
                            value={String(q.scoringScaleMax || 5)}
                            onChange={(e) =>
                              patchAt(index, {
                                scoringScaleMax: Number.parseInt(e.target.value, 10) || 0,
                              })
                            }
                          >
                            {[1, 2, 3, 4, 5].map((n) => (
                              <option key={n} value={String(n)}>
                                0-{n}
                              </option>
                            ))}
                          </select>
                        </label>
                      ) : null}
                      <button
                        type="button"
                        disabled={disabled || q.locked}
                        onClick={() => {
                          const makePageBreak = !q.isPageBreak;
                          patchAt(index, {
                            isPageBreak: makePageBreak,
                            questionType:
                              makePageBreak && q.questionType === 'section_title' ? 'paragraph' : q.questionType,
                            required: makePageBreak ? false : q.required,
                            scoringEnabled: makePageBreak ? false : q.scoringEnabled,
                            scoringScaleMax: makePageBreak ? 0 : q.scoringScaleMax || 5,
                          });
                        }}
                        className="w-full rounded border border-neutral-300 px-2 py-1.5 text-left text-[12.5px] hover:bg-neutral-50"
                      >
                        {q.isPageBreak ? 'Remove page break' : 'Add page break'}
                      </button>
                      <button
                        type="button"
                        disabled={disabled || q.locked}
                        onClick={() => remove(index)}
                        className="w-full rounded border border-red-200 bg-red-50 px-2 py-1.5 text-left text-[12.5px] text-red-700 hover:bg-red-100"
                      >
                        Delete question
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>

              {!simplifiedLayout || (expandedById[q.id] ?? false) ? (
              <div className={simplifiedLayout ? 'space-y-3' : 'space-y-4'}>
                <div>
                  <label className={labelClass} htmlFor={`prompt-${q.id}`}>
                    {q.isPageBreak ? 'Page break label' : q.questionType === 'section_title' ? 'Section title text' : 'Question'}
                  </label>
                  <input
                    id={`prompt-${q.id}`}
                    className={fieldClass}
                    disabled={disabled || q.locked}
                    value={q.prompt}
                    onChange={(e) => patchAt(index, { prompt: e.target.value })}
                    placeholder={
                      q.isPageBreak
                        ? 'e.g. Your suitability'
                        : q.questionType === 'section_title'
                          ? 'Heading shown to applicants (bold)'
                          : 'Type the question shown to applicants'
                    }
                  />
                </div>

                {q.questionType === 'section_title' ? (
                  <p className={hintClass}>
                    Applicants only see this heading and optional help text—there is no answer field. Open{' '}
                    <strong className="font-medium text-neutral-700">More</strong> and use{' '}
                    <strong className="font-medium text-neutral-700">Change to</strong> when you need answer fields.
                  </p>
                ) : (
                <div className={['grid sm:grid-cols-2', simplifiedLayout ? 'gap-3 lg:grid-cols-4' : 'gap-4 lg:grid-cols-4'].join(' ')}>
                  <fieldset className="min-w-0 space-y-1">
                    <legend className={labelClass}>Answer format</legend>
                    <select
                      className={fieldClass}
                      disabled={disabled || q.locked}
                      value={q.questionType}
                      onChange={(e) => {
                        updateQuestionType(index, e.target.value);
                      }}
                    >
                      {ANSWER_FORMAT_ORDER.map((t) => (
                        <option key={t} value={t}>
                          {answerFormatOptionLabel(t)}
                        </option>
                      ))}
                    </select>
                  </fieldset>

                  <div className="flex items-end">
                    <label className="flex min-h-[3rem] w-full cursor-pointer items-center gap-3 rounded-lg border border-neutral-200 bg-neutral-50/60 px-4 py-3 text-sm font-medium text-neutral-900">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-neutral-400 text-neutral-900 focus:ring-neutral-900"
                        checked={q.required}
                        disabled={disabled || q.locked || q.isPageBreak || q.questionType === 'section_title'}
                        onChange={(e) => patchAt(index, { required: e.target.checked })}
                      />
                      Required
                    </label>
                  </div>

                  <div className="space-y-1">
                    <label className={labelClass} htmlFor={`scoring-enabled-${q.id}`}>
                      Scoring
                    </label>
                    <select
                      id={`scoring-enabled-${q.id}`}
                      className={fieldClass}
                      disabled={disabled || q.locked || q.isPageBreak || q.questionType === 'section_title'}
                      value={q.scoringEnabled ? 'enabled' : 'disabled'}
                      onChange={(e) => {
                        const isEnabled = e.target.value === 'enabled';
                        patchAt(index, {
                          scoringEnabled: isEnabled,
                          scoringScaleMax: isEnabled ? Math.max(1, q.scoringScaleMax || 5) : 0,
                        });
                      }}
                    >
                      <option value="enabled">Enable scoring</option>
                      <option value="disabled">Disable scoring</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className={labelClass} htmlFor={`score-scale-${q.id}`}>
                      Scale
                    </label>
                    <select
                      id={`score-scale-${q.id}`}
                      className={fieldClass}
                      disabled={
                        disabled || q.locked || q.isPageBreak || q.questionType === 'section_title' || !q.scoringEnabled
                      }
                      value={q.scoringEnabled ? String(q.scoringScaleMax || 5) : '0'}
                      onChange={(e) =>
                        patchAt(index, {
                          scoringScaleMax: Number.parseInt(e.target.value, 10) || 0,
                        })
                      }
                    >
                      {[0, 1, 2, 3, 4, 5].map((n) => (
                        <option key={n} value={String(n)}>
                          0-{n}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                )}

                {!simplifiedLayout && !q.isPageBreak && q.questionType !== 'section_title' ? (
                  <div className="mt-1 grid gap-3 sm:grid-cols-2">
                    <label className="flex items-center gap-2 text-[13px] text-neutral-800">
                      <input
                        type="checkbox"
                        checked={q.isPageBreak}
                        disabled={disabled || q.locked}
                        onChange={(e) =>
                          patchAt(index, {
                            isPageBreak: e.target.checked,
                            questionType:
                              e.target.checked && q.questionType === 'section_title' ? 'paragraph' : q.questionType,
                            required: e.target.checked ? false : q.required,
                            scoringEnabled: e.target.checked ? false : q.scoringEnabled,
                            scoringScaleMax: e.target.checked ? 0 : q.scoringScaleMax || 5,
                          })
                        }
                      />
                      Page break (display-only divider for applicants)
                    </label>
                    <label className="flex items-center gap-2 text-[13px] text-neutral-800">
                      <input
                        type="checkbox"
                        checked={q.initiallyHidden}
                        disabled={disabled || q.locked}
                        onChange={(e) => patchAt(index, { initiallyHidden: e.target.checked })}
                      />
                      Initially hidden during shortlisting
                    </label>
                    <label className="flex items-center gap-2 text-[13px] text-neutral-800">
                      <input
                        type="checkbox"
                        checked={q.locked}
                        disabled={disabled}
                        onChange={(e) => patchAt(index, { locked: e.target.checked })}
                      />
                      Locked
                    </label>
                  </div>
                ) : null}
              </div>
              ) : null}

              {simplifiedLayout && !q.isPageBreak ? (
                q.questionType === 'section_title' ? (
                  <div className="mt-4">
                    <label className={labelClass} htmlFor={`help-${q.id}`}>
                      Help text <span className="font-normal text-neutral-500">(optional)</span>
                    </label>
                    <input
                      id={`help-${q.id}`}
                      className={fieldClass}
                      disabled={disabled || q.locked}
                      value={q.helpText}
                      onChange={(e) => patchAt(index, { helpText: e.target.value })}
                      placeholder="Optional text shown under the section heading"
                    />
                  </div>
                ) : (
                <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_220px] sm:items-start">
                  <div>
                    <label className={labelClass} htmlFor={`help-${q.id}`}>
                      Help text <span className="font-normal text-neutral-500">(optional)</span>
                    </label>
                    <input
                      id={`help-${q.id}`}
                      className={fieldClass}
                      disabled={disabled || q.locked}
                      value={q.helpText}
                      onChange={(e) => patchAt(index, { helpText: e.target.value })}
                      placeholder="Short hint shown under the prompt"
                    />
                  </div>
                  {q.questionType === 'short_text' || q.questionType === 'paragraph' ? (
                    <div>
                      <label className={labelClass} htmlFor={`max-${q.id}`}>
                        Max length <span className="font-normal text-neutral-500">(optional)</span>
                      </label>
                      <input
                        id={`max-${q.id}`}
                        type="number"
                        min={1}
                        max={20000}
                        className={fieldClass}
                        disabled={disabled || q.locked}
                        value={q.maxLength ?? ''}
                        placeholder={q.questionType === 'short_text' ? '500' : '8000'}
                        onChange={(e) => {
                          const v = e.target.value.trim();
                          patchAt(index, { maxLength: v === '' ? null : Number.parseInt(v, 10) || null });
                        }}
                      />
                      <p className={hintClass}>Character limit enforced on apply.</p>
                    </div>
                  ) : null}
                </div>
                )
              ) : null}

              {!simplifiedLayout && !q.isPageBreak ? (
                <div className="mt-5">
                  <label className={labelClass} htmlFor={`help-${q.id}`}>
                    Help text <span className="font-normal text-neutral-500">(optional)</span>
                  </label>
                  <input
                    id={`help-${q.id}`}
                    className={fieldClass}
                    disabled={disabled || q.locked}
                    value={q.helpText}
                    onChange={(e) => patchAt(index, { helpText: e.target.value })}
                    placeholder={
                      q.questionType === 'section_title'
                        ? 'Optional text shown under the section heading'
                        : 'Short hint shown under the prompt'
                    }
                  />
                </div>
              ) : null}

              {!simplifiedLayout && !q.isPageBreak && (q.questionType === 'short_text' || q.questionType === 'paragraph') ? (
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
                    disabled={disabled || q.locked}
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

              {!q.isPageBreak && q.questionType === 'single_choice' ? (
                <div className="mt-5 space-y-3">
                  <p className={labelClass}>Choices</p>
                  <p className={hintClass}>
                    Add custom option labels. Applicants can select one option only.
                  </p>
                  {(q.options ?? []).map((opt, oi) => (
                    <div key={opt.id} className="flex flex-col gap-2 rounded-lg border border-neutral-100 bg-neutral-50/50 p-3 sm:flex-row sm:items-center">
                      <div
                        className={`${fieldClass} flex items-center font-medium text-neutral-700 sm:w-36`}
                        aria-label={`Choice ${oi + 1} order`}
                        title="Display order"
                      >
                        Option {oi + 1}
                      </div>
                      <input
                        className={`${fieldClass} min-w-0 flex-1`}
                        disabled={disabled || q.locked}
                        value={opt.label}
                        onChange={(e) => {
                          const opts = [...(q.options ?? [])];
                          opts[oi] = { ...opts[oi]!, label: e.target.value };
                          setOptions(index, opts);
                        }}
                        placeholder="Label shown to applicant"
                        aria-label={`Choice ${oi + 1} label`}
                      />
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          disabled={disabled || q.locked || oi === 0}
                          onClick={() => moveOption(index, oi, -1)}
                          className="h-8 rounded-md border border-neutral-300 bg-white px-2 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-40"
                          aria-label={`Move choice ${oi + 1} up`}
                          title="Move up"
                        >
                          Up
                        </button>
                        <button
                          type="button"
                          disabled={disabled || q.locked || oi === (q.options?.length ?? 0) - 1}
                          onClick={() => moveOption(index, oi, 1)}
                          className="h-8 rounded-md border border-neutral-300 bg-white px-2 text-xs font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-40"
                          aria-label={`Move choice ${oi + 1} down`}
                          title="Move down"
                        >
                          Down
                        </button>
                      </div>
                      <button
                        type="button"
                        disabled={disabled || q.locked || (q.options?.length ?? 0) <= 1}
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
                    disabled={disabled || q.locked}
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
        {!simplifiedLayout ? (
          <button
            type="button"
            disabled={disabled}
            onClick={addPageBreak}
            className="rounded-lg border border-neutral-300 bg-white px-4 py-2.5 text-sm font-medium text-neutral-900 shadow-sm hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Add page break
          </button>
        ) : null}
      </div>
    </section>
  );
}
