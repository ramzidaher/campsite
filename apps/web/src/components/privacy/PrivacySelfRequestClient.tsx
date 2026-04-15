'use client';

import { useState } from 'react';

export function PrivacySelfRequestClient({ userId }: { userId: string }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit() {
    if (!reason.trim()) return;
    setBusy(true);
    setMsg(null);
    const res = await fetch('/api/privacy/erasure-requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: userId, request_reason: reason.trim() }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setBusy(false);
    if (!res.ok) return setMsg(data.error ?? 'Could not submit request');
    setReason('');
    setMsg('Erasure request submitted for legal review.');
  }

  return (
    <section className="mt-6 rounded-xl border border-[#d8d8d8] bg-white p-5">
      <h2 className="text-[15px] font-semibold text-[#121212]">Privacy / right to erasure</h2>
      <p className="mt-1 text-[12px] text-[#9b9b9b]">Request GDPR right-to-erasure. Payroll/tax records may be retained where legally required.</p>
      {msg ? <p className="mt-2 text-[12px] text-[#6b6b6b]">{msg}</p> : null}
      <textarea
        rows={3}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason for erasure request"
        className="mt-3 w-full rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px]"
      />
      <button
        type="button"
        disabled={busy || !reason.trim()}
        onClick={() => void submit()}
        className="mt-3 rounded-lg bg-[#121212] px-4 py-2 text-[12.5px] text-[#faf9f6] disabled:opacity-50"
      >
        {busy ? 'Submitting…' : 'Submit erasure request'}
      </button>
    </section>
  );
}
