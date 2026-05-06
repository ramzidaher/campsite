'use client';

import {
  createOfferTemplate,
  deleteOfferTemplate,
  updateOfferTemplate,
} from '@/app/(main)/admin/offer-templates/actions';
import { OfferTemplateEditor } from '@/components/offers/OfferTemplateEditor';
import { ArrowLeft, Save, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

export function OfferTemplateFormClient({
  mode,
  templateId,
  initialName,
  initialHtml,
}: {
  mode: 'create' | 'edit';
  templateId?: string;
  initialName: string;
  initialHtml: string;
}) {
  const router = useRouter();
  const [name, setName] = useState(initialName);
  const [html, setHtml] = useState(initialHtml || '<p></p>');
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    if (!name.trim()) {
      setMsg({ type: 'err', text: 'Template name is required.' });
      return;
    }
    setMsg(null);
    startTransition(async () => {
      if (mode === 'create') {
        const r = await createOfferTemplate(name.trim(), html);
        if (!r.ok) {
          setMsg({ type: 'err', text: r.error });
          return;
        }
        router.push('/hr/offer-templates');
        router.refresh();
        return;
      }
      const id = templateId?.trim();
      if (!id) {
        setMsg({ type: 'err', text: 'Missing template.' });
        return;
      }
      const r = await updateOfferTemplate(id, name.trim(), html);
      if (!r.ok) {
        setMsg({ type: 'err', text: r.error });
        return;
      }
      setMsg({ type: 'ok', text: 'Saved.' });
      router.refresh();
    });
  }

  function remove() {
    const id = templateId?.trim();
    if (!id || mode !== 'edit') return;
    if (!window.confirm('Delete this template? This cannot be undone.')) return;
    setMsg(null);
    startTransition(async () => {
      const r = await deleteOfferTemplate(id);
      if (!r.ok) {
        setMsg({ type: 'err', text: r.error });
        return;
      }
      router.push('/hr/offer-templates');
      router.refresh();
    });
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-5 py-7 sm:px-7">
      <div className="space-y-2">
      <p className="text-[12px] font-medium uppercase tracking-wide text-[#9b9b9b]">
        <Link href="/hr/offer-templates" className="text-[#6b6b6b] underline underline-offset-2 hover:text-[#121212]">
          Templates
        </Link>
        <span className="mx-1.5 text-[#cfcfcf]">/</span>
        {mode === 'create' ? 'New' : 'Edit'}
      </p>
        <h1 className="font-authSerif text-[26px] leading-tight tracking-[-0.03em] text-[#121212]">
          {mode === 'create' ? 'Create offer template' : 'Edit offer template'}
        </h1>
        <p className="text-[13px] text-[#6b6b6b]">
          Build reusable offer letters and contracts with merge fields for candidate and job data.
        </p>
      </div>

      {msg ? (
        <div
          role={msg.type === 'err' ? 'alert' : 'status'}
          className={[
            'rounded-lg border px-3 py-2 text-[13px]',
            msg.type === 'err' ? 'status-banner-error' : 'status-banner-warning',
          ].join(' ')}
        >
          {msg.text}
        </div>
      ) : null}

      <div>
        <label className="text-[12px] font-medium text-[#505050]">
          Template name <span className="text-[#9b9b9b]">(required)</span>
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Standard offer letter"
          className="mt-1 w-full rounded-lg border border-[#d8d8d8] px-3 py-2 text-[14px] outline-none transition-[box-shadow,border-color] focus:border-[#121212] focus:shadow-[0_0_0_3px_rgba(18,18,18,0.07)]"
        />
      </div>

      <div>
        <p className="mb-2 rounded-lg border border-[#e8e8e8] bg-white px-3 py-2 text-[12px] text-[#6b6b6b]">
          <span className="font-medium text-[#121212]">Merge fields:</span> <code>{'{{candidate_name}}'}</code>,{' '}
          <code>{'{{job_title}}'}</code>, <code>{'{{salary}}'}</code>, <code>{'{{start_date}}'}</code>,{' '}
          <code>{'{{contract_type}}'}</code>
        </p>
        <p className="mb-1 text-[12px] font-medium text-[#505050]">Body</p>
        <OfferTemplateEditor initialHtml={html} onHtmlChange={setHtml} disabled={pending} />
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending || !name.trim()}
          onClick={save}
          className="inline-flex items-center gap-2 rounded-lg bg-[#121212] px-4 py-2 text-[13px] font-medium text-[#faf9f6] disabled:opacity-60"
        >
          <Save className="h-3.5 w-3.5" aria-hidden />
          {pending ? 'Saving…' : 'Save template'}
        </button>
        <Link href="/hr/offer-templates" className="inline-flex items-center gap-2 rounded-lg border border-[#d8d8d8] bg-white px-4 py-2 text-[13px] text-[#6b6b6b] transition-colors hover:bg-[#f5f4f1] hover:text-[#121212]">
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Cancel
        </Link>
        {mode === 'edit' && templateId ? (
          <button
            type="button"
            disabled={pending}
            onClick={remove}
            className="inline-flex items-center gap-2 rounded-lg border border-red-200 bg-white px-4 py-2 text-[13px] text-red-800 hover:bg-red-50 disabled:opacity-60"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
            Delete
          </button>
        ) : null}
      </div>
    </div>
  );
}
