'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

type BankRow = {
  id: string;
  status: 'pending' | 'approved' | 'rejected';
  is_active: boolean;
  account_holder_display: string;
  account_number_last4: string | null;
  sort_code_last4: string | null;
  iban_last4: string | null;
  bank_country: string | null;
  currency: string | null;
  effective_from: string | null;
  submitted_by: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
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
  account_holder_name: string;
  bank_name: string;
  account_number: string;
  sort_code: string;
  iban: string;
  swift_bic: string;
  routing_number: string;
  country: string;
  currency: string;
  payroll_reference: string;
};

export function BankDetailsClient({
  title = 'Bank details (payroll)',
  description,
  subjectUserId,
  initialRows,
  permissions,
}: {
  title?: string;
  description?: string;
  subjectUserId: string;
  initialRows: BankRow[];
  permissions: PermissionSet;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<BankRow[]>(initialRows);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [revealedById, setRevealedById] = useState<Record<string, RevealPayload>>({});
  const [form, setForm] = useState({
    account_holder_name: '',
    bank_name: '',
    account_number: '',
    sort_code: '',
    iban: '',
    swift_bic: '',
    routing_number: '',
    country: '',
    currency: 'GBP',
    payroll_reference: '',
    effective_from: '',
  });

  const canSubmit = useMemo(() => {
    return (permissions.manageAll || permissions.manageOwn);
  }, [permissions]);

  async function refresh() {
    const res = await fetch(`/api/payroll/bank-details?userId=${encodeURIComponent(subjectUserId)}`, {
      cache: 'no-store',
    });
    const data = (await res.json().catch(() => ({}))) as { rows?: BankRow[]; error?: string };
    if (!res.ok) {
      setMsg({ type: 'error', text: data.error ?? 'Failed to load bank details' });
      return;
    }
    setRows(data.rows ?? []);
  }

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    setMsg(null);
    const res = await fetch('/api/payroll/bank-details', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: subjectUserId, ...form }),
    });
    const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    setBusy(false);
    if (!res.ok) {
      setMsg({ type: 'error', text: data.error ?? 'Could not submit bank details' });
      return;
    }
    setMsg({ type: 'success', text: 'Bank details submitted for approval.' });
    await refresh();
    router.refresh();
  }

  async function approve(id: string) {
    if (!permissions.manageAll) return;
    setBusy(true);
    setMsg(null);
    const review_note = window.prompt('Optional approval note') ?? '';
    const res = await fetch(`/api/payroll/bank-details/${id}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ review_note }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!res.ok) {
      setMsg({ type: 'error', text: data.error ?? 'Could not approve record' });
      return;
    }
    setMsg({ type: 'success', text: 'Bank detail record approved and activated.' });
    await refresh();
    router.refresh();
  }

  async function reject(id: string) {
    if (!permissions.manageAll) return;
    const note = window.prompt('Rejection reason (required)');
    if (!note) return;
    setBusy(true);
    setMsg(null);
    const res = await fetch(`/api/payroll/bank-details/${id}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ review_note: note }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!res.ok) {
      setMsg({ type: 'error', text: data.error ?? 'Could not reject record' });
      return;
    }
    setMsg({ type: 'success', text: 'Bank detail record rejected.' });
    await refresh();
    router.refresh();
  }

  async function reveal(id: string) {
    const reason = window.prompt('Reason for revealing full bank details (required)');
    if (!reason) return;
    setBusy(true);
    setMsg(null);
    const res = await fetch(`/api/payroll/bank-details/${id}/reveal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason }),
    });
    const data = (await res.json().catch(() => ({}))) as { details?: RevealPayload; error?: string };
    setBusy(false);
    if (!res.ok || !data.details) {
      setMsg({ type: 'error', text: data.error ?? 'Could not reveal bank details' });
      return;
    }
    setRevealedById((prev) => ({ ...prev, [id]: data.details! }));
  }

  function statusTone(s: BankRow['status']) {
    if (s === 'approved') return 'text-[#166534]';
    if (s === 'rejected') return 'text-[#991b1b]';
    return 'text-[#854d0e]';
  }

  const activeRow = rows.find((r) => r.is_active) ?? null;

  return (
    <section className="mt-6 rounded-xl border border-[#d8d8d8] bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold text-[#121212]">{title}</h2>
          <p className="mt-1 text-[12px] text-[#9b9b9b]">
            {description ?? 'Encrypted payroll bank details with approval workflow and audit logs.'}
          </p>
        </div>
        {permissions.canExport ? (
          <a
            href="/api/payroll/bank-details/export"
            className="rounded-lg border border-[#d8d8d8] bg-white px-3 py-1.5 text-[12.5px] text-[#121212] hover:bg-[#fafafa]"
          >
            Export CSV
          </a>
        ) : null}
      </div>

      {msg ? (
        <p className={['mt-3 rounded-lg px-3 py-2 text-[13px]', msg.type === 'error'
          ? 'border border-[#fecaca] bg-[#fef2f2] text-[#b91c1c]'
          : 'border border-[#86efac] bg-[#f0fdf4] text-[#166534]'].join(' ')}>
          {msg.text}
        </p>
      ) : null}

      {activeRow ? (
        <div className="mt-4 rounded-lg border border-[#ececec] bg-[#faf9f6] p-3 text-[13px]">
          <p className="font-medium text-[#121212]">Active payroll details</p>
          <p className="mt-1 text-[#6b6b6b]">
            Holder: {activeRow.account_holder_display || ''} · Account ****{activeRow.account_number_last4 ?? ''} · Sort **-**-{activeRow.sort_code_last4?.slice(-2) ?? ''}
          </p>
          <p className="text-[#9b9b9b]">
            IBAN ****{activeRow.iban_last4 ?? ''} · {activeRow.bank_country ?? ''} · {activeRow.currency ?? ''}
          </p>
        </div>
      ) : (
        <p className="mt-4 text-[13px] text-[#9b9b9b]">No approved active payroll bank details.</p>
      )}

      {canSubmit ? (
        <div className="mt-4 rounded-lg border border-[#ececec] bg-[#faf9f6] p-3">
          <p className="text-[12.5px] font-medium text-[#121212]">Submit bank details change (pending approval)</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <input value={form.account_holder_name} onChange={(e) => setForm((f) => ({ ...f, account_holder_name: e.target.value }))} placeholder="Account holder name" className="rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px]" />
            <input value={form.bank_name} onChange={(e) => setForm((f) => ({ ...f, bank_name: e.target.value }))} placeholder="Bank name" className="rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px]" />
            <input value={form.account_number} onChange={(e) => setForm((f) => ({ ...f, account_number: e.target.value }))} placeholder="Account number" className="rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px]" />
            <input value={form.sort_code} onChange={(e) => setForm((f) => ({ ...f, sort_code: e.target.value }))} placeholder="Sort code / branch code" className="rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px]" />
            <input value={form.iban} onChange={(e) => setForm((f) => ({ ...f, iban: e.target.value }))} placeholder="IBAN" className="rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px]" />
            <input value={form.swift_bic} onChange={(e) => setForm((f) => ({ ...f, swift_bic: e.target.value }))} placeholder="SWIFT / BIC" className="rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px]" />
            <input value={form.routing_number} onChange={(e) => setForm((f) => ({ ...f, routing_number: e.target.value }))} placeholder="Routing number" className="rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px]" />
            <input value={form.payroll_reference} onChange={(e) => setForm((f) => ({ ...f, payroll_reference: e.target.value }))} placeholder="Payroll reference" className="rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px]" />
            <input value={form.country} onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))} placeholder="Country" className="rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px]" />
            <input value={form.currency} onChange={(e) => setForm((f) => ({ ...f, currency: e.target.value.toUpperCase() }))} placeholder="Currency" className="rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px]" />
            <input type="date" value={form.effective_from} onChange={(e) => setForm((f) => ({ ...f, effective_from: e.target.value }))} className="rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px]" />
          </div>
          <div className="mt-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => void submit()}
              className="rounded-lg bg-[#121212] px-4 py-2 text-[12.5px] font-medium text-[#faf9f6] disabled:opacity-50"
            >
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
                  {r.account_holder_display || 'Account holder'} · ****{r.account_number_last4 ?? ''}
                </p>
                <p className="text-[#6b6b6b]">
                  Sort **-**-{r.sort_code_last4?.slice(-2) ?? ''} · IBAN ****{r.iban_last4 ?? ''} · {r.bank_country ?? ''} · {r.currency ?? ''}
                </p>
                <p className="text-[#9b9b9b]">
                  Status: <span className={statusTone(r.status)}>{r.status}</span>{r.is_active ? ' · Active' : ''}{r.effective_from ? ` · Effective ${r.effective_from}` : ''}
                </p>
                {r.review_note ? <p className="text-[#9b9b9b]">Review note: {r.review_note}</p> : null}
                {revealedById[r.id] ? (
                  <p className="mt-1 whitespace-pre-wrap rounded bg-[#f8f8f8] px-2 py-1 text-[11.5px] text-[#121212]">
                    Revealed: {revealedById[r.id]!.account_holder_name} | {revealedById[r.id]!.bank_name} | {revealedById[r.id]!.account_number} | {revealedById[r.id]!.sort_code} | {revealedById[r.id]!.iban}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void reveal(r.id)}
                  className="rounded border border-[#d8d8d8] px-2.5 py-1 text-[12px] text-[#121212] hover:bg-[#fafafa] disabled:opacity-50"
                >
                  Reveal
                </button>
                {permissions.manageAll && r.status === 'pending' ? (
                  <>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void approve(r.id)}
                      className="rounded border border-[#86efac] px-2.5 py-1 text-[12px] text-[#166534] hover:bg-[#f0fdf4] disabled:opacity-50"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void reject(r.id)}
                      className="rounded border border-[#fecaca] px-2.5 py-1 text-[12px] text-[#991b1b] hover:bg-[#fef2f2] disabled:opacity-50"
                    >
                      Reject
                    </button>
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
