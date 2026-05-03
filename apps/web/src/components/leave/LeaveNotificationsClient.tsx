'use client';

import { campusSurface } from '@campsite/ui/web';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import { useMemo, useState } from 'react';

type Notification = {
  id: string;
  leave_request_id: string | null;
  toil_credit_request_id?: string | null;
  event: string;
  actor_name: string | null;
  read_at: string | null;
  created_at: string;
};

const EVENT_COPY: Record<string, { title: string; detail: string }> = {
  leave_approved: {
    title: 'Leave approved',
    detail: 'Your time-off request was approved.',
  },
  leave_rejected: {
    title: 'Leave declined',
    detail: 'Your time-off request was not approved.',
  },
  cancellation_approved: {
    title: 'Cancellation approved',
    detail: 'Your approved leave was cancelled as requested.',
  },
  cancellation_declined: {
    title: 'Cancellation not approved',
    detail: 'Your leave stays booked as approved.',
  },
  edit_approved: {
    title: 'Leave change approved',
    detail: 'Your requested change to approved leave was accepted.',
  },
  edit_declined: {
    title: 'Leave change not approved',
    detail: 'Your approved leave was kept as it was.',
  },
  toil_credit_approved: {
    title: 'TOIL credit approved',
    detail: 'Your overtime was approved and added to your TOIL balance.',
  },
  toil_credit_rejected: {
    title: 'TOIL credit declined',
    detail: 'Your overtime request was not approved.',
  },
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return d.toLocaleDateString('en-GB', { timeZone: 'UTC',  day: 'numeric', month: 'short' });
}

export function LeaveNotificationsClient({ notifications }: { notifications: Notification[] }) {
  const supabase = useMemo(() => createClient(), []);
  const [busy, setBusy] = useState(false);
  const [localRead, setLocalRead] = useState<Set<string>>(new Set());

  const unread = notifications.filter((n) => !n.read_at && !localRead.has(n.id));

  async function markAllRead() {
    setBusy(true);
    await supabase.rpc('leave_notifications_mark_all_read');
    setBusy(false);
    setLocalRead(new Set(notifications.map((n) => n.id)));
  }

  async function markRead(id: string) {
    setLocalRead((prev) => new Set([...prev, id]));
    await supabase.rpc('leave_notification_mark_read', { p_notification_id: id });
  }

  return (
    <div className="mx-auto max-w-2xl px-5 py-8 sm:px-7">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-authSerif text-[26px] leading-tight tracking-[-0.03em] text-[#121212]">Time off</h1>
          <p className="mt-1 text-[13px] text-[#6b6b6b]">Updates when your leave requests are approved or declined.</p>
        </div>
        {unread.length > 0 ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void markAllRead()}
            className="text-[12.5px] text-[#6b6b6b] underline underline-offset-2 hover:text-[#121212] disabled:opacity-50"
          >
            Mark all as read
          </button>
        ) : null}
      </div>

      {notifications.length === 0 ? (
        <div className="rounded-xl border border-[#d8d8d8] bg-white p-8 text-center">
          <p className="text-[14px] text-[#9b9b9b]">No leave notifications yet.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {notifications.map((n) => {
            const isUnread = !n.read_at && !localRead.has(n.id);
            const copy = EVENT_COPY[n.event] ?? { title: 'Leave update', detail: n.event };
            return (
              <li key={n.id}>
                <Link
                  href="/leave"
                  onClick={() => {
                    if (isUnread) void markRead(n.id);
                  }}
                  className={[
                    'flex items-start gap-3 rounded-xl border p-4',
                    campusSurface.interactiveSheetRow,
                    isUnread ? 'border-[#fde68a] bg-[#fffbeb]' : 'border-[#d8d8d8] bg-white',
                  ].join(' ')}
                >
                  <span
                    className={['mt-1.5 h-2 w-2 shrink-0 rounded-full', isUnread ? 'bg-[#f59e0b]' : 'bg-transparent'].join(
                      ' ',
                    )}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium text-[#121212]">{copy.title}</p>
                    <p className="mt-0.5 text-[12px] text-[#6b6b6b]">{copy.detail}</p>
                    {n.actor_name ? (
                      <p className="mt-1 text-[12px] text-[#9b9b9b]">By {n.actor_name}</p>
                    ) : null}
                    <p className="mt-1.5 text-[11px] text-[#b4b4b4]">{formatTime(n.created_at)}</p>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
