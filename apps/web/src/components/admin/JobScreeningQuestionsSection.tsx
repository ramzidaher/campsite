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

  return (
    <section className="space-y-8 rounded-2xl border border-neutral-200 bg-gradient-to-b from-white to-neutral-50/80 p-6 shadow-sm sm:p-8">
      <header className="space-y-2 border-b border-neutral-200 pb-6">
        <h2 className="text-base font-semibold tracking-tight text-neutral-900">Role application questions</h2>
        <p className="max-w-3xl text-sm leading-relaxed text-neutral-600">
          These are part of the application. They appear on the public apply form; answers are snapshotted on submit.
          Reviewers can score each answer using your configured 0–5 scale.
        </p>
      </header>

      {/* Library: templates */}
      <div className="space-y-5 rounded-xl border border-neutral-200 bg-white p-5 shadow-sm">
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

              <div className="space-y-4">
                <div>
                  <label className={labelClass} htmlFor={`prompt-${q.id}`}>
                    {q.isPageBreak ? 'Page break label' : 'Question'}
                  </label>
                  <input
                    id={`prompt-${q.id}`}
                    className={fieldClass}
                    disabled={disabled || q.locked}
                    value={q.prompt}
                    onChange={(e) => patchAt(index, { prompt: e.target.value })}
                    placeholder={q.isPageBreak ? 'e.g. Your suitability' : 'Type the question shown to applicants'}
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <fieldset className="min-w-0 space-y-1">
                    <legend className={labelClass}>Answer format</legend>
                    <select
                      className={fieldClass}
                      disabled={disabled || q.locked}
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
                        if (q.isPageBreak) {
                          patch.required = false;
                          patch.scoringEnabled = false;
                          patch.scoringScaleMax = 0;
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

                  <div className="flex items-end">
                    <label className="flex min-h-[3rem] w-full cursor-pointer items-center gap-3 rounded-lg border border-neutral-200 bg-neutral-50/60 px-4 py-3 text-sm font-medium text-neutral-900">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-neutral-400 text-neutral-900 focus:ring-neutral-900"
                        checked={q.required}
                        disabled={disabled || q.locked || q.isPageBreak}
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
                      disabled={disabled || q.locked || q.isPageBreak || !q.scoringEnabled}
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

                {!simplifiedLayout ? (
                  <div className="mt-1 grid gap-3 sm:grid-cols-2">
                    <label className="flex items-center gap-2 text-[13px] text-neutral-800">
                      <input
                        type="checkbox"
                        checked={q.isPageBreak}
                        disabled={disabled || q.locked}
                        onChange={(e) =>
                          patchAt(index, {
                            isPageBreak: e.target.checked,
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

              {!q.isPageBreak ? (
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
                  placeholder="Short hint shown under the prompt"
                />
                </div>
              ) : null}

              {!q.isPageBreak && (q.questionType === 'short_text' || q.questionType === 'paragraph') ? (
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
                  <p className={hintClass}>Each choice needs a stable id (for scoring) and the label applicants see.</p>
                  {(q.options ?? []).map((opt, oi) => (
                    <div key={opt.id} className="flex flex-col gap-2 rounded-lg border border-neutral-100 bg-neutral-50/50 p-3 sm:flex-row sm:items-center">
                      <input
                        className={`${fieldClass} sm:w-36`}
                        disabled={disabled || q.locked}
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
