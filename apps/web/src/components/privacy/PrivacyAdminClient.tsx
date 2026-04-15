'use client';

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

  return (
    <div className="mx-auto max-w-5xl px-5 py-8 sm:px-7">
      <h1 className="text-[22px] font-medium text-[#1A1917]">Privacy center</h1>
      <p className="mt-1 text-[13px] text-[#6B6963]">Retention policies and GDPR right-to-erasure workflow.</p>
      {msg ? <p className="mt-2 text-[12px] text-[#6b6b6b]">{msg}</p> : null}

      <section className="mt-5 rounded-xl border border-[#e5e5e5] bg-white p-4">
        <h2 className="text-[15px] font-semibold text-[#121212]">Retention policies</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <input placeholder="Domain (e.g. hr_docs)" value={draftPolicy.domain} onChange={(e) => setDraftPolicy((d) => ({ ...d, domain: e.target.value }))} className="rounded-lg border border-[#d8d8d8] px-3 py-2 text-[13px]" />
          <input type="number" min={0} value={draftPolicy.retention_days} onChange={(e) => setDraftPolicy((d) => ({ ...d, retention_days: Number(e.target.value) }))} className="rounded-lg border border-[#d8d8d8] px-3 py-2 text-[13px]" />
          <input placeholder="Legal basis" value={draftPolicy.legal_basis} onChange={(e) => setDraftPolicy((d) => ({ ...d, legal_basis: e.target.value }))} className="rounded-lg border border-[#d8d8d8] px-3 py-2 text-[13px]" />
          <select value={draftPolicy.action} onChange={(e) => setDraftPolicy((d) => ({ ...d, action: e.target.value }))} className="rounded-lg border border-[#d8d8d8] px-3 py-2 text-[13px]">
            <option value="anonymize">Anonymize</option>
            <option value="delete">Delete</option>
          </select>
          <input placeholder="Exceptions (comma separated)" value={draftPolicy.exceptions} onChange={(e) => setDraftPolicy((d) => ({ ...d, exceptions: e.target.value }))} className="sm:col-span-2 rounded-lg border border-[#d8d8d8] px-3 py-2 text-[13px]" />
        </div>
        <button type="button" disabled={busy} onClick={() => void savePolicy()} className="mt-3 rounded-lg bg-[#121212] px-4 py-2 text-[12.5px] text-[#faf9f6] disabled:opacity-50">Save policy</button>
        <div className="mt-3 space-y-1 text-[12.5px] text-[#6b6b6b]">
          {policies.map((p) => (
            <p key={p.id}>{p.domain}: {p.retention_days} days · {p.action} · {p.legal_basis}</p>
          ))}
          {policies.length === 0 ? <p>No policies yet.</p> : null}
        </div>
      </section>

      <section className="mt-5 rounded-xl border border-[#e5e5e5] bg-white p-4">
        <h2 className="text-[15px] font-semibold text-[#121212]">Erasure requests</h2>
        <div className="mt-3 space-y-2">
          {requests.map((r) => (
            <div key={r.id} className="rounded-lg border border-[#ececec] bg-[#faf9f6] px-3 py-2 text-[12.5px]">
              <p className="font-medium text-[#121212]">{r.id.slice(0, 8)} · {r.status}</p>
              <p className="text-[#6b6b6b]">User: {r.user_id}</p>
              <p className="text-[#6b6b6b]">Reason: {r.request_reason}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" disabled={busy} onClick={() => void preview(r.id)} className="rounded border border-[#d8d8d8] px-2.5 py-1 text-[12px]">Preview</button>
                <button type="button" disabled={busy} onClick={() => void review(r.id, 'legal_review')} className="rounded border border-[#d8d8d8] px-2.5 py-1 text-[12px]">Legal review</button>
                <button type="button" disabled={busy} onClick={() => void review(r.id, 'approve')} className="rounded border border-[#86efac] px-2.5 py-1 text-[12px] text-[#166534]">Approve</button>
                <button type="button" disabled={busy} onClick={() => void review(r.id, 'reject')} className="rounded border border-[#fecaca] px-2.5 py-1 text-[12px] text-[#991b1b]">Reject</button>
                <button type="button" disabled={busy} onClick={() => void executeReq(r.id)} className="rounded border border-[#d8d8d8] px-2.5 py-1 text-[12px]">Execute</button>
              </div>
            </div>
          ))}
          {requests.length === 0 ? <p className="text-[12.5px] text-[#6b6b6b]">No erasure requests.</p> : null}
        </div>
      </section>
    </div>
  );
}
