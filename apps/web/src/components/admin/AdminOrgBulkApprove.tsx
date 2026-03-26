'use client';

import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import type { PendingPreviewRow } from '@/lib/dashboard/loadDashboardHome';

export function AdminOrgBulkApprove({
  orgId,
  pendingCount,
  pendingPreview = [],
}: {
  orgId: string;
  pendingCount: number;
  pendingPreview: PendingPreviewRow[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function approveAllPending() {
    if (!confirm('Approve all pending members in this organisation?')) return;
    setBusy(true);
    setMsg(null);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setBusy(false);
      return;
    }
    const { data: rows } = await supabase
      .from('profiles')
      .select('id')
      .eq('org_id', orgId)
      .eq('status', 'pending');
    const ids = (rows ?? []).map((r) => r.id as string);
    for (const id of ids) {
      const { error } = await supabase.rpc('approve_pending_profile', {
        p_target: id,
        p_approve: true,
        p_rejection_note: null,
      });
      if (error) {
        setMsg(error.message);
        setBusy(false);
        return;
      }
    }
    setBusy(false);
    router.refresh();
  }

  if (pendingCount <= 0) return null;

  return (
    <div className="mt-8 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-amber-950">
          <strong>{pendingCount}</strong> pending verification(s). Super admins can approve everyone in one step.
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={() => void approveAllPending()}
          className="rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? 'Working…' : 'Approve all pending'}
        </button>
      </div>
      {pendingPreview.length > 0 ? (
        <ul className="mt-3 space-y-1 text-xs text-amber-950/90">
          {pendingPreview.map((p) => (
            <li key={p.id}>
              {p.full_name ?? 'Member'}
              {p.deptLine ? ` · ${p.deptLine}` : ''} · {p.email ?? '—'}
            </li>
          ))}
        </ul>
      ) : null}
      <Link
        href="/admin/pending"
        className="mt-2 inline-block text-xs text-amber-900 underline underline-offset-2"
      >
        Review in user management →
      </Link>
      {msg ? <p className="mt-2 text-sm text-red-700">{msg}</p> : null}
    </div>
  );
}
