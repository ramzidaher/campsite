'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export type PendingRow = {
  id: string;
  full_name: string;
  email: string | null;
  created_at: string;
  departments: string[];
};

export function PendingApprovalsClient({ initial }: { initial: PendingRow[] }) {
  const router = useRouter();
  const [rows, setRows] = useState(initial);
  const [note, setNote] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  async function refresh() {
    router.refresh();
  }

  async function approve(id: string) {
    setBusy(id);
    try {
      const supabase = createClient();
      const { data: me } = await supabase.auth.getUser();
      if (!me.user) return;
      const { error } = await supabase.rpc('approve_pending_profile', {
        p_target: id,
        p_approve: true,
        p_rejection_note: null,
      });
      if (error) {
        alert(error.message);
        return;
      }
      setRows((r) => r.filter((x) => x.id !== id));
      void refresh();
    } finally {
      setBusy(null);
    }
  }

  async function reject(id: string) {
    setBusy(id);
    try {
      const supabase = createClient();
      const { data: me } = await supabase.auth.getUser();
      if (!me.user) return;
      const { error } = await supabase.rpc('approve_pending_profile', {
        p_target: id,
        p_approve: false,
        p_rejection_note: note[id]?.trim() ? note[id]!.trim() : null,
      });
      if (error) {
        alert(error.message);
        return;
      }
      setRows((r) => r.filter((x) => x.id !== id));
      void refresh();
    } finally {
      setBusy(null);
    }
  }

  if (!rows.length) {
    return (
      <p className="mt-6 text-sm text-[var(--campsite-text-secondary)]">No pending registrations.</p>
    );
  }

  return (
    <ul className="mt-6 space-y-4">
      {rows.map((p) => (
        <li
          key={p.id}
          className="rounded-xl border border-[var(--campsite-border)] bg-[var(--campsite-bg)] p-4"
        >
          <p className="font-medium text-[var(--campsite-text)]">{p.full_name}</p>
          <p className="text-sm text-[var(--campsite-text-secondary)]">{p.email ?? '—'}</p>
          <p className="mt-1 text-xs text-[var(--campsite-text-muted)]">
            Requested {new Date(p.created_at).toLocaleString()}
          </p>
          <p className="mt-2 text-sm text-[var(--campsite-text-secondary)]">
            Departments: {p.departments.length ? p.departments.join(', ') : '—'}
          </p>
          <label className="mt-3 block text-xs">
            Rejection note (optional)
            <input
              className="mt-1 w-full rounded border border-[var(--campsite-border)] bg-[var(--campsite-surface)] px-2 py-1 text-sm"
              value={note[p.id] ?? ''}
              onChange={(e) => setNote((n) => ({ ...n, [p.id]: e.target.value }))}
            />
          </label>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy === p.id}
              className="rounded-lg bg-[var(--campsite-success)] px-3 py-1.5 text-sm font-medium text-white"
              onClick={() => void approve(p.id)}
            >
              Approve
            </button>
            <button
              type="button"
              disabled={busy === p.id}
              className="rounded-lg bg-[var(--campsite-warning)] px-3 py-1.5 text-sm font-medium text-white"
              onClick={() => void reject(p.id)}
            >
              Reject
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
