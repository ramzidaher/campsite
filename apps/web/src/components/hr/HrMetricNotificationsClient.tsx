'use client';

import { createClient } from '@/lib/supabase/client';
import { useUiSound } from '@/lib/sound/useUiSound';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

export type HrMetricNotificationRow = {
  id: string;
  metric_kind: string;
  severity: string;
  title: string;
  body: string;
  payload: Record<string, unknown> | null;
  subject_user_id: string | null;
  subject_job_listing_id: string | null;
  read_at: string | null;
  created_at: string;
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

export function HrMetricNotificationsClient({
  notifications,
}: {
  notifications: HrMetricNotificationRow[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const playUiSound = useUiSound();
  const [busy, setBusy] = useState(false);
  const [localRead, setLocalRead] = useState<Set<string>>(new Set());

  const unread = notifications.filter((n) => !n.read_at && !localRead.has(n.id));

  async function markAllRead() {
    setBusy(true);
    await supabase.rpc('hr_metric_notifications_mark_all_read');
    setBusy(false);
    setLocalRead(new Set(notifications.map((n) => n.id)));
    playUiSound('recruitment_mark_all_read');
    router.refresh();
  }

  async function markRead(id: string) {
    setLocalRead((prev) => new Set([...prev, id]));
    await supabase.rpc('hr_metric_notification_mark_read', { p_notification_id: id });
    playUiSound('recruitment_read');
  }

  return (
    <div className="mx-auto max-w-2xl px-5 py-8 sm:px-7">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-authSerif text-[26px] leading-tight tracking-[-0.03em] text-[#121212]">
            HR metric alerts
          </h1>
          <p className="mt-1 text-[13px] text-[#6b6b6b]">
            Bradford factor, working hours, recruitment diversity, probation, and related notices.
          </p>
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
          <p className="text-[14px] text-[#9b9b9b]">No HR metric alerts yet.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {notifications.map((n) => {
            const isUnread = !n.read_at && !localRead.has(n.id);
            return (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => {
                    if (isUnread) void markRead(n.id);
                    else playUiSound('recruitment_read');
                  }}
                  className={[
                    'flex w-full items-start gap-3 rounded-xl border p-4 text-left transition-colors hover:bg-[#faf9f6]',
                    isUnread ? 'border-[#fde68a] bg-[#fffbeb]' : 'border-[#d8d8d8] bg-white',
                  ].join(' ')}
                >
                  <span
                    className={[
                      'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                      isUnread ? 'bg-[#f59e0b]' : 'bg-transparent',
                    ].join(' ')}
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium text-[#121212]">{n.title}</p>
                    <p className="mt-0.5 text-[12px] text-[#6b6b6b]">{n.body}</p>
                  </div>
                  <span className="shrink-0 text-[11.5px] text-[#9b9b9b]">{formatTime(n.created_at)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-8 text-center">
        <Link
          href="/hr/hr-metric-alerts"
          className="text-[12.5px] text-[#6b6b6b] underline underline-offset-2 hover:text-[#121212]"
        >
          HR metric settings →
        </Link>
      </div>
    </div>
  );
}
