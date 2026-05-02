'use client';

import {
  previewMergedOfferLetter,
  sendOfferLetterForApplication,
} from '@/app/(main)/admin/application-offers/actions';
import { listOfferTemplates, type OfferTemplateListItem } from '@/app/(main)/admin/offer-templates/actions';
import { OfferTemplateEditor } from '@/components/offers/OfferTemplateEditor';
import Link from 'next/link';
import { useEffect, useState, useTransition } from 'react';

export function GenerateOfferModal({
  jobListingId,
  applicationId,
  candidateName,
  preferredTemplateId,
  onClose,
  onSent,
}: {
  jobListingId: string;
  applicationId: string;
  candidateName: string;
  preferredTemplateId?: string | null;
  onClose: () => void;
  onSent: () => void;
}) {
  const [templates, setTemplates] = useState<OfferTemplateListItem[]>([]);
  const [templateId, setTemplateId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [salaryOverride, setSalaryOverride] = useState('');
  const [bodyHtml, setBodyHtml] = useState('<p></p>');
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    void listOfferTemplates().then((r) => {
      if (r.ok) {
        setTemplates(r.templates);
        const preferred = String(preferredTemplateId ?? '').trim();
        if (preferred && r.templates.some((t) => t.id === preferred)) {
          setTemplateId(preferred);
        } else if (r.templates[0]?.id) {
          setTemplateId(r.templates[0].id);
        }
      }
    });
  }, [preferredTemplateId]);

  const runMerge = () => {
    setMsg(null);
    if (!templateId) {
      setMsg({ type: 'err', text: 'Select a template.' });
      return;
    }
    startTransition(async () => {
      const r = await previewMergedOfferLetter({
        templateId,
        jobApplicationId: applicationId,
        jobListingId,
        startDate,
        salaryOverride: salaryOverride.trim() || undefined,
      });
      if (!r.ok) {
        setMsg({ type: 'err', text: r.error });
        return;
      }
      setBodyHtml(r.html);
      setMsg({ type: 'ok', text: 'Merge applied — review and edit the letter below before sending.' });
    });
  };

  const send = () => {
    setMsg(null);
    if (!templateId) {
      setMsg({ type: 'err', text: 'Select a template.' });
      return;
    }
    const html = bodyHtml?.trim();
    if (!html || html === '<p></p>') {
      setMsg({ type: 'err', text: 'Merge a template first and review the letter.' });
      return;
    }
    startTransition(async () => {
      const r = await sendOfferLetterForApplication({
        jobApplicationId: applicationId,
        jobListingId,
        templateId,
        bodyHtml: html,
        offerStartDate: startDate.trim(),
      });
      if (!r.ok) {
        setMsg({ type: 'err', text: r.error });
        return;
      }
      onSent();
      onClose();
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4">
      <div
        role="dialog"
        aria-modal
        className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-xl border border-[#e8e8e8] bg-white p-5 shadow-xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-authSerif text-lg text-[#121212]">Generate offer letter</h2>
            <p className="mt-1 text-[13px] text-[#6b6b6b]">{candidateName}</p>
            <p className="mt-1 text-[12px] text-[#9b9b9b]">
              HR flow: select template → merge fields → review/edit → send for e-signature.
            </p>
          </div>
          <button
            type="button"
            className="rounded-md px-2 py-1 text-[13px] text-[#6b6b6b]"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        {templates.length === 0 ? (
          <p className="mt-4 text-[13px] text-amber-900">
            No templates yet.{' '}
            <Link href="/hr/offer-templates/new" className="font-medium text-[#6b6b6b] underline underline-offset-2 hover:text-[#121212]">
              Create a template
            </Link>
            .
          </p>
        ) : null}

        {msg ? (
          <div
            role={msg.type === 'err' ? 'alert' : 'status'}
            className={[
              'mt-3 rounded-lg border px-3 py-2 text-[13px]',
              msg.type === 'err' ? 'status-banner-error' : 'status-banner-warning',
            ].join(' ')}
          >
            {msg.text}
          </div>
        ) : null}

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="text-[12px] font-medium text-[#505050]">Template</label>
            <select
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[#d8d8d8] px-3 py-2 text-[13px] outline-none transition-[box-shadow,border-color] focus:border-[#121212] focus:shadow-[0_0_0_3px_rgba(18,18,18,0.07)]"
            >
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[12px] font-medium text-[#505050]">
              Proposed start date (merge field <code className="text-[11px]">{'{{start_date}}'}</code>)
            </label>
            <input
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              placeholder="e.g. 1 September 2026"
              className="mt-1 w-full rounded-lg border border-[#d8d8d8] px-3 py-2 text-[13px] outline-none transition-[box-shadow,border-color] focus:border-[#121212] focus:shadow-[0_0_0_3px_rgba(18,18,18,0.07)]"
            />
          </div>
          <div>
            <label className="text-[12px] font-medium text-[#505050]">Salary override (optional)</label>
            <input
              value={salaryOverride}
              onChange={(e) => setSalaryOverride(e.target.value)}
              placeholder="Defaults from job listing"
              className="mt-1 w-full rounded-lg border border-[#d8d8d8] px-3 py-2 text-[13px] outline-none transition-[box-shadow,border-color] focus:border-[#121212] focus:shadow-[0_0_0_3px_rgba(18,18,18,0.07)]"
            />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending || !templateId}
            onClick={runMerge}
            className="rounded-lg border border-[#121212] bg-[#121212] px-3 py-2 text-[13px] font-medium text-white disabled:opacity-50"
          >
            Merge fields
          </button>
          <Link href="/hr/offer-templates" className="rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px] text-[#6b6b6b] transition-colors hover:bg-[#f5f4f1] hover:text-[#121212]">
            Manage templates
          </Link>
        </div>

        <div className="mt-4">
          <p className="mb-1 text-[12px] font-medium text-[#505050]">Review &amp; edit letter</p>
          <OfferTemplateEditor initialHtml={bodyHtml} onHtmlChange={setBodyHtml} disabled={pending} />
        </div>

        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px] text-[#6b6b6b] transition-colors hover:bg-[#f5f4f1] hover:text-[#121212]" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            disabled={pending || templates.length === 0}
            onClick={send}
            className="rounded-lg bg-[#121212] px-3 py-2 text-[13px] font-medium text-[#faf9f6] disabled:opacity-50"
          >
            {pending ? 'Sending…' : 'Send for e-signature'}
          </button>
        </div>
      </div>
    </div>
  );
}
