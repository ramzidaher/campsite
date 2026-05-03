'use client';

import { FormSelect } from '@campsite/ui/web';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

type Row = {
  id: string;
  status: 'pending' | 'approved' | 'rejected';
  is_active: boolean;
  ni_number_masked: string | null;
  ni_number_last2: string | null;
  tax_code_masked: string | null;
  tax_code_last2: string | null;
  effective_from: string | null;
  review_note: string | null;
  created_at: string;
};

type PermissionSet = {
  viewAll: boolean;
  manageAll: boolean;
  viewOwn: boolean;
  manageOwn: boolean;
  canExport: boolean;
};

type RevealPayload = {
  ni_number: string;
  tax_code: string;
  starter_declaration: string;
  student_loan_plan: string;
  postgraduate_loan: boolean;
  tax_basis: string;
  notes: string;
};

export function UkTaxDetailsClient({
  title = 'National Insurance & tax code (UK)',
  description,
  subjectUserId,
  initialRows,
  permissions,
}: {
  title?: string;
  description?: string;
  subjectUserId: string;
  initialRows: Row[];
  permissions: PermissionSet;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<Row[]>(initialRows);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [revealedById, setRevealedById] = useState<Record<string, RevealPayload>>({});
  const [form, setForm] = useState({
    ni_number: '',
    tax_code: '',
    starter_declaration: 'A',
    student_loan_plan: 'none',
    postgraduate_loan: false,
    tax_basis: 'cumulative',
    notes: '',
    effective_from: '',
  });

  const canSubmit = useMemo(() => permissions.manageAll || permissions.manageOwn, [permissions]);

  async function refresh() {
    const res = await fetch(`/api/payroll/uk-tax?userId=${encodeURIComponent(subjectUserId)}`, { cache: 'no-store' });
    const data = (await res.json().catch(() => ({}))) as { rows?: Row[]; error?: string };
    if (!res.ok) {
      setMsg({ type: 'error', text: data.error ?? 'Failed to load UK tax details' });
      return;
    }
    setRows(data.rows ?? []);
  }

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    setMsg(null);
    const res = await fetch('/api/payroll/uk-tax', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: subjectUserId, ...form }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!res.ok) {
      setMsg({ type: 'error', text: data.error ?? 'Could not submit UK tax details' });
      return;
    }
    setMsg({ type: 'success', text: 'UK tax details submitted for approval.' });
    await refresh();
    router.refresh();
  }

  async function approve(id: string) {
    if (!permissions.manageAll) return;
    const review_note = window.prompt('Optional approval note') ?? '';
    setBusy(true);
    setMsg(null);
    const res = await fetch(`/api/payroll/uk-tax/${id}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ review_note }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!res.ok) return setMsg({ type: 'error', text: data.error ?? 'Could not approve record' });
    setMsg({ type: 'success', text: 'UK tax record approved and activated.' });
    await refresh();
    router.refresh();
  }

  async function reject(id: string) {
    if (!permissions.manageAll) return;
    const review_note = window.prompt('Rejection reason (required)');
    if (!review_note) return;
    setBusy(true);
    setMsg(null);
    const res = await fetch(`/api/payroll/uk-tax/${id}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ review_note }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!res.ok) return setMsg({ type: 'error', text: data.error ?? 'Could not reject record' });
    setMsg({ type: 'success', text: 'UK tax record rejected.' });
    await refresh();
    router.refresh();
  }

  async function reveal(id: string) {
    const reason = window.prompt('Reason for revealing full tax details (required)');
    if (!reason) return;
    setBusy(true);
    setMsg(null);
    const res = await fetch(`/api/payroll/uk-tax/${id}/reveal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
    const data = (await res.json().catch(() => ({}))) as { details?: RevealPayload; error?: string };
    setBusy(false);
    if (!res.ok || !data.details) return setMsg({ type: 'error', text: data.error ?? 'Could not reveal record' });
    setRevealedById((prev) => ({ ...prev, [id]: data.details! }));
  }

  const active = rows.find((r) => r.is_active) ?? null;

  return (
    <section className="mt-6 rounded-xl border border-[#d8d8d8] bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold text-[#121212]">{title}</h2>
          <p className="mt-1 text-[12px] text-[#9b9b9b]">
            {description ?? 'Encrypted NI/tax details. Masked by default with audited reveal/export.'}
          </p>
        </div>
        {permissions.canExport ? (
          <a href="/api/payroll/uk-tax/export" className="rounded-lg border border-[#d8d8d8] bg-white px-3 py-1.5 text-[12.5px] text-[#121212] hover:bg-[#fafafa]">
            Export CSV
          </a>
        ) : null}
      </div>

      {msg ? (
        <p className={['mt-3 rounded-lg px-3 py-2 text-[13px]', msg.type === 'error' ? 'border border-[#fecaca] bg-[#fef2f2] text-[#b91c1c]' : 'border border-[#86efac] bg-[#f0fdf4] text-[#166534]'].join(' ')}>
          {msg.text}
        </p>
      ) : null}

      {active ? (
        <p className="mt-3 text-[13px] text-[#6b6b6b]">
          Active: NI {active.ni_number_masked ?? '******'} · Tax {active.tax_code_masked ?? '***'} {active.effective_from ? `· Effective ${active.effective_from}` : ''}
        </p>
      ) : <p className="mt-3 text-[13px] text-[#9b9b9b]">No approved active UK tax record.</p>}

      {canSubmit ? (
        <div className="mt-4 rounded-lg border border-[#ececec] bg-[#faf9f6] p-3">
          <p className="text-[12.5px] font-medium text-[#121212]">Submit UK tax details change (pending approval)</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <input value={form.ni_number} onChange={(e) => setForm((f) => ({ ...f, ni_number: e.target.value.toUpperCase() }))} placeholder="NI number" className="rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px]" />
            <input value={form.tax_code} onChange={(e) => setForm((f) => ({ ...f, tax_code: e.target.value.toUpperCase() }))} placeholder="Tax code" className="rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px]" />
            <FormSelect value={form.starter_declaration} onChange={(e) => setForm((f) => ({ ...f, starter_declaration: e.target.value }))} className="rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px]">
              <option value="A">Starter declaration A</option>
              <option value="B">Starter declaration B</option>
              <option value="C">Starter declaration C</option>
            </FormSelect>
            <FormSelect value={form.student_loan_plan} onChange={(e) => setForm((f) => ({ ...f, student_loan_plan: e.target.value }))} className="rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px]">
              <option value="none">No student loan</option>
              <option value="plan_1">Plan 1</option>
              <option value="plan_2">Plan 2</option>
              <option value="plan_4">Plan 4</option>
              <option value="plan_5">Plan 5</option>
            </FormSelect>
            <FormSelect value={form.tax_basis} onChange={(e) => setForm((f) => ({ ...f, tax_basis: e.target.value }))} className="rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px]">
              <option value="cumulative">Cumulative</option>
              <option value="week1_month1">Week1 / Month1</option>
            </FormSelect>
            <input type="date" value={form.effective_from} onChange={(e) => setForm((f) => ({ ...f, effective_from: e.target.value }))} className="rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px]" />
            <label className="inline-flex items-center gap-2 text-[12.5px] text-[#6b6b6b]">
              <input type="checkbox" checked={form.postgraduate_loan} onChange={(e) => setForm((f) => ({ ...f, postgraduate_loan: e.target.checked }))} />
              Postgraduate loan
            </label>
            <textarea rows={2} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} placeholder="Notes" className="sm:col-span-2 rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px]" />
          </div>
          <div className="mt-3">
            <button type="button" disabled={busy} onClick={() => void submit()} className="rounded-lg bg-[#121212] px-4 py-2 text-[12.5px] font-medium text-[#faf9f6] disabled:opacity-50">
              {busy ? 'Submitting…' : 'Submit for approval'}
            </button>
          </div>
        </div>
      ) : null}

      <div className="mt-4 space-y-2">
        {rows.map((r) => (
          <div key={r.id} className="rounded-lg border border-[#ececec] bg-white px-3 py-3 text-[12.5px]">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-medium text-[#121212]">
                  NI {r.ni_number_masked ?? '******'} · Tax {r.tax_code_masked ?? '***'}
                </p>
                <p className="text-[#9b9b9b]">Status: {r.status}{r.is_active ? ' · Active' : ''}{r.effective_from ? ` · Effective ${r.effective_from}` : ''}</p>
                {r.review_note ? <p className="text-[#9b9b9b]">Review note: {r.review_note}</p> : null}
                {revealedById[r.id] ? (
                  <p className="mt-1 whitespace-pre-wrap rounded bg-[#f8f8f8] px-2 py-1 text-[11.5px] text-[#121212]">
                    Revealed: {revealedById[r.id]!.ni_number} | {revealedById[r.id]!.tax_code} | Starter {revealedById[r.id]!.starter_declaration} | Loan {revealedById[r.id]!.student_loan_plan}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" disabled={busy} onClick={() => void reveal(r.id)} className="rounded border border-[#d8d8d8] px-2.5 py-1 text-[12px] text-[#121212] hover:bg-[#fafafa] disabled:opacity-50">Reveal</button>
                {permissions.manageAll && r.status === 'pending' ? (
                  <>
                    <button type="button" disabled={busy} onClick={() => void approve(r.id)} className="rounded border border-[#86efac] px-2.5 py-1 text-[12px] text-[#166534] hover:bg-[#f0fdf4] disabled:opacity-50">Approve</button>
                    <button type="button" disabled={busy} onClick={() => void reject(r.id)} className="rounded border border-[#fecaca] px-2.5 py-1 text-[12px] text-[#991b1b] hover:bg-[#fef2f2] disabled:opacity-50">Reject</button>
                  </>
                ) : null}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
