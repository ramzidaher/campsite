'use client';

import { FormSelect } from '@campsite/ui/web';
import { updateJobAdminLegalSettings } from '@/app/(main)/admin/jobs/actions';
import { JobEditorTabNav } from '@/components/admin/JobEditorTabNav';
import { useTopPageFeedback } from '@/lib/ui/useTopPageFeedback';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

type TemplateOption = { id: string; name: string | null };

export function AdminJobAdminLegalClient({
  jobId,
  jobTitle,
  successEmailBodyInitial,
  rejectionEmailBodyInitial,
  interviewInviteEmailBodyInitial,
  offerTemplateIdInitial,
  contractTemplateIdInitial,
  offerTemplateOptions,
  contractTemplateOptions,
}: {
  jobId: string;
  jobTitle: string;
  successEmailBodyInitial: string;
  rejectionEmailBodyInitial: string;
  interviewInviteEmailBodyInitial: string;
  offerTemplateIdInitial: string;
  contractTemplateIdInitial: string;
  offerTemplateOptions: TemplateOption[];
  contractTemplateOptions: TemplateOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { feedback: msg, setFeedback: setMsg, feedbackRef } = useTopPageFeedback();
  const [successEmailBody, setSuccessEmailBody] = useState(successEmailBodyInitial);
  const [rejectionEmailBody, setRejectionEmailBody] = useState(rejectionEmailBodyInitial);
  const [interviewInviteEmailBody, setInterviewInviteEmailBody] = useState(interviewInviteEmailBodyInitial);
  const [offerTemplateId, setOfferTemplateId] = useState(offerTemplateIdInitial);
  const [contractTemplateId, setContractTemplateId] = useState(contractTemplateIdInitial);

  function save() {
    setMsg(null);
    startTransition(async () => {
      const res = await updateJobAdminLegalSettings(jobId, {
        successEmailBody: successEmailBody.trim() || null,
        rejectionEmailBody: rejectionEmailBody.trim() || null,
        interviewInviteEmailBody: interviewInviteEmailBody.trim() || null,
        offerTemplateId: offerTemplateId.trim() || null,
        contractTemplateId: contractTemplateId.trim() || null,
      });
      if (!res.ok) {
        setMsg({ type: 'err', text: res.error });
        return;
      }
      setMsg({ type: 'ok', text: 'Admin & legal settings saved.' });
      router.refresh();
    });
  }

  const fieldClass =
    'mt-1 w-full rounded-xl border border-[#d8d8d8] bg-white px-4 py-3 text-[14px] leading-relaxed text-[#121212] outline-none transition-[box-shadow,border-color] focus:border-[#121212] focus:shadow-[0_0_0_3px_rgba(18,18,18,0.07)]';

  return (
    <div className="mx-auto min-w-0 w-full space-y-6 py-10 font-sans text-[#121212]">
      <div>
        <p className="text-[12px] font-medium uppercase tracking-wide text-[#9b9b9b]">
          <Link href="/hr/jobs" className="text-[#6b6b6b] underline underline-offset-2 hover:text-[#121212]">
            Job listings
          </Link>
          <span className="mx-1.5 text-[#cfcfcf]">/</span>
          Admin & legal
        </p>
        <h1 className="mt-2 font-authSerif text-[28px] leading-tight tracking-[-0.03em]">{jobTitle}</h1>
      </div>

      <JobEditorTabNav jobId={jobId} activeTab="admin_legal" />

      {msg ? (
        <div
          ref={feedbackRef}
          tabIndex={-1}
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

      <div className="grid gap-6 md:grid-cols-3">
        <section className="rounded-2xl border border-[#e8e8e8] bg-white p-6 shadow-sm">
          <h2 className="text-[12px] font-semibold uppercase tracking-widest text-[#9b9b9b]">Successful email</h2>
          <textarea
            rows={12}
            className={fieldClass}
            placeholder="Email body sent when applicant is successful."
            value={successEmailBody}
            onChange={(e) => setSuccessEmailBody(e.target.value)}
          />
        </section>

        <section className="rounded-2xl border border-[#e8e8e8] bg-white p-6 shadow-sm">
          <h2 className="text-[12px] font-semibold uppercase tracking-widest text-[#9b9b9b]">Rejected email</h2>
          <textarea
            rows={12}
            className={fieldClass}
            placeholder="Email body sent when applicant is rejected."
            value={rejectionEmailBody}
            onChange={(e) => setRejectionEmailBody(e.target.value)}
          />
        </section>

        <section className="rounded-2xl border border-[#e8e8e8] bg-white p-6 shadow-sm">
          <h2 className="text-[12px] font-semibold uppercase tracking-widest text-[#9b9b9b]">Interview invite email</h2>
          <textarea
            rows={12}
            className={fieldClass}
            placeholder="Email body sent for interview invitations."
            value={interviewInviteEmailBody}
            onChange={(e) => setInterviewInviteEmailBody(e.target.value)}
          />
        </section>
      </div>

      <section className="rounded-2xl border border-[#e8e8e8] bg-white p-8 shadow-sm">
        <h2 className="text-[12px] font-semibold uppercase tracking-widest text-[#9b9b9b]">Offer template</h2>
        <p className="mt-2 text-[13px] text-[#6b6b6b]">
          Choose the offer template used for this job when creating and sending offers.
        </p>
        <FormSelect className={fieldClass} value={offerTemplateId} onChange={(e) => setOfferTemplateId(e.target.value)}>
          <option value="">Use default workflow template</option>
          {offerTemplateOptions.map((template) => (
            <option key={template.id} value={template.id}>
              {String(template.name ?? '').trim() || 'Untitled template'}
            </option>
          ))}
        </FormSelect>
      </section>

      <section className="rounded-2xl border border-[#e8e8e8] bg-white p-8 shadow-sm">
        <h2 className="text-[12px] font-semibold uppercase tracking-widest text-[#9b9b9b]">Contract template</h2>
        <p className="mt-2 text-[13px] text-[#6b6b6b]">
          Choose the contract template linked to this job offer workflow.
        </p>
        <FormSelect
          className={fieldClass}
          value={contractTemplateId}
          onChange={(e) => setContractTemplateId(e.target.value)}
        >
          <option value="">Use default workflow template</option>
          {contractTemplateOptions.map((template) => (
            <option key={template.id} value={template.id}>
              {String(template.name ?? '').trim() || 'Untitled template'}
            </option>
          ))}
        </FormSelect>
      </section>

      <div>
        <button
          type="button"
          disabled={pending}
          onClick={save}
          className="inline-flex h-11 min-w-[10rem] items-center justify-center rounded-full bg-[#121212] px-6 text-[13px] font-medium text-[#faf9f6] transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {pending ? 'Saving…' : 'Save admin & legal'}
        </button>
      </div>
    </div>
  );
}
