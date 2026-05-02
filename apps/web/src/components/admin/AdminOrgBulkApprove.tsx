'use client';

import { rolesAssignableOnApprove, type ProfileRole } from '@campsite/types';
import { invalidateClientCaches } from '@/lib/cache/clientInvalidate';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

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
  const assignableRoles = useMemo(() => rolesAssignableOnApprove('org_admin'), []);
  const [bulkApproveRole, setBulkApproveRole] = useState<ProfileRole>('csa');

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
        p_role: bulkApproveRole,
      });
      if (error) {
        setMsg(error.message);
        setBusy(false);
        return;
      }
    }
    setBusy(false);
    await invalidateClientCaches({ scopes: ['org-members'], shellUserIds: ids }).catch(() => null);
    router.refresh();
  }

  if (pendingCount <= 0) return null;

  return (
    <div className="mt-8 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-amber-950">
          <strong>{pendingCount}</strong> pending verification(s). Organisation admins can approve everyone in one
          step.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-2 text-sm text-amber-950">
            Role
            <select
              value={bulkApproveRole}
              onChange={(e) => setBulkApproveRole(e.target.value as ProfileRole)}
              className="rounded-md border border-amber-800/30 bg-white px-2 py-1 text-sm text-amber-950"
            >
              {assignableRoles.map((r) => (
                <option key={r} value={r}>
                  {r.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={() => void approveAllPending()}
            className="rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy ? 'Working...' : 'Approve all pending'}
          </button>
        </div>
      </div>
      {pendingPreview.length > 0 ? (
        <ul className="mt-3 space-y-1 text-xs text-amber-950/90">
          {pendingPreview.map((p) => (
            <li key={p.id}>
              {p.full_name ?? 'Member'}
              {p.deptLine ? ` · ${p.deptLine}` : ''} · {p.email ?? '-'}
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
