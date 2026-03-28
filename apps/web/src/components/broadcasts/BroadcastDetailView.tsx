'use client';

import { enqueueBroadcastRead } from '@/lib/offline/broadcastReadQueue';
import { createClient } from '@/lib/supabase/client';
import * as chrono from 'chrono-node';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type Row = {
  id: string;
  org_id: string;
  title: string;
  body: string;
  /** When not `sent`, we skip read receipts and may show status UI. */
  status?: string;
  sent_at: string | null;
  is_mandatory?: boolean;
  is_pinned?: boolean;
  is_org_wide?: boolean;
  departments: { name: string } | null;
  dept_categories: { name: string } | null;
  profiles: { full_name: string } | null;
};

export function BroadcastDetailView({ initial, userId }: { initial: Row; userId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [marked, setMarked] = useState(false);
  const [calendarMsg, setCalendarMsg] = useState<string | null>(null);
  const [calendarBusy, setCalendarBusy] = useState(false);

  useEffect(() => {
    if (marked) return;
    if (initial.status && initial.status !== 'sent') {
      setMarked(true);
      return;
    }
    void (async () => {
      const offline = typeof navigator !== 'undefined' && !navigator.onLine;
      if (offline) {
        enqueueBroadcastRead(initial.id, userId);
        setMarked(true);
        return;
      }
      const { error } = await supabase.from('broadcast_reads').upsert(
        { broadcast_id: initial.id, user_id: userId },
        { onConflict: 'broadcast_id,user_id' }
      );
      if (error) {
        enqueueBroadcastRead(initial.id, userId);
      }
      setMarked(true);
    })();
  }, [supabase, initial.id, userId, marked]);

  const parsedRange = useMemo(() => {
    const results = chrono.parse(initial.body, new Date(), { forwardDate: true });
    const first = results[0];
    if (!first?.start) return null;
    const start = first.start.date();
    const end =
      first.end != null && typeof first.end.date === 'function'
        ? first.end.date()
        : new Date(start.getTime() + 60 * 60 * 1000);
    return { start, end };
  }, [initial.body]);

  const displayTitle = initial.title?.trim() ? initial.title.trim() : 'Untitled broadcast';
  const bodyTrimmed = initial.body?.trim() ?? '';

  async function addToCalendar() {
    if (!parsedRange) return;
    setCalendarBusy(true);
    setCalendarMsg(null);
    const { error } = await supabase.from('calendar_events').insert({
      org_id: initial.org_id,
      title: displayTitle,
      description: initial.body?.slice(0, 2000) ?? '',
      start_time: parsedRange.start.toISOString(),
      end_time: parsedRange.end.toISOString(),
      all_day: false,
      source: 'broadcast',
      broadcast_id: initial.id,
      created_by: userId,
    });
    setCalendarBusy(false);
    if (error) {
      setCalendarMsg(error.message);
      return;
    }
    setCalendarMsg('Added to your organisation calendar.');
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-8">
      <Link
        href="/broadcasts"
        className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#6b6b6b] transition-colors hover:text-[#121212]"
      >
        <span aria-hidden>←</span> Back to broadcasts
      </Link>

      <div className="mt-6 rounded-2xl border border-[#d8d8d8] bg-white p-6 shadow-[0_1px_3px_rgba(18,18,18,0.06)] sm:p-8">
        {initial.status === 'pending_approval' ? (
          <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            <p className="font-semibold">Awaiting approval</p>
            <p className="mt-1 text-amber-950/90">
              This message is not on the organisation feed yet. An approver still needs to publish or reject it.
              Track it anytime from{' '}
              <Link href="/broadcasts?tab=submitted" className="font-medium text-amber-950 underline decoration-amber-800/40 underline-offset-2">
                Sent for approval
              </Link>
              .
            </p>
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {initial.is_pinned ? (
            <span className="inline-flex items-center rounded-full border border-amber-200/80 bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-950">
              Pinned
            </span>
          ) : null}
          {initial.is_mandatory ? (
            <span className="inline-flex items-center rounded-full border border-red-200/80 bg-red-50 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-red-950">
              Mandatory
            </span>
          ) : null}
          {initial.is_org_wide ? (
            <span className="inline-flex items-center rounded-full border border-sky-200/80 bg-sky-50 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-sky-950">
              Org-wide
            </span>
          ) : null}
          {initial.departments?.name ? (
            <span className="inline-flex items-center rounded-full border border-[#d8d8d8] bg-[#f5f4f1] px-2.5 py-0.5 text-[11px] font-medium text-[#6b6b6b]">
              {initial.departments.name}
            </span>
          ) : null}
          {initial.dept_categories?.name ? (
            <span className="inline-flex items-center rounded-full border border-[#d8d8d8] bg-[#f5f4f1] px-2.5 py-0.5 text-[11px] font-medium text-[#6b6b6b]">
              {initial.dept_categories.name}
            </span>
          ) : null}
        </div>

        <h1 className="mt-5 font-authSerif text-[1.65rem] font-normal leading-tight tracking-tight text-[#121212] sm:text-3xl">
          {displayTitle}
        </h1>
        <p className="mt-3 text-sm text-[#6b6b6b]">
          <span className="font-medium text-[#121212]">
            {initial.profiles?.full_name ?? 'Unknown sender'}
          </span>
          {initial.sent_at ? (
            <>
              <span className="mx-2 text-[#9b9b9b]">·</span>
              <time dateTime={initial.sent_at}>
                {new Date(initial.sent_at).toLocaleString(undefined, {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
              </time>
            </>
          ) : null}
        </p>

        <div className="mt-8 border-t border-[#d8d8d8] pt-8">
          <article className="max-w-none text-[15px] leading-[1.65] text-[#121212] [&_a]:font-medium [&_a]:text-emerald-700 [&_a]:underline [&_a]:decoration-emerald-700/30 [&_a]:underline-offset-2 [&_blockquote]:border-l-2 [&_blockquote]:border-[#d8d8d8] [&_blockquote]:pl-4 [&_blockquote]:text-[#6b6b6b] [&_code]:rounded [&_code]:bg-[#f5f4f1] [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[13px] [&_h2]:mt-6 [&_h2]:text-lg [&_h2]:font-semibold [&_h3]:mt-5 [&_h3]:text-base [&_h3]:font-semibold [&_li]:my-1 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-3 [&_p:first-child]:mt-0 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-[#d8d8d8] [&_pre]:bg-[#f5f4f1] [&_pre]:p-3 [&_pre]:text-[13px] [&_strong]:font-semibold [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-5">
            {bodyTrimmed ? (
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{initial.body}</ReactMarkdown>
            ) : (
              <p className="text-[#9b9b9b]">No message body for this broadcast.</p>
            )}
          </article>
        </div>

        {parsedRange ? (
          <div className="mt-8 rounded-xl border border-amber-200 bg-amber-50/90 px-4 py-4 text-sm text-amber-950">
            <p className="font-medium text-amber-950">Date or time in this message</p>
            <p className="mt-1 text-amber-950/90">
              {parsedRange.start.toLocaleString(undefined, {
                dateStyle: 'full',
                timeStyle: 'short',
              })}{' '}
              – {parsedRange.end.toLocaleTimeString(undefined, { timeStyle: 'short' })}
            </p>
            <button
              type="button"
              disabled={calendarBusy}
              onClick={() => void addToCalendar()}
              className="mt-4 rounded-lg bg-amber-700 px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition-opacity hover:bg-amber-800 disabled:opacity-60"
            >
              {calendarBusy ? 'Saving…' : 'Add to organisation calendar'}
            </button>
            {calendarMsg ? <p className="mt-2 text-xs text-amber-900/80">{calendarMsg}</p> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
