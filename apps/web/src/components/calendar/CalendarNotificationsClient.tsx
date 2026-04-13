'use client';

import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import { useMemo, useState } from 'react';

type Row = {
  id: string;
  event_id: string | null;
  kind: string;
  event_title: string;
  actor_name: string | null;
  read_at: string | null;
  created_at: string;
};

const KIND_COPY: Record<string, string> = {
  invited: 'invited you to an event',
  updated: 'updated an event you’re invited to',
  cancelled: 'cancelled an event you were invited to',
};

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export function CalendarNotificationsClient({ notifications }: { notifications: Row[] }) {
  const supabase = useMemo(() => createClient(), []);
  const [busy, setBusy] = useState(false);
  const [localRead, setLocalRead] = useState<Set<string>>(new Set());

  const unread = notifications.filter((n) => !n.read_at && !localRead.has(n.id));

  async function markAllRead() {
    setBusy(true);
    await supabase.rpc('calendar_event_notifications_mark_all_read');
    setBusy(false);
    setLocalRead(new Set(notifications.map((n) => n.id)));
  }

  async function markRead(id: string) {
    setLocalRead((prev) => new Set([...prev, id]));
    await supabase.rpc('calendar_event_notification_mark_read', { p_notification_id: id });
  }

  return (
    <div className="mx-auto max-w-2xl px-5 py-8 sm:px-7">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-authSerif text-[26px] leading-tight tracking-[-0.03em] text-[#121212]">Calendar</h1>
          <p className="mt-1 text-[13px] text-[#6b6b6b]">Invites and changes to events you’re part of.</p>
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
        <p className="rounded-xl border border-[#d8d8d8] bg-white px-5 py-10 text-center text-sm text-[#6b6b6b]">
          No calendar notifications yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {notifications.map((n) => (
            <li key={n.id}>
              <Link
                href="/calendar"
                onClick={() => void markRead(n.id)}
                className={[
                  'block rounded-xl border px-4 py-3 transition-colors',
                  !n.read_at && !localRead.has(n.id)
                    ? 'border-[#121212]/20 bg-[#faf9f6]'
                    : 'border-[#d8d8d8] bg-white hover:bg-[#f5f4f1]',
                ].join(' ')}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[13.5px] font-medium text-[#121212]">{n.event_title}</p>
                    <p className="mt-1 text-[13px] text-[#6b6b6b]">
                      {n.actor_name ? (
                        <>
                          <span className="font-medium text-[#121212]">{n.actor_name}</span>{' '}
                        </>
                      ) : null}
                      {KIND_COPY[n.kind] ?? n.kind}
                    </p>
                  </div>
                  <span className="shrink-0 text-[11px] text-[#9b9b9b]">{formatTime(n.created_at)}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
