'use client';

import {
  createOfferTemplate,
  deleteOfferTemplate,
  updateOfferTemplate,
} from '@/app/(main)/admin/offer-templates/actions';
import { OfferTemplateEditor } from '@/components/offers/OfferTemplateEditor';
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
    setMsg(null);
    startTransition(async () => {
      if (mode === 'create') {
        const r = await createOfferTemplate(name, html);
        if (!r.ok) {
          setMsg({ type: 'err', text: r.error });
          return;
        }
        router.push('/admin/offer-templates');
        router.refresh();
        return;
      }
      const id = templateId?.trim();
      if (!id) {
        setMsg({ type: 'err', text: 'Missing template.' });
        return;
      }
      const r = await updateOfferTemplate(id, name, html);
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
      router.push('/admin/offer-templates');
      router.refresh();
    });
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-5 py-7">
      <p className="text-[12px] font-medium uppercase tracking-wide text-[#9b9b9b]">
        <Link href="/admin/offer-templates" className="text-[#008B60] hover:underline">
          Offer templates
        </Link>
        <span className="mx-1.5 text-[#cfcfcf]">/</span>
        {mode === 'create' ? 'New' : 'Edit'}
      </p>

      {msg ? (
        <div
          role={msg.type === 'err' ? 'alert' : 'status'}
          className={[
            'rounded-lg border px-3 py-2 text-[13px]',
            msg.type === 'err' ? 'border-red-200 bg-red-50 text-red-900' : 'border-emerald-200 bg-emerald-50',
          ].join(' ')}
        >
          {msg.text}
        </div>
      ) : null}

      <div>
        <label className="text-[12px] font-medium text-[#505050]">Template name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mt-1 w-full rounded-lg border border-[#d8d8d8] px-3 py-2 text-[14px]"
        />
      </div>

      <div>
        <p className="mb-1 text-[12px] text-[#6b6b6b]">
          Use merge fields in the letter body: <code>{'{{candidate_name}}'}</code>, <code>{'{{job_title}}'}</code>,{' '}
          <code>{'{{salary}}'}</code>, <code>{'{{start_date}}'}</code>, <code>{'{{contract_type}}'}</code>.
        </p>
        <p className="mb-1 text-[12px] font-medium text-[#505050]">Body</p>
        <OfferTemplateEditor initialHtml={html} onHtmlChange={setHtml} disabled={pending} />
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={save}
          className="rounded-lg bg-[#008B60] px-4 py-2 text-[13px] font-medium text-white disabled:opacity-60"
        >
          {pending ? 'Saving…' : 'Save'}
        </button>
        <Link href="/admin/offer-templates" className="rounded-lg border border-[#d8d8d8] px-4 py-2 text-[13px]">
          Cancel
        </Link>
        {mode === 'edit' && templateId ? (
          <button
            type="button"
            disabled={pending}
            onClick={remove}
            className="rounded-lg border border-red-200 bg-white px-4 py-2 text-[13px] text-red-800 hover:bg-red-50 disabled:opacity-60"
          >
            Delete
          </button>
        ) : null}
      </div>
    </div>
  );
}
