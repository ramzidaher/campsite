'use client';

import { FormSelect } from '@campsite/ui/web';
import { adminBroadcastsFilterChannelAria, channelPillAccessibleName } from '@/lib/broadcasts/channelCopy';
import { createClient } from '@/lib/supabase/client';
import { Pencil, Search } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

export type AdminBroadcastRow = {
  id: string;
  title: string;
  status: string;
  scheduled_at: string | null;
  sent_at: string | null;
  created_at: string;
  dept_id: string;
  channel_id: string | null;
  is_org_wide?: boolean | null;
  team_id?: string | null;
  departments: { name: string } | { name: string }[] | null;
  broadcast_channels: { name: string } | { name: string }[] | null;
  department_teams?: { name: string } | { name: string }[] | null;
  sender: { full_name: string } | { full_name: string }[] | null;
};

function firstName(
  v: { name: string } | { name: string }[] | null | undefined
): string {
  if (!v) return '-';
  if (Array.isArray(v)) return v[0]?.name ?? '-';
  return v.name;
}

function firstSender(
  v: { full_name: string } | { full_name: string }[] | null | undefined
): string {
  if (!v) return 'Unknown';
  if (Array.isArray(v)) return v[0]?.full_name ?? 'Unknown';
  return v.full_name;
}

type MainTab = 'all' | 'draft' | 'scheduled' | 'sent';

function statusBadge(st: string) {
  if (st === 'sent') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#dcfce7] px-2.5 py-0.5 text-[11px] font-medium text-[#166534]">
        <span className="h-[5px] w-[5px] rounded-full bg-current" />
        Sent
      </span>
    );
  }
  if (st === 'draft') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#fff7ed] px-2.5 py-0.5 text-[11px] font-medium text-[#c2410c]">
        <span className="h-[5px] w-[5px] rounded-full bg-current" />
        Draft
      </span>
    );
  }
  if (st === 'pending_approval') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#fff7ed] px-2.5 py-0.5 text-[11px] font-medium text-[#c2410c]">
        <span className="h-[5px] w-[5px] rounded-full bg-current" />
        Pending approval
      </span>
    );
  }
  if (st === 'scheduled') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#f5f4f1] px-2.5 py-0.5 text-[11px] font-medium text-[#9b9b9b]">
        <span className="h-[5px] w-[5px] rounded-full bg-current" />
        Scheduled
      </span>
    );
  }
  if (st === 'cancelled') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[#f5f4f1] px-2.5 py-0.5 text-[11px] font-medium text-[#9b9b9b]">
        <span className="h-[5px] w-[5px] rounded-full bg-current" />
        Cancelled
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[#f5f4f1] px-2.5 py-0.5 text-[11px] font-medium text-[#9b9b9b]">
      <span className="h-[5px] w-[5px] rounded-full bg-current" />
      {st}
    </span>
  );
}

function timeLabel(r: AdminBroadcastRow) {
  if (r.status === 'sent' && r.sent_at) {
    return new Date(r.sent_at).toLocaleString();
  }
  if (r.status === 'scheduled' && r.scheduled_at) {
    return new Date(r.scheduled_at).toLocaleString();
  }
  return new Date(r.created_at).toLocaleString();
}

export function AdminBroadcastsClient({
  initialRows,
  readCountByBroadcast,
  departments,
  categories,
}: {
  initialRows: AdminBroadcastRow[];
  readCountByBroadcast: Record<string, number>;
  departments: { id: string; name: string }[];
  categories: { id: string; name: string; dept_id: string }[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [mainTab, setMainTab] = useState<MainTab>('all');
  const [filterDept, setFilterDept] = useState('all');
  const [filterCat, setFilterCat] = useState('all');
  const [q, setQ] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const catsInDept = useMemo(() => {
    if (filterDept === 'all') return categories;
    return categories.filter((c) => c.dept_id === filterDept);
  }, [categories, filterDept]);

  const tabCounts = useMemo(() => {
    const draftish = (s: string) => s === 'draft' || s === 'pending_approval';
    return {
      all: initialRows.length,
      draft: initialRows.filter((r) => draftish(r.status)).length,
      scheduled: initialRows.filter((r) => r.status === 'scheduled').length,
      sent: initialRows.filter((r) => r.status === 'sent').length,
    };
  }, [initialRows]);

  const filtered = useMemo(() => {
    const qn = q.trim().toLowerCase();
    return initialRows.filter((r) => {
      if (mainTab === 'draft') {
        if (r.status !== 'draft' && r.status !== 'pending_approval') return false;
      } else if (mainTab !== 'all') {
        if (r.status !== mainTab) return false;
      }
      if (filterDept !== 'all' && r.dept_id !== filterDept) return false;
      if (filterCat === '__org_wide__') {
        if (!r.is_org_wide) return false;
      } else if (filterCat !== 'all' && r.channel_id !== filterCat) return false;
      if (qn && !r.title.toLowerCase().includes(qn)) return false;
      return true;
    });
  }, [initialRows, mainTab, filterDept, filterCat, q]);

  async function cancelScheduled(id: string, scheduledAt: string | null) {
    if (scheduledAt) {
      const ms = new Date(scheduledAt).getTime() - Date.now();
      if (ms < 60_000) {
        alert('Cannot cancel within 1 minute of send time.');
        return;
      }
    }
    setMsg(null);
    const { error } = await supabase.from('broadcasts').update({ status: 'cancelled' }).eq('id', id);
    if (error) setMsg(error.message);
    else router.refresh();
  }

  async function deleteDraft(id: string) {
    if (!confirm('Delete this draft permanently?')) return;
    setMsg(null);
    const { error } = await supabase.from('broadcasts').delete().eq('id', id);
    if (error) setMsg(error.message);
    else router.refresh();
  }

  async function decide(id: string, action: 'approve_send' | 'reject') {
    setMsg(null);
    let note: string | null = null;
    if (action === 'reject') {
      const prompted = window.prompt('Rejection note for the author?');
      if (prompted === null) return;
      note = prompted.trim() || 'Rejected';
    }
    setBusyId(id);
    try {
      const { error } = await supabase.rpc('decide_pending_broadcast', {
        p_broadcast_id: id,
        p_action: action,
        p_rejection_note: action === 'reject' ? note : null,
      });
      if (error) setMsg(error.message);
      else router.refresh();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="w-full px-5 py-6 sm:px-[28px] sm:py-7">
      <div className="mb-5 flex flex-col gap-4 sm:mb-6 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="font-authSerif text-[26px] leading-tight tracking-[-0.03em] text-[#121212]">
            Broadcast management
          </h1>
          <p className="mt-1 text-[13px] text-[#6b6b6b]">All broadcasts across your organisation</p>
        </div>
        <Link
          href="/broadcasts?tab=feed&compose=1"
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#121212] px-4 text-[13px] font-medium text-[#faf9f6] transition-opacity hover:opacity-90"
        >
          <Pencil className="h-4 w-4" aria-hidden />
          New broadcast
        </Link>
      </div>

      {msg ? <p className="mb-4 text-sm text-[#b91c1c]">{msg}</p> : null}

      <div className="mb-5 flex flex-wrap gap-1 rounded-lg border border-[#d8d8d8] bg-[#f5f4f1] p-1">
        {(
          [
            ['all', 'All', tabCounts.all, false],
            ['draft', 'Drafts', tabCounts.draft, true],
            ['scheduled', 'Scheduled', tabCounts.scheduled, false],
            ['sent', 'Sent', tabCounts.sent, false],
          ] as const
        ).map(([key, label, count, amber]) => (
          <button
            key={key}
            type="button"
            onClick={() => setMainTab(key)}
            className={[
              'rounded-md px-3 py-1.5 text-[12.5px] transition-colors',
              mainTab === key
                ? 'bg-white font-medium text-[#121212] shadow-sm'
                : 'font-normal text-[#6b6b6b] hover:text-[#121212]',
            ].join(' ')}
          >
            {label}{' '}
            <span className={amber && count > 0 ? 'text-[#D97706]' : 'text-[#9b9b9b]'} style={{ fontSize: 11 }}>
              {count}
            </span>
          </button>
        ))}
      </div>

      <div className="mb-5 grid grid-cols-1 gap-3 rounded-xl border border-[#d8d8d8] bg-white p-4 md:grid-cols-[minmax(220px,1fr)_auto_auto] md:items-center">
        <div className="flex h-10 w-full items-center gap-2 rounded-lg border border-[#d8d8d8] bg-[#f5f4f1] px-3">
          <Search className="h-3.5 w-3.5 text-[#9b9b9b]" aria-hidden />
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search title..."
            className="min-w-0 flex-1 border-0 bg-transparent text-[13px] text-[#121212] outline-none placeholder:text-[#9b9b9b]"
            aria-label="Search broadcasts"
          />
        </div>
        <FormSelect
          className="h-10 rounded-lg border border-[#d8d8d8] bg-white px-3 text-[13px] text-[#121212] outline-none"
          value={filterDept}
          onChange={(e) => {
            setFilterDept(e.target.value);
            setFilterCat('all');
          }}
          aria-label="Department"
        >
          <option value="all">All departments</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </FormSelect>
        <FormSelect
          className="h-10 min-w-[180px] rounded-lg border border-[#d8d8d8] bg-white px-3 text-[13px] text-[#121212] outline-none"
          value={filterCat}
          onChange={(e) => setFilterCat(e.target.value)}
          aria-label={adminBroadcastsFilterChannelAria}
        >
          <option value="all">All channels</option>
          <option value="__org_wide__">Org-wide only (no channel)</option>
          {catsInDept.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </FormSelect>
      </div>

      <div className="flex flex-col gap-3">
        {filtered.length === 0 ? (
          <div className="rounded-xl border border-[#d8d8d8] bg-white px-6 py-14 text-center">
            <p className="text-[15px] font-medium text-[#6b6b6b]">No broadcasts match</p>
            <p className="mt-1 text-[13px] text-[#9b9b9b]">Try another tab or filter.</p>
          </div>
        ) : (
          filtered.map((r) => {
            const id = r.id;
            const st = r.status;
            const reads = readCountByBroadcast[id] ?? 0;
            const busy = busyId === id;
            return (
              <div
                key={id}
                className="flex flex-col gap-3 rounded-xl border border-[#d8d8d8] bg-white p-4 transition-colors hover:bg-[#faf9f6] sm:flex-row sm:items-center sm:gap-3.5"
              >
                <div className="min-w-0 flex-1">
                  <div className="text-[13.5px] font-medium text-[#121212]">{r.title}</div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <span className="inline-flex items-center rounded-full border border-[#d8d8d8] bg-[#f5f4f1] px-2 py-0.5 text-[11px] font-medium text-[#6b6b6b]">
                      {firstName(r.departments as never)}
                    </span>
                    {r.is_org_wide ? (
                      <span className="inline-flex items-center rounded-full border border-[#e7e5e4] bg-[#f5f5f4] px-2 py-0.5 text-[11px] font-medium text-[#44403c]">
                        Org-wide
                      </span>
                    ) : null}
                    <span
                      className="inline-flex items-center rounded-full border border-[#d8d8d8] bg-[#f5f4f1] px-2 py-0.5 text-[11px] font-medium text-[#6b6b6b]"
                      title={
                        r.is_org_wide
                          ? undefined
                          : channelPillAccessibleName(firstName(r.broadcast_channels as never))
                      }
                      aria-label={
                        r.is_org_wide
                          ? 'All channels'
                          : channelPillAccessibleName(firstName(r.broadcast_channels as never))
                      }
                    >
                      {r.is_org_wide ? 'All channels' : firstName(r.broadcast_channels as never)}
                    </span>
                    {firstName(r.department_teams as never) !== '-' ? (
                      <span className="inline-flex items-center rounded-full border border-[#e9d5ff] bg-[#faf5ff] px-2 py-0.5 text-[11px] font-medium text-[#6b21a8]">
                        {firstName(r.department_teams as never)}
                      </span>
                    ) : null}
                    {statusBadge(st)}
                  </div>
                </div>
                <div className="shrink-0 text-left sm:text-right">
                  <div className="text-[12.5px] text-[#6b6b6b]">by {firstSender(r.sender as never)}</div>
                  <div className="text-[11.5px] text-[#9b9b9b]">{timeLabel(r)}</div>
                  {st === 'sent' && reads > 0 ? (
                    <div className="mt-0.5 text-[11px] text-[#9b9b9b]">{reads} reads</div>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2 sm:shrink-0">
                  {st === 'pending_approval' ? (
                    <>
                      <button
                        type="button"
                        disabled={busy}
                        className="rounded-md border border-[#bbf7d0] bg-[#dcfce7] px-2.5 py-1.5 text-[12px] font-medium text-[#166534] hover:bg-[#bbf7d0] disabled:opacity-50"
                        onClick={() => void decide(id, 'approve_send')}
                      >
                        Approve &amp; send
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        className="rounded-md border border-[#fecaca] px-2.5 py-1.5 text-[12px] text-[#b91c1c] hover:bg-[#fef2f2] disabled:opacity-50"
                        onClick={() => void decide(id, 'reject')}
                      >
                        Reject
                      </button>
                    </>
                  ) : null}
                  <Link
                    href={`/broadcasts/${id}`}
                    className="inline-flex items-center rounded-md border border-[#d8d8d8] px-2.5 py-1.5 text-[12px] font-medium text-[#6b6b6b] hover:bg-[#f5f4f1]"
                  >
                    View
                  </Link>
                  {st === 'scheduled' ? (
                    <button
                      type="button"
                      className="rounded-md border border-[#d8d8d8] px-2.5 py-1.5 text-[12px] text-[#b91c1c] hover:bg-[#fef2f2]"
                      onClick={() => void cancelScheduled(id, r.scheduled_at)}
                    >
                      Cancel
                    </button>
                  ) : null}
                  {st === 'draft' ? (
                    <button
                      type="button"
                      className="rounded-md border border-[#fecaca] px-2.5 py-1.5 text-[12px] text-[#b91c1c] hover:bg-[#fef2f2]"
                      onClick={() => void deleteDraft(id)}
                    >
                      Delete
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
