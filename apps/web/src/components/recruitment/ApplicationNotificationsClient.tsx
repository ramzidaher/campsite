'use client';

import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import { useMemo, useState } from 'react';

type Notification = {
  id: string;
  application_id: string;
  job_listing_id: string;
  kind: string;
  old_stage: string | null;
  new_stage: string;
  candidate_name: string;
  job_title: string;
  actor_name: string | null;
  read_at: string | null;
  created_at: string;
};

const STAGE_LABELS: Record<string, string> = {
  applied: 'Applied',
  shortlisted: 'Shortlisted',
  interview_scheduled: 'Interview scheduled',
  offer_sent: 'Offer sent',
  hired: 'Hired',
  rejected: 'Rejected',
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

export function ApplicationNotificationsClient({
  notifications,
  applicationsBasePath,
}: {
  notifications: Notification[];
  applicationsBasePath: '/admin/jobs' | '/hr/jobs';
}) {
  const supabase = useMemo(() => createClient(), []);
  const [busy, setBusy] = useState(false);
  const [localRead, setLocalRead] = useState<Set<string>>(new Set());

  const unread = notifications.filter((n) => !n.read_at && !localRead.has(n.id));

  async function markAllRead() {
    setBusy(true);
    await supabase.rpc('application_notifications_mark_all_read');
    setBusy(false);
    setLocalRead(new Set(notifications.map((n) => n.id)));
  }

  async function markRead(id: string) {
    setLocalRead((prev) => new Set([...prev, id]));
    await supabase.rpc('application_notification_mark_read', { p_notification_id: id });
  }

  return (
    <div className="mx-auto max-w-2xl px-5 py-8 sm:px-7">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-authSerif text-[26px] leading-tight tracking-[-0.03em] text-[#121212]">Applications</h1>
          <p className="mt-1 text-[13px] text-[#6b6b6b]">Updates for new applications and stage changes.</p>
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
          <p className="text-[14px] text-[#9b9b9b]">No application notifications yet.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {notifications.map((n) => {
            const isUnread = !n.read_at && !localRead.has(n.id);
            return (
              <li key={n.id}>
                <Link
                  href={`${applicationsBasePath}/${n.job_listing_id}/applications`}
                  onClick={() => {
                    if (isUnread) void markRead(n.id);
                  }}
                  className={[
                    'flex items-start gap-3 rounded-xl border p-4 transition-colors hover:bg-[#faf9f6]',
                    isUnread ? 'border-[#fde68a] bg-[#fffbeb]' : 'border-[#d8d8d8] bg-white',
                  ].join(' ')}
                >
                  <span className={['mt-1.5 h-2 w-2 shrink-0 rounded-full', isUnread ? 'bg-[#f59e0b]' : 'bg-transparent'].join(' ')} />
                  <div className="min-w-0 flex-1">
                    {n.kind === 'new_submission' ? (
                      <>
                        <p className="text-[13px] font-medium text-[#121212]">
                          New application: {n.candidate_name}
                        </p>
                        <p className="mt-0.5 text-[12px] text-[#6b6b6b]">{n.job_title}</p>
                      </>
                    ) : (
                      <>
                        <p className="text-[13px] font-medium text-[#121212]">
                          Stage updated: {n.candidate_name}
                        </p>
                        <p className="mt-0.5 text-[12px] text-[#6b6b6b]">
                          {n.old_stage ? `${STAGE_LABELS[n.old_stage] ?? n.old_stage} -> ` : ''}
                          <span className="font-medium text-[#121212]">{STAGE_LABELS[n.new_stage] ?? n.new_stage}</span>
                          {n.actor_name ? ` by ${n.actor_name}` : ''}
                        </p>
                        <p className="mt-0.5 text-[11.5px] text-[#9b9b9b]">{n.job_title}</p>
                      </>
                    )}
                  </div>
                  <span className="shrink-0 text-[11.5px] text-[#9b9b9b]">{formatTime(n.created_at)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
