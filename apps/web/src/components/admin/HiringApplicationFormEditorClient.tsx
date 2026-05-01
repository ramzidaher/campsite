'use client';

import { JobScreeningQuestionsSection } from '@/components/admin/JobScreeningQuestionsSection';
import { type JobScreeningQuestionPersist } from '@/app/(main)/admin/jobs/actions';
import {
  updateApplicationFormDetails,
  replaceApplicationFormQuestions,
} from '@/app/(main)/hr/hiring/application-forms/actions';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

export function HiringApplicationFormEditorClient({
  formId,
  initialName,
  initialJobTitle,
  initialGradeLevel,
  initialDepartmentId,
  departmentOptions,
  jobTitleOptions,
  gradeOptions,
  initialQuestions,
}: {
  formId: string;
  initialName: string;
  initialJobTitle: string;
  initialGradeLevel: string;
  initialDepartmentId: string;
  departmentOptions: { id: string; name: string }[];
  jobTitleOptions: string[];
  gradeOptions: string[];
  initialQuestions: JobScreeningQuestionPersist[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(initialName);
  const [jobTitle, setJobTitle] = useState(initialJobTitle);
  const [gradeLevel, setGradeLevel] = useState(initialGradeLevel);
  const [departmentId, setDepartmentId] = useState(initialDepartmentId);
  const [questions, setQuestions] = useState<JobScreeningQuestionPersist[]>(initialQuestions);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  function save() {
    setMsg(null);
    startTransition(async () => {
      const detailsRes = await updateApplicationFormDetails(formId, {
        name,
        jobTitle,
        gradeLevel,
        departmentId,
      });
      if (!detailsRes.ok) {
        setMsg({ type: 'err', text: detailsRes.error });
        return;
      }

      const questionsRes = await replaceApplicationFormQuestions(
        formId,
        questions.map((q, i) => ({ ...q, sortOrder: i })),
      );
      if (!questionsRes.ok) {
        setMsg({ type: 'err', text: questionsRes.error });
        return;
      }
      setMsg({ type: 'ok', text: 'Application form saved.' });
      router.refresh();
    });
  }

  return (
    <div className="mx-auto min-w-0 w-full space-y-6 py-3 lg:space-y-8 lg:py-4 font-sans text-[#121212]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 max-w-3xl">
          <nav aria-label="Breadcrumb" className="text-[13px] font-medium text-[#6b6b6b]">
            <Link href="/hr/hiring/application-forms" className="text-[#121212] underline-offset-2 hover:underline">
              Application forms
            </Link>
            <span aria-hidden className="mx-2 text-[#d0d0d0]">
              /
            </span>
            <span className="text-[#6b6b6b]">Edit</span>
          </nav>
          <h1 className="mt-4 font-authSerif text-[28px] leading-tight tracking-[-0.03em] text-[#121212]">
            Edit application form
          </h1>
          <p className="mt-3 max-w-2xl text-[13.5px] leading-relaxed text-[#6b6b6b]">
            Build and maintain the reusable applicant question flow for roles in the Hiring workspace.
          </p>
        </div>
      </div>

      {msg ? (
        <div
          role={msg.type === 'err' ? 'alert' : 'status'}
          className={[
            'rounded-xl border px-4 py-3 text-[13px]',
            msg.type === 'err'
              ? 'border-red-200 bg-red-50 text-red-900'
              : 'border-emerald-200 bg-emerald-50 text-emerald-950',
          ].join(' ')}
        >
          {msg.text}
        </div>
      ) : null}

      <section className="space-y-6 rounded-2xl border border-[#e8e8e8] bg-white p-8 shadow-sm">
        <h2 className="text-[12px] font-semibold uppercase tracking-widest text-[#9b9b9b]">Form details</h2>
        <div>
          <label className="mb-2 block text-[12px] font-semibold text-[#6b6b6b]" htmlFor="form_name">
            Form name
          </label>
          <input
            id="form_name"
            className="mt-0 w-full rounded-xl border border-[#d8d8d8] bg-white px-4 py-3 text-[14px] leading-relaxed text-[#121212] outline-none transition-[box-shadow,border-color] focus:border-[#121212] focus:shadow-[0_0_0_3px_rgba(18,18,18,0.07)]"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="grid gap-5 sm:grid-cols-3">
          <div>
            <label className="mb-2 block text-[12px] font-semibold text-[#6b6b6b]" htmlFor="form_job_title">
              Job title
            </label>
            <input
              id="form_job_title"
              list="application-form-job-titles"
              className="mt-0 w-full rounded-xl border border-[#d8d8d8] bg-white px-4 py-3 text-[14px] leading-relaxed text-[#121212] outline-none transition-[box-shadow,border-color] focus:border-[#121212] focus:shadow-[0_0_0_3px_rgba(18,18,18,0.07)]"
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              placeholder="Choose or type custom title"
            />
            <datalist id="application-form-job-titles">
              {jobTitleOptions.map((opt) => (
                <option key={opt} value={opt} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="mb-2 block text-[12px] font-semibold text-[#6b6b6b]" htmlFor="form_grade_level">
              Grade level
            </label>
            <input
              id="form_grade_level"
              list="application-form-grade-levels"
              className="mt-0 w-full rounded-xl border border-[#d8d8d8] bg-white px-4 py-3 text-[14px] leading-relaxed text-[#121212] outline-none transition-[box-shadow,border-color] focus:border-[#121212] focus:shadow-[0_0_0_3px_rgba(18,18,18,0.07)]"
              value={gradeLevel}
              onChange={(e) => setGradeLevel(e.target.value)}
              placeholder="Choose or type custom grade"
            />
            <datalist id="application-form-grade-levels">
              {gradeOptions.map((opt) => (
                <option key={opt} value={opt} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="mb-2 block text-[12px] font-semibold text-[#6b6b6b]" htmlFor="form_department">
              Department
            </label>
            <select
              id="form_department"
              className="mt-0 w-full rounded-xl border border-[#d8d8d8] bg-white px-4 py-3 text-[14px] leading-relaxed text-[#121212] outline-none transition-[box-shadow,border-color] focus:border-[#121212] focus:shadow-[0_0_0_3px_rgba(18,18,18,0.07)]"
              value={departmentId}
              onChange={(e) => setDepartmentId(e.target.value)}
            >
              <option value="">All departments</option>
              {departmentOptions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <JobScreeningQuestionsSection
        disabled={false}
        currentJobId={formId}
        questions={questions}
        onQuestionsChange={setQuestions}
        simplifiedLayout
      />

      <div className="flex flex-wrap gap-4 pt-2">
        <Link
          href={`/hr/hiring/application-forms/${formId}/preview`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-11 min-w-[10rem] items-center justify-center rounded-full border border-[#d8d8d8] bg-white px-6 text-[13px] font-medium text-[#121212] transition-colors hover:border-[#121212] hover:bg-[#faf9f6]"
        >
          Preview
        </Link>
        <button
          type="button"
          disabled={pending}
          onClick={save}
          className="inline-flex h-11 min-w-[10rem] items-center justify-center rounded-full bg-[#121212] px-6 text-[13px] font-medium text-[#faf9f6] transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {pending ? 'Saving…' : 'Save form'}
        </button>
      </div>
    </div>
  );
}
