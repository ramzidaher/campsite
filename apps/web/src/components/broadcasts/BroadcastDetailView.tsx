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
  sent_at: string | null;
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

  async function addToCalendar() {
    if (!parsedRange) return;
    setCalendarBusy(true);
    setCalendarMsg(null);
    const { error } = await supabase.from('calendar_events').insert({
      org_id: initial.org_id,
      title: initial.title,
      description: initial.body.slice(0, 2000),
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
    <div className="mx-auto max-w-2xl space-y-6">
      <Link
        href="/broadcasts"
        className="text-sm text-emerald-400 hover:underline"
      >
        ← Back to broadcasts
      </Link>

      <div className="flex flex-wrap gap-2">
        <span className="rounded-full bg-[var(--campsite-bg)] px-2 py-0.5 text-xs text-[var(--campsite-text-secondary)]">
          {initial.departments?.name ?? 'Department'}
        </span>
        <span className="rounded-full bg-[var(--campsite-bg)] px-2 py-0.5 text-xs text-[var(--campsite-text-secondary)]">
          {initial.dept_categories?.name ?? 'Category'}
        </span>
      </div>

      <h1 className="text-2xl font-semibold text-[var(--campsite-text)]">{initial.title}</h1>
      <div className="text-sm text-[var(--campsite-text-secondary)]">
        {initial.profiles?.full_name ?? 'Unknown'} ·{' '}
        {initial.sent_at
          ? new Date(initial.sent_at).toLocaleString(undefined, {
              dateStyle: 'medium',
              timeStyle: 'short',
            })
          : ''}
      </div>

      <article className="max-w-none space-y-3 text-sm leading-relaxed text-[var(--campsite-text)] [&_a]:text-emerald-400 [&_li]:my-0.5 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{initial.body}</ReactMarkdown>
      </article>

      {parsedRange ? (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          <p>
            Event detected:{' '}
            <strong>
              {parsedRange.start.toLocaleString(undefined, {
                dateStyle: 'full',
                timeStyle: 'short',
              })}{' '}
              – {parsedRange.end.toLocaleTimeString(undefined, { timeStyle: 'short' })}
            </strong>
          </p>
          <button
            type="button"
            disabled={calendarBusy}
            onClick={() => void addToCalendar()}
            className="mt-3 rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60"
          >
            {calendarBusy ? 'Saving…' : 'Add to calendar'}
          </button>
          {calendarMsg ? <p className="mt-2 text-xs text-amber-200/90">{calendarMsg}</p> : null}
        </div>
      ) : null}
    </div>
  );
}
