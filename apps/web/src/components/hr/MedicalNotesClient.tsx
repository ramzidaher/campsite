'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

type Row = {
  id: string;
  case_ref: string;
  referral_reason: string | null;
  status: 'open' | 'under_review' | 'fit_note_received' | 'closed';
  fit_for_work_outcome: string | null;
  recommended_adjustments: string | null;
  review_date: string | null;
  next_review_date: string | null;
  summary_for_employee: string | null;
  archived_at: string | null;
  created_at: string;
};

type EventRow = {
  id: string;
  medical_note_id: string;
  event_type: string;
  reason: string | null;
  created_at: string;
};

type PermissionSet = {
  viewAll: boolean;
  manageAll: boolean;
  viewOwnSummary: boolean;
  revealSensitive: boolean;
  canExport: boolean;
  manageOwn: boolean;
};

type RevealPayload = {
  clinical_notes: string;
  diagnosis_summary: string;
  medications_or_restrictions: string;
  confidential_flags: string[];
};

export function MedicalNotesClient({
  title = 'Medical / occupational health notes',
  subjectUserId,
  initialRows,
  initialEvents,
  permissions,
}: {
  title?: string;
  subjectUserId: string;
  initialRows: Row[];
  initialEvents: EventRow[];
  permissions: PermissionSet;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(initialRows);
  const [events] = useState<EventRow[]>(initialEvents);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [revealedById, setRevealedById] = useState<Record<string, RevealPayload>>({});
  const canSubmit = useMemo(() => permissions.manageAll || permissions.manageOwn, [permissions]);

  const [form, setForm] = useState({
    case_ref: '',
    referral_reason: '',
    status: 'open',
    fit_for_work_outcome: '',
    recommended_adjustments: '',
    review_date: '',
    next_review_date: '',
    summary_for_employee: '',
    clinical_notes: '',
    diagnosis_summary: '',
    medications_or_restrictions: '',
    confidential_flags: '',
  });

  async function refresh() {
    const res = await fetch(`/api/hr/medical-notes?userId=${encodeURIComponent(subjectUserId)}`, { cache: 'no-store' });
    const data = (await res.json().catch(() => ({}))) as { rows?: Row[]; error?: string };
    if (!res.ok) return setMsg({ type: 'error', text: data.error ?? 'Failed to refresh notes' });
    setRows(data.rows ?? []);
  }

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    setMsg(null);
    const res = await fetch('/api/hr/medical-notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: subjectUserId,
        ...form,
        confidential_flags: form.confidential_flags
          .split(',')
          .map((v) => v.trim())
          .filter(Boolean),
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!res.ok) return setMsg({ type: 'error', text: data.error ?? 'Could not submit record' });
    setMsg({ type: 'success', text: 'Medical note saved.' });
    await refresh();
    router.refresh();
  }

  async function reveal(id: string) {
    if (!permissions.revealSensitive) return;
    const reason = window.prompt('Reason for revealing sensitive clinical notes (required)');
    if (!reason) return;
    setBusy(true);
    setMsg(null);
    const res = await fetch(`/api/hr/medical-notes/${id}/reveal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
    const data = (await res.json().catch(() => ({}))) as { details?: RevealPayload; error?: string };
    setBusy(false);
    if (!res.ok || !data.details) return setMsg({ type: 'error', text: data.error ?? 'Could not reveal notes' });
    setRevealedById((prev) => ({ ...prev, [id]: data.details! }));
  }

  return (
    <section className="mt-6 rounded-xl border border-[#d8d8d8] bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold text-[#121212]">{title}</h2>
          <p className="mt-1 text-[12px] text-[#9b9b9b]">Encrypted clinical notes with summary-only self access and audited reveals.</p>
        </div>
      </div>

      {msg ? (
        <p className={['mt-3 rounded-lg px-3 py-2 text-[13px]', msg.type === 'error'
          ? 'border border-[#fecaca] bg-[#fef2f2] text-[#b91c1c]'
          : 'border border-[#86efac] bg-[#f0fdf4] text-[#166534]'].join(' ')}>
          {msg.text}
        </p>
      ) : null}

      {canSubmit ? (
        <div className="mt-4 rounded-lg border border-[#ececec] bg-[#faf9f6] p-3">
          <p className="text-[12.5px] font-medium text-[#121212]">Create medical / OH record</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <input value={form.case_ref} onChange={(e) => setForm((f) => ({ ...f, case_ref: e.target.value }))} placeholder="Case ref (optional)" className="rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px]" />
            <input value={form.referral_reason} onChange={(e) => setForm((f) => ({ ...f, referral_reason: e.target.value }))} placeholder="Referral reason" className="rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px]" />
            <select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))} className="rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px]">
              <option value="open">Open</option>
              <option value="under_review">Under review</option>
              <option value="fit_note_received">Fit note received</option>
              <option value="closed">Closed</option>
            </select>
            <input value={form.fit_for_work_outcome} onChange={(e) => setForm((f) => ({ ...f, fit_for_work_outcome: e.target.value }))} placeholder="Fit for work outcome" className="rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px]" />
            <input type="date" value={form.review_date} onChange={(e) => setForm((f) => ({ ...f, review_date: e.target.value }))} className="rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px]" />
            <input type="date" value={form.next_review_date} onChange={(e) => setForm((f) => ({ ...f, next_review_date: e.target.value }))} className="rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px]" />
            <textarea rows={2} value={form.summary_for_employee} onChange={(e) => setForm((f) => ({ ...f, summary_for_employee: e.target.value }))} placeholder="Summary visible to employee" className="sm:col-span-2 rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px]" />
            <textarea rows={2} value={form.recommended_adjustments} onChange={(e) => setForm((f) => ({ ...f, recommended_adjustments: e.target.value }))} placeholder="Recommended adjustments" className="sm:col-span-2 rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px]" />
            <textarea rows={2} value={form.clinical_notes} onChange={(e) => setForm((f) => ({ ...f, clinical_notes: e.target.value }))} placeholder="Sensitive clinical notes (encrypted)" className="sm:col-span-2 rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px]" />
            <input value={form.diagnosis_summary} onChange={(e) => setForm((f) => ({ ...f, diagnosis_summary: e.target.value }))} placeholder="Sensitive diagnosis summary" className="rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px]" />
            <input value={form.medications_or_restrictions} onChange={(e) => setForm((f) => ({ ...f, medications_or_restrictions: e.target.value }))} placeholder="Sensitive restrictions/medications" className="rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px]" />
            <input value={form.confidential_flags} onChange={(e) => setForm((f) => ({ ...f, confidential_flags: e.target.value }))} placeholder="Confidential flags (comma separated)" className="sm:col-span-2 rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px]" />
          </div>
          <div className="mt-3">
            <button type="button" disabled={busy} onClick={() => void submit()} className="rounded-lg bg-[#121212] px-4 py-2 text-[12.5px] font-medium text-[#faf9f6] disabled:opacity-50">
              {busy ? 'Saving…' : 'Save medical note'}
            </button>
          </div>
        </div>
      ) : null}

      <div className="mt-4 space-y-2">
        {rows.map((r) => (
          <div key={r.id} className="rounded-lg border border-[#ececec] bg-white px-3 py-3 text-[12.5px]">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-medium text-[#121212]">{r.case_ref} · {r.status}</p>
                <p className="text-[#6b6b6b]">{r.referral_reason ?? 'No referral reason'}{r.fit_for_work_outcome ? ` · Outcome: ${r.fit_for_work_outcome}` : ''}</p>
                {r.summary_for_employee ? <p className="text-[#9b9b9b]">Employee summary: {r.summary_for_employee}</p> : null}
                {r.recommended_adjustments ? <p className="text-[#9b9b9b]">Adjustments: {r.recommended_adjustments}</p> : null}
                {revealedById[r.id] ? (
                  <p className="mt-1 whitespace-pre-wrap rounded bg-[#f8f8f8] px-2 py-1 text-[11.5px] text-[#121212]">
                    Clinical: {revealedById[r.id]!.clinical_notes || '—'} | Dx: {revealedById[r.id]!.diagnosis_summary || '—'} | Restrictions: {revealedById[r.id]!.medications_or_restrictions || '—'}
                  </p>
                ) : null}
              </div>
              {permissions.revealSensitive ? (
                <button type="button" disabled={busy} onClick={() => void reveal(r.id)} className="rounded border border-[#d8d8d8] px-2.5 py-1 text-[12px] text-[#121212] hover:bg-[#fafafa] disabled:opacity-50">
                  Reveal sensitive
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      {events.length ? (
        <div className="mt-4 rounded-lg border border-[#ececec] bg-[#fcfcfc] p-3">
          <p className="text-[12px] font-semibold text-[#121212]">Audit timeline</p>
          <ul className="mt-2 space-y-1 text-[12px] text-[#6b6b6b]">
            {events.slice(0, 12).map((e) => (
              <li key={e.id}>
                {new Date(e.created_at).toISOString().slice(0, 10)} · {e.event_type}{e.reason ? ` · ${e.reason}` : ''}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
