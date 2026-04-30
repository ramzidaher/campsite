'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

type Policy = {
  id: string;
  domain: string;
  retention_days: number;
  legal_basis: string;
  action: 'delete' | 'anonymize';
  exceptions: unknown[];
  is_active: boolean;
};

type RequestRow = {
  id: string;
  user_id: string;
  requester_user_id: string;
  status: 'requested' | 'legal_review' | 'approved' | 'rejected' | 'executed';
  request_reason: string;
  review_note: string | null;
  execution_note: string | null;
  created_at: string;
};

export function PrivacyAdminClient() {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [requests, setRequests] = useState<RequestRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [draftPolicy, setDraftPolicy] = useState({
    domain: '',
    retention_days: 365,
    legal_basis: 'legal_obligation',
    action: 'anonymize',
    exceptions: '',
  });

  async function load() {
    const [pRes, rRes] = await Promise.all([
      fetch('/api/privacy/retention-policies', { cache: 'no-store' }),
      fetch('/api/privacy/erasure-requests', { cache: 'no-store' }),
    ]);
    const pData = (await pRes.json().catch(() => ({}))) as { rows?: Policy[]; error?: string };
    const rData = (await rRes.json().catch(() => ({}))) as { rows?: RequestRow[]; error?: string };
    if (pRes.ok) setPolicies(pData.rows ?? []);
    if (rRes.ok) setRequests(rData.rows ?? []);
  }

  useEffect(() => {
    void load();
  }, []);

  async function savePolicy() {
    setBusy(true);
    setMsg(null);
    const res = await fetch('/api/privacy/retention-policies', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...draftPolicy,
        exceptions: draftPolicy.exceptions
          .split(',')
          .map((v) => v.trim())
          .filter(Boolean),
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!res.ok) return setMsg(data.error ?? 'Failed to save policy');
    setMsg('Retention policy saved.');
    await load();
  }

  async function review(id: string, action: 'approve' | 'reject' | 'legal_review') {
    const note = window.prompt('Review note (optional)') ?? '';
    setBusy(true);
    setMsg(null);
    const res = await fetch(`/api/privacy/erasure-requests/${id}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, review_note: note }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!res.ok) return setMsg(data.error ?? 'Review failed');
    setMsg(`Request ${action}d.`);
    await load();
  }

  async function preview(id: string) {
    setBusy(true);
    setMsg(null);
    const res = await fetch(`/api/privacy/erasure-requests/${id}/preview`, { method: 'POST' });
    const data = (await res.json().catch(() => ({}))) as { preview?: Record<string, unknown>; error?: string };
    setBusy(false);
    if (!res.ok) return setMsg(data.error ?? 'Preview failed');
    setMsg(`Preview: ${JSON.stringify(data.preview)}`);
  }

  async function executeReq(id: string) {
    const note = window.prompt('Execution note (required)');
    if (!note) return;
    setBusy(true);
    setMsg(null);
    const res = await fetch(`/api/privacy/erasure-requests/${id}/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ execution_note: note }),
    });
    const data = (await res.json().catch(() => ({}))) as { result?: Record<string, unknown>; error?: string };
    setBusy(false);
    if (!res.ok) return setMsg(data.error ?? 'Execute failed');
    setMsg(`Executed: ${JSON.stringify(data.result)}`);
    await load();
  }

  const fieldClass =
    'rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px] text-[#121212] outline-none transition-[box-shadow,border-color] focus:border-[#121212] focus:shadow-[0_0_0_3px_rgba(18,18,18,0.06)]';
  const cardClass = 'rounded-xl border border-[#d8d8d8] bg-white p-5 shadow-sm';
  const secondaryButtonClass =
    'rounded-lg border border-[#d8d8d8] bg-white px-2.5 py-1 text-[12px] text-[#121212] transition-colors hover:bg-[#f5f4f1] disabled:opacity-50';
  const sectionEyebrowClass = 'text-[12px] font-semibold uppercase tracking-widest text-[#9b9b9b]';

  return (
    <div className="mx-auto max-w-6xl px-5 py-7 sm:px-7">
      <div className="mb-6">
        <h1 className="font-authSerif text-[26px] leading-tight tracking-[-0.03em] text-[#121212]">Privacy center</h1>
        <p className="mt-1 max-w-3xl text-[13px] text-[#6b6b6b]">
          Retention policies and GDPR right-to-erasure workflow for your organisation. Use this area to define data
          handling rules and review privacy requests before final execution.
        </p>
      </div>

      {msg ? (
        <p className="mb-4 rounded-lg border border-[#eceae6] bg-[#faf9f6] px-4 py-3 text-[12.5px] text-[#6b6b6b]">
          {msg}
        </p>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <section className={cardClass}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className={sectionEyebrowClass}>Retention policies</p>
              <h2 className="mt-1 font-authSerif text-[20px] text-[#121212]">Define how long data should be kept</h2>
              <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-[#6b6b6b]">
                Create policy entries for each data domain, record the legal basis, and choose whether old records
                should be anonymised or deleted when their retention period ends.
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-[#9b9b9b]">Domain</span>
              <input
                placeholder="e.g. hr_docs"
                value={draftPolicy.domain}
                onChange={(e) => setDraftPolicy((d) => ({ ...d, domain: e.target.value }))}
                className={fieldClass}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-[#9b9b9b]">Retention days</span>
              <input
                type="number"
                min={0}
                value={draftPolicy.retention_days}
                onChange={(e) => setDraftPolicy((d) => ({ ...d, retention_days: Number(e.target.value) }))}
                className={fieldClass}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-[#9b9b9b]">Legal basis</span>
              <input
                placeholder="e.g. legal_obligation"
                value={draftPolicy.legal_basis}
                onChange={(e) => setDraftPolicy((d) => ({ ...d, legal_basis: e.target.value }))}
                className={fieldClass}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-[#9b9b9b]">Final action</span>
              <select
                value={draftPolicy.action}
                onChange={(e) => setDraftPolicy((d) => ({ ...d, action: e.target.value }))}
                className={fieldClass}
              >
                <option value="anonymize">Anonymize</option>
                <option value="delete">Delete</option>
              </select>
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-[#9b9b9b]">
                Exceptions
              </span>
              <input
                placeholder="Comma separated exceptions, if any"
                value={draftPolicy.exceptions}
                onChange={(e) => setDraftPolicy((d) => ({ ...d, exceptions: e.target.value }))}
                className={fieldClass}
              />
            </label>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[#eceae6] pt-4">
            <button
              type="button"
              disabled={busy}
              onClick={() => void savePolicy()}
              className="h-9 rounded-lg border border-[#121212] bg-[#121212] px-4 text-[13px] font-medium text-[#faf9f6] disabled:opacity-50"
            >
              Save policy
            </button>
            <Link
              href="/admin/roles"
              className="inline-flex h-9 items-center rounded-lg border border-[#d8d8d8] bg-white px-4 text-[13px] font-medium text-[#6b6b6b] hover:bg-[#f5f4f1]"
            >
              Roles and permissions
            </Link>
          </div>

          <div className="mt-4 space-y-2 border-t border-[#eceae6] pt-4">
            <p className={sectionEyebrowClass}>Active rules</p>
            {policies.length === 0 ? (
              <p className="text-[12.5px] text-[#6b6b6b]">No policies yet.</p>
            ) : (
              policies.map((p) => (
                <div key={p.id} className="rounded-lg border border-[#eceae6] bg-[#faf9f6] px-3 py-3">
                  <p className="text-[13px] font-medium text-[#121212]">{p.domain}</p>
                  <p className="mt-1 text-[12.5px] text-[#6b6b6b]">
                    {p.retention_days} days · {p.action} · {p.legal_basis}
                  </p>
                </div>
              ))
            )}
          </div>
        </section>

        <section className={cardClass}>
          <div>
            <p className={sectionEyebrowClass}>Erasure requests</p>
            <h2 className="mt-1 font-authSerif text-[20px] text-[#121212]">Review and action privacy requests</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-[#6b6b6b]">
              Move requests through legal review, approve or reject them, and only execute once the organisation is
              comfortable with the compliance position.
            </p>
          </div>

          <div className="mt-4 space-y-3">
            {requests.map((r) => (
              <div key={r.id} className="rounded-lg border border-[#eceae6] bg-[#faf9f6] px-4 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-[13px] font-medium text-[#121212]">{r.id.slice(0, 8)}</p>
                  <span className="rounded-full border border-[#d8d8d8] bg-white px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-[#6b6b6b]">
                    {r.status.replace('_', ' ')}
                  </span>
                </div>
                <p className="mt-2 text-[12.5px] text-[#6b6b6b]">User: {r.user_id}</p>
                <p className="mt-1 text-[12.5px] text-[#6b6b6b]">Reason: {r.request_reason}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" disabled={busy} onClick={() => void preview(r.id)} className={secondaryButtonClass}>
                    Preview
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void review(r.id, 'legal_review')}
                    className={secondaryButtonClass}
                  >
                    Legal review
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void review(r.id, 'approve')}
                    className="rounded-lg border border-[#86efac] bg-[#f0fdf4] px-2.5 py-1 text-[12px] text-[#166534] transition-colors hover:bg-[#dcfce7] disabled:opacity-50"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void review(r.id, 'reject')}
                    className="rounded-lg border border-[#fecaca] bg-[#fef2f2] px-2.5 py-1 text-[12px] text-[#991b1b] transition-colors hover:bg-[#fee2e2] disabled:opacity-50"
                  >
                    Reject
                  </button>
                  <button type="button" disabled={busy} onClick={() => void executeReq(r.id)} className={secondaryButtonClass}>
                    Execute
                  </button>
                </div>
              </div>
            ))}
            {requests.length === 0 ? <p className="text-[12.5px] text-[#6b6b6b]">No erasure requests.</p> : null}
          </div>
        </section>
      </div>
    </div>
  );
}
