'use client';

import { createClient } from '@/lib/supabase/client';
import { useUiSound } from '@/lib/sound/useUiSound';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

type Notification = {
  id: string;
  request_id: string;
  kind: string;
  old_status: string | null;
  new_status: string;
  job_title: string;
  actor_name: string | null;
  read_at: string | null;
  created_at: string;
};

const STATUS_LABELS: Record<string, string> = {
  pending_review: 'Pending review',
  approved: 'Approved',
  in_progress: 'In progress',
  filled: 'Filled',
  rejected: 'Rejected',
};

function statusColor(status: string): string {
  switch (status) {
    case 'approved': return 'text-[#166534]';
    case 'rejected': return 'text-[#b91c1c]';
    case 'filled': return 'text-[#1d4ed8]';
    case 'in_progress': return 'text-[#7c3aed]';
    default: return 'text-[#92400e]';
  }
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 1000);
  if (diff < 60) return 'Just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return d.toLocaleDateString('en-GB', { timeZone: 'UTC',  day: 'numeric', month: 'short' });
}

export function RecruitmentNotificationsClient({
  notifications,
}: {
  notifications: Notification[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const playUiSound = useUiSound();
  const [busy, setBusy] = useState(false);
  const [localRead, setLocalRead] = useState<Set<string>>(new Set());

  const unread = notifications.filter((n) => !n.read_at && !localRead.has(n.id));

  async function markAllRead() {
    setBusy(true);
    await supabase.rpc('recruitment_notifications_mark_all_read');
    setBusy(false);
    setLocalRead(new Set(notifications.map((n) => n.id)));
    playUiSound('recruitment_mark_all_read');
    router.refresh();
  }

  async function markRead(id: string) {
    setLocalRead((prev) => new Set([...prev, id]));
    await supabase.rpc('recruitment_notification_mark_read', { p_notification_id: id });
    playUiSound('recruitment_read');
  }

  return (
    <div className="mx-auto max-w-2xl px-5 py-8 sm:px-7">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-authSerif text-[26px] leading-tight tracking-[-0.03em] text-[#121212]">
            Recruitment
          </h1>
          <p className="mt-1 text-[13px] text-[#6b6b6b]">
            Updates on your requests and new requests to review.
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
          <p className="text-[14px] text-[#9b9b9b]">No recruitment notifications yet.</p>
          <p className="mt-1 text-[12px] text-[#c8c8c8]">
            You&apos;ll be notified when requests are submitted or their status changes.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {notifications.map((n) => {
            const isUnread = !n.read_at && !localRead.has(n.id);
            return (
              <li key={n.id}>
                <Link
                  href={`/hr/hiring/requests/${n.request_id}`}
                  onClick={() => {
                    if (isUnread) void markRead(n.id);
                    else playUiSound('recruitment_read');
                  }}
                  className={[
                    'flex items-start gap-3 rounded-xl border p-4 transition-colors hover:bg-[#faf9f6]',
                    isUnread ? 'border-[#fde68a] bg-[#fffbeb]' : 'border-[#d8d8d8] bg-white',
                  ].join(' ')}
                >
                  {/* Unread dot */}
                  <span className={[
                    'mt-1.5 h-2 w-2 shrink-0 rounded-full',
                    isUnread ? 'bg-[#f59e0b]' : 'bg-transparent',
                  ].join(' ')} />

                  <div className="flex-1 min-w-0">
                    {n.kind === 'new_request' ? (
                      <>
                        <p className="text-[13px] font-medium text-[#121212]">
                          New recruitment request
                        </p>
                        <p className="mt-0.5 text-[12px] text-[#6b6b6b]">
                          <span className="font-medium text-[#121212]">{n.job_title}</span>
                          {n.actor_name ? ` — raised by ${n.actor_name}` : ''}
                        </p>
                      </>
                    ) : n.kind === 'panel_assignment' ? (
                      <>
                        <p className="text-[13px] font-medium text-[#121212]">You were added to a recruitment panel</p>
                        <p className="mt-0.5 text-[12px] text-[#6b6b6b]">
                          <span className="font-medium text-[#121212]">{n.job_title}</span>
                          {n.actor_name ? ` — assigned by ${n.actor_name}` : ''}
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="text-[13px] font-medium text-[#121212]">
                          Request updated: {n.job_title}
                        </p>
                        <p className="mt-0.5 text-[12px] text-[#6b6b6b]">
                          {n.old_status ? (
                            <>
                              <span>{STATUS_LABELS[n.old_status] ?? n.old_status}</span>
                              <span className="mx-1.5 text-[#c8c8c8]">→</span>
                            </>
                          ) : null}
                          <span className={`font-medium ${statusColor(n.new_status)}`}>
                            {STATUS_LABELS[n.new_status] ?? n.new_status}
                          </span>
                          {n.actor_name ? ` by ${n.actor_name}` : ''}
                        </p>
                      </>
                    )}
                  </div>

                  <span className="shrink-0 text-[11.5px] text-[#9b9b9b]">
                    {formatTime(n.created_at)}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      <div className="mt-8 text-center">
        <Link
          href="/hr/hiring/requests"
          className="text-[12.5px] text-[#6b6b6b] underline underline-offset-2 hover:text-[#121212]"
        >
          View full recruitment queue →
        </Link>
      </div>
    </div>
  );
}
