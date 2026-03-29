'use client';

import { BroadcastBackdropPicker } from '@/components/broadcasts/BroadcastBackdropPicker';
import { BroadcastDetailStyleRail } from '@/components/broadcasts/BroadcastDetailStyleRail';
import { channelPillAccessibleName } from '@/lib/broadcasts/channelCopy';
import { enqueueBroadcastRead } from '@/lib/offline/broadcastReadQueue';
import { uploadBroadcastCover } from '@/lib/storage/uploadBroadcastCover';
import { createClient } from '@/lib/supabase/client';
import * as chrono from 'chrono-node';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
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
  cover_image_url?: string | null;
  departments: { name: string } | null;
  broadcast_channels: { name: string } | null;
  department_teams?: { name: string } | null;
  profiles: { full_name: string } | null;
};

export function BroadcastDetailView({
  initial,
  userId,
  canSetCover,
}: {
  initial: Row;
  userId: string;
  canSetCover: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(initial.cover_image_url ?? null);
  const [coverBusy, setCoverBusy] = useState(false);
  const [coverErr, setCoverErr] = useState<string | null>(null);
  const [backdropOpen, setBackdropOpen] = useState(false);
  const [backdropBlur, setBackdropBlur] = useState(false);

  useEffect(() => {
    setCoverImageUrl(initial.cover_image_url ?? null);
  }, [initial.id, initial.cover_image_url]);

  useEffect(() => {
    if (!coverImageUrl) setBackdropBlur(false);
  }, [coverImageUrl]);
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
  const [summary, setSummary] = useState<string | null>(null);
  const [summaryErr, setSummaryErr] = useState<string | null>(null);
  const [summaryBusy, setSummaryBusy] = useState(false);
  const showAiSummary = bodyTrimmed.length >= 480;

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

  async function requestSummary() {
    setSummaryBusy(true);
    setSummaryErr(null);
    try {
      const res = await fetch('/api/broadcasts/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ title: displayTitle, body: initial.body ?? '' }),
      });
      let data: { summary?: string; error?: string; message?: string } = {};
      try {
        data = (await res.json()) as typeof data;
      } catch {
        /* ignore */
      }
      if (!res.ok) {
        const msg =
          data.error === 'not_configured' && typeof data.message === 'string'
            ? data.message
            : typeof data.error === 'string'
              ? data.error
              : 'Could not summarise this broadcast.';
        setSummaryErr(msg);
        return;
      }
      if (typeof data.summary === 'string' && data.summary.trim()) {
        setSummary(data.summary.trim());
      } else {
        setSummaryErr('No summary was returned. Try again.');
      }
    } catch {
      setSummaryErr('Network error. Check your connection and try again.');
    } finally {
      setSummaryBusy(false);
    }
  }

  async function applyCoverFile(file: File) {
    setCoverBusy(true);
    setCoverErr(null);
    const up = await uploadBroadcastCover(supabase, userId, initial.id, file);
    if (!up.ok) {
      setCoverErr(up.message);
      setCoverBusy(false);
      return;
    }
    const { error } = await supabase
      .from('broadcasts')
      .update({ cover_image_url: up.publicUrl })
      .eq('id', initial.id);
    if (error) {
      setCoverErr(error.message);
      setCoverBusy(false);
      return;
    }
    setCoverImageUrl(up.publicUrl);
    setCoverBusy(false);
  }

  async function applyCoverFromUrl(imageUrl: string, downloadLocation?: string | null) {
    if (downloadLocation) {
      void fetch('/api/unsplash/track-download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ downloadLocation }),
      });
    }
    setCoverBusy(true);
    setCoverErr(null);
    const { error } = await supabase
      .from('broadcasts')
      .update({ cover_image_url: imageUrl })
      .eq('id', initial.id);
    if (error) {
      setCoverErr(error.message);
      setCoverBusy(false);
      return;
    }
    setCoverImageUrl(imageUrl);
    setCoverBusy(false);
  }

  async function removeCover() {
    setCoverBusy(true);
    setCoverErr(null);
    const { error } = await supabase
      .from('broadcasts')
      .update({ cover_image_url: null })
      .eq('id', initial.id);
    if (error) {
      setCoverErr(error.message);
      setCoverBusy(false);
      return;
    }
    setCoverImageUrl(null);
    setCoverBusy(false);
  }

  return (
    <>
      {coverImageUrl ? (
        <div
          className={[
            'pointer-events-none fixed inset-0 z-0 bg-cover bg-center bg-no-repeat transition-[filter,transform] duration-300',
            backdropBlur ? 'scale-[1.08] blur-lg' : '',
          ].join(' ')}
          style={{ backgroundImage: `url(${coverImageUrl})` }}
          aria-hidden
        />
      ) : null}

      <BroadcastBackdropPicker
        open={backdropOpen}
        onOpenChange={setBackdropOpen}
        coverImageUrl={coverImageUrl}
        canSetCover={canSetCover}
        coverBusy={coverBusy}
        backdropBlur={backdropBlur}
        onBackdropBlurChange={setBackdropBlur}
        onApplyImageUrl={(url, dl) => void applyCoverFromUrl(url, dl)}
        onRemoveCover={() => void removeCover()}
        onUploadClick={() => coverInputRef.current?.click()}
      />

      <BroadcastDetailStyleRail
        canSetCover={canSetCover}
        coverBusy={coverBusy}
        onUploadClick={() => coverInputRef.current?.click()}
        onOpenBackdropPanel={() => setBackdropOpen(true)}
      />

      <div className="relative z-10 mx-auto w-full max-w-4xl py-6 pl-4 pr-14 sm:py-8 sm:pl-6 sm:pr-20 lg:max-w-5xl">
        <input
          ref={coverInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="sr-only"
          aria-hidden
          tabIndex={-1}
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void applyCoverFile(f);
          }}
        />

        <Link
          href="/broadcasts"
          className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#6b6b6b] transition-colors hover:text-[#121212]"
        >
          <span aria-hidden>←</span> Back to broadcasts
        </Link>

        <div className="group relative mt-6 overflow-hidden rounded-2xl border border-[#d8d8d8] bg-white shadow-[0_8px_40px_rgba(18,18,18,0.08)]">
          <div className="p-6 sm:p-8">
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
          {initial.is_org_wide ? (
            <span className="inline-flex items-center rounded-full border border-[#d8d8d8] bg-[#f5f4f1] px-2.5 py-0.5 text-[11px] font-medium text-[#6b6b6b]">
              All channels
            </span>
          ) : initial.broadcast_channels?.name ? (
            <span
              className="inline-flex items-center rounded-full border border-[#d8d8d8] bg-[#f5f4f1] px-2.5 py-0.5 text-[11px] font-medium text-[#6b6b6b]"
              title={channelPillAccessibleName(initial.broadcast_channels.name)}
              aria-label={channelPillAccessibleName(initial.broadcast_channels.name)}
            >
              {initial.broadcast_channels.name}
            </span>
          ) : null}
          {initial.department_teams?.name ? (
            <span className="inline-flex items-center rounded-full border border-[#d8d8d8] bg-[#eef2ff] px-2.5 py-0.5 text-[11px] font-medium text-[#4338ca]">
              {initial.department_teams.name}
            </span>
          ) : null}
        </div>

        <h1
          id="broadcast-detail-title"
          className="mt-5 font-authSerif text-[1.65rem] font-normal leading-tight tracking-tight text-[#121212] sm:text-3xl"
        >
          {displayTitle}
        </h1>
        <p id="broadcast-detail-meta" className="mt-3 text-sm text-[#6b6b6b]">
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

        {showAiSummary ? (
          <div className="mt-8 rounded-xl border border-[#e4e4e4] bg-[#fafaf9] px-4 py-4 sm:px-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-[#121212]">Quick summary</p>
                <p className="mt-1 text-xs leading-relaxed text-[#6b6b6b]">
                  Generated automatically. Confirm dates, locations, and anything you need to act on in the full message
                  below.
                </p>
              </div>
              <button
                type="button"
                disabled={summaryBusy}
                onClick={() => void requestSummary()}
                className="shrink-0 rounded-lg border border-[#cfcfcf] bg-white px-3.5 py-2 text-sm font-medium text-[#121212] shadow-sm transition-colors hover:bg-[#f0f0ef] disabled:opacity-60"
              >
                {summaryBusy ? 'Summarising…' : summary ? 'Regenerate' : 'Summarise'}
              </button>
            </div>
            {summaryErr ? (
              <p className="mt-3 text-sm text-red-800" role="alert">
                {summaryErr}
              </p>
            ) : null}
            {summary ? (
              <div className="mt-3 border-t border-[#e4e4e4] pt-3 text-sm leading-relaxed text-[#121212] whitespace-pre-wrap">
                {summary}
              </div>
            ) : !summaryBusy && !summaryErr ? (
              <p className="mt-3 text-sm text-[#6b6b6b]">Summarise to pull out the main points from this broadcast.</p>
            ) : null}
          </div>
        ) : null}

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

          {coverErr ? (
            <p className="mt-4 text-sm text-red-800" role="alert">
              {coverErr}
            </p>
          ) : null}
        </div>
        </div>
      </div>
    </>
  );
}
