'use client';

import {
  BroadcastBodyEditor,
  type BroadcastBodyEditorHandle,
} from '@/components/broadcasts/BroadcastBodyEditor';
import { uploadBroadcastCover } from '@/lib/storage/uploadBroadcastCover';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const TITLE_MAX = 120;

const EDIT_PRIMARY_SAVE_CLASS =
  'rounded-lg px-4 py-2 text-sm font-medium transition hover:opacity-90 disabled:pointer-events-none disabled:opacity-45 bg-[var(--org-brand-primary,#121212)] text-[var(--org-brand-on-primary,#faf9f6)]';

/** `datetime-local` values are local wall time */
function toDatetimeLocalValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function initialsFromPersonName(name: string | null | undefined): string {
  const n = name?.trim();
  if (!n) return '?';
  const p = n.split(/\s+/).filter(Boolean);
  if (p.length === 1) return p[0]!.slice(0, 2).toUpperCase();
  return (p[0]![0]! + p[p.length - 1]![0]!).toUpperCase();
}

function statusLine(isSent: boolean, isScheduled: boolean): string {
  if (isSent) return 'Published';
  if (isScheduled) return 'Scheduled';
  return 'Draft';
}

export function BroadcastEditForm({
  broadcastId,
  userId,
  initialTitle,
  initialBody,
  initialCoverUrl,
  status,
  initialScheduledAt,
  viewerDisplayName = null,
}: {
  broadcastId: string;
  userId: string;
  initialTitle: string;
  initialBody: string;
  initialCoverUrl: string | null;
  status: string;
  initialScheduledAt: string | null;
  viewerDisplayName?: string | null;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const editorRef = useRef<BroadcastBodyEditorHandle>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const bodyImageInputRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const [title, setTitle] = useState(initialTitle);
  const [body, setBody] = useState(initialBody);
  const [coverUrl, setCoverUrl] = useState<string | null>(initialCoverUrl);
  const [scheduledAt, setScheduledAt] = useState(
    status === 'scheduled' && initialScheduledAt
      ? toDatetimeLocalValue(new Date(initialScheduledAt))
      : '',
  );
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const isSent = status === 'sent';
  const isScheduled = status === 'scheduled';

  const composeDateLabel = useMemo(
    () =>
      new Date().toLocaleDateString('en-GB', {
        weekday: 'long',
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }),
    []
  );

  const viewerInitials = initialsFromPersonName(viewerDisplayName);
  const viewerLabel = viewerDisplayName?.trim() || 'You';

  useEffect(() => {
    const ta = titleRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${ta.scrollHeight}px`;
  }, [title]);

  const insertBodyImageFromUrl = useCallback(() => {
    const raw = typeof window !== 'undefined' ? window.prompt('Paste an image URL (https only)') : null;
    if (raw == null) return;
    const u = raw.trim();
    if (!u) return;
    try {
      const parsed = new URL(u);
      if (parsed.protocol !== 'https:') {
        setErr('Image URLs must use https://');
        return;
      }
    } catch {
      setErr('That URL could not be read.');
      return;
    }
    setErr(null);
    editorRef.current?.insertImage(u);
  }, []);

  const insertBodyImageFromFile = useCallback(
    async (file: File) => {
      setErr(null);
      const up = await uploadBroadcastCover(supabase, userId, broadcastId, file);
      if (!up.ok) {
        setErr(up.message);
        return;
      }
      editorRef.current?.insertImage(up.publicUrl);
    },
    [supabase, userId, broadcastId]
  );

  async function onSave() {
    const t = title.trim().slice(0, TITLE_MAX);
    if (!t) {
      setErr('Title is required.');
      return;
    }
    setSaving(true);
    setErr(null);
    const row: Record<string, unknown> = {
      title: t,
      body: body ?? '',
      cover_image_url: coverUrl,
    };
    if (isScheduled && scheduledAt) {
      row.scheduled_at = new Date(scheduledAt).toISOString();
    }
    const { error } = await supabase.from('broadcasts').update(row).eq('id', broadcastId);
    setSaving(false);
    if (error) {
      setErr(error.message);
      return;
    }
    router.push(`/broadcasts/${broadcastId}`);
    router.refresh();
  }

  async function onCoverFile(file: File) {
    setErr(null);
    const up = await uploadBroadcastCover(supabase, userId, broadcastId, file);
    if (!up.ok) {
      setErr(up.message);
      return;
    }
    const { error } = await supabase.from('broadcasts').update({ cover_image_url: up.publicUrl }).eq('id', broadcastId);
    if (error) {
      setErr(error.message);
      return;
    }
    setCoverUrl(up.publicUrl);
  }

  const minSchedule = useMemo(() => {
    const d = new Date(Date.now() + 60 * 1000);
    d.setSeconds(0, 0);
    return toDatetimeLocalValue(d);
  }, []);

  const metaExplainer = isSent
    ? 'Sent posts can be edited for one hour after publishing (title, body, and cover).'
    : isScheduled
      ? 'Update this scheduled broadcast. You can change the send time below.'
      : 'Update this broadcast.';

  return (
    <div className="w-full bg-[#F9F8F6] pb-20">
      <article className="w-full min-w-0 px-5 py-8 selection:bg-[#e8e4df] sm:px-7 sm:py-10 lg:px-10 xl:px-14">
        {err ? (
          <div className="mb-6 rounded-lg border border-red-200/70 bg-white px-3 py-2.5 text-[13px] text-red-800 shadow-sm" role="alert">
            {err}
          </div>
        ) : null}

        <header className="pb-2">
          <Link
            href={`/broadcasts/${broadcastId}`}
            className="text-[13px] leading-relaxed text-[#8f8f8f] transition hover:text-[#2d2d2d]"
          >
            <span aria-hidden>←</span> View broadcast
          </Link>

          <p className="mt-6 text-[13px] leading-relaxed text-[#8f8f8f]">
            <span>Broadcasts</span>
            <span className="mx-1 text-[#c9c7c4]" aria-hidden>
              /
            </span>
            <span>Edit</span>
          </p>

          <label className="sr-only" htmlFor="broadcast-edit-title">
            Title
          </label>
          <textarea
            id="broadcast-edit-title"
            ref={titleRef}
            rows={1}
            maxLength={TITLE_MAX}
            className="mt-5 w-full resize-none border-0 bg-transparent font-authSerif text-[2rem] font-bold leading-[1.2] tracking-[-0.02em] text-[#2d2d2d] outline-none placeholder:text-[#b9b7b4] sm:text-[2.25rem]"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Untitled broadcast"
          />

          <p className="mt-3 text-[14px] leading-relaxed text-[#6b6b6b]">
            <span>{composeDateLabel}</span>
            <span className="mx-1.5 text-[#c9c7c4]" aria-hidden>
              ·
            </span>
            <span>{statusLine(isSent, isScheduled)}</span>
          </p>

          <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-[#8f8f8f]">{metaExplainer}</p>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 max-w-full items-center gap-2.5">
              <span className="text-[12px] text-[#a3a3a3]">Editing</span>
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[#e3e2df] bg-[#E8F1FA] text-[11px] font-semibold text-[#1e4d7a]"
                title={viewerLabel}
              >
                {viewerInitials}
              </span>
              <span className="min-w-0 truncate text-[13px] text-[#6b6b6b]" title={viewerLabel}>
                {viewerLabel}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-[12px] text-[#8f8f8f]">
              {saving ? <span>Saving…</span> : null}
            </div>
          </div>

          <p className="mt-2 text-right text-[11px] text-[#9b9b9b]">
            {title.length}/{TITLE_MAX} characters
          </p>
        </header>

        <section className="mt-14 min-w-0 space-y-6">
          <h2 className="text-[14px] font-semibold text-[#2d2d2d]">Post details</h2>

          {isScheduled ? (
            <div className="rounded-lg border border-[#e3e2df] bg-white/80 p-4 sm:p-5">
              <label className="block">
                <span className="mb-1.5 block text-sm font-medium text-[#2d2d2d]">Scheduled for</span>
                <input
                  type="datetime-local"
                  value={scheduledAt}
                  min={minSchedule}
                  onChange={(e) => setScheduledAt(e.target.value)}
                  className="w-full max-w-md rounded-lg border border-[#e3e2df] bg-white px-3 py-2 text-sm text-[#121212] shadow-sm outline-none focus:border-[#121212] focus:ring-[3px] focus:ring-[#121212]/10"
                />
              </label>
            </div>
          ) : null}

          <div className="rounded-lg border border-[#e3e2df] bg-white/80 p-4 sm:p-5">
            <span className="mb-3 block text-sm font-medium text-[#2d2d2d]">Cover image</span>
            <div className="flex flex-wrap items-center gap-3">
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
                  if (f) void onCoverFile(f);
                }}
              />
              <button
                type="button"
                onClick={() => coverInputRef.current?.click()}
                className="rounded-lg border border-[#e3e2df] bg-white px-3 py-2 text-sm font-medium text-[#2d2d2d] shadow-sm transition hover:bg-[#faf9f7]"
              >
                Upload image
              </button>
              {coverUrl ? (
                <button
                  type="button"
                  onClick={() =>
                    void (async () => {
                      const { error: e } = await supabase
                        .from('broadcasts')
                        .update({ cover_image_url: null })
                        .eq('id', broadcastId);
                      if (e) setErr(e.message);
                      else setCoverUrl(null);
                    })()
                  }
                  className="text-[13px] font-medium text-[#6b6b6b] underline underline-offset-2 hover:text-[#2d2d2d]"
                >
                  Remove cover
                </button>
              ) : null}
            </div>
          </div>
        </section>

        <div className="my-10 h-px bg-[#e8e6e3]" aria-hidden />

        <section className="min-w-0 space-y-5">
          <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="text-[13px] font-semibold uppercase tracking-[0.04em] text-[#8f8f8f]">Message</h2>
              <p className="mt-1.5 text-[12px] leading-relaxed text-[#6b6b6b]">
                Edit visually like Notion — content is stored as markdown for the feed. Add images as framed blocks.
              </p>
            </div>
          </div>
          <div className="overflow-hidden rounded-2xl border border-[#e8e4df] bg-white shadow-[0_2px_12px_rgba(15,15,15,0.05)]">
            <div
              className="flex flex-wrap items-center gap-0.5 border-b border-[#f0ebe6] bg-[#faf9f7] px-2 py-1.5 sm:gap-1 sm:px-3"
              role="toolbar"
              aria-label="Text formatting"
            >
              <button
                type="button"
                className="rounded-md px-2.5 py-1.5 text-[13px] font-medium text-[#504e49] transition hover:bg-[#ebe8e3] active:bg-[#e3dfd9]"
                onClick={() => editorRef.current?.bold()}
              >
                Bold
              </button>
              <button
                type="button"
                className="rounded-md px-2.5 py-1.5 text-[13px] font-medium text-[#504e49] transition hover:bg-[#ebe8e3] active:bg-[#e3dfd9]"
                onClick={() => editorRef.current?.italic()}
              >
                Italic
              </button>
              <span className="mx-0.5 hidden h-4 w-px shrink-0 bg-[#ddd9d4] sm:block" aria-hidden />
              <button
                type="button"
                className="rounded-md px-2.5 py-1.5 text-[13px] font-medium text-[#504e49] transition hover:bg-[#ebe8e3] active:bg-[#e3dfd9]"
                onClick={() => editorRef.current?.bulletList()}
              >
                Bullet list
              </button>
              <button
                type="button"
                className="rounded-md px-2.5 py-1.5 text-[13px] font-medium text-[#504e49] transition hover:bg-[#ebe8e3] active:bg-[#e3dfd9]"
                onClick={() => editorRef.current?.orderedList()}
              >
                Numbered
              </button>
              <span className="mx-0.5 hidden h-4 w-px shrink-0 bg-[#ddd9d4] sm:block" aria-hidden />
              <button
                type="button"
                className="rounded-md px-2.5 py-1.5 text-[13px] font-medium text-[#504e49] transition hover:bg-[#ebe8e3] active:bg-[#e3dfd9]"
                onClick={() => editorRef.current?.undo()}
              >
                Undo
              </button>
              <button
                type="button"
                className="rounded-md px-2.5 py-1.5 text-[13px] font-medium text-[#504e49] transition hover:bg-[#ebe8e3] active:bg-[#e3dfd9]"
                onClick={() => editorRef.current?.redo()}
              >
                Redo
              </button>
              <span className="mx-0.5 hidden h-4 w-px shrink-0 bg-[#ddd9d4] sm:block" aria-hidden />
              <button
                type="button"
                className="rounded-md px-2.5 py-1.5 text-[13px] font-medium text-[#504e49] transition hover:bg-[#ebe8e3] active:bg-[#e3dfd9]"
                onClick={() => bodyImageInputRef.current?.click()}
              >
                Image
              </button>
              <button
                type="button"
                className="rounded-md px-2.5 py-1.5 text-[13px] font-medium text-[#504e49] transition hover:bg-[#ebe8e3] active:bg-[#e3dfd9]"
                onClick={() => insertBodyImageFromUrl()}
              >
                Image URL
              </button>
            </div>
            <input
              ref={bodyImageInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="sr-only"
              aria-hidden
              tabIndex={-1}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) void insertBodyImageFromFile(f);
              }}
            />
            <BroadcastBodyEditor
              ref={editorRef}
              markdown={body}
              onMarkdownChange={setBody}
              disabled={saving}
              placeholder="Write something for your organisation…"
            />
            <p className="border-t border-[#f0ebe6] px-5 py-2.5 text-[12px] leading-snug text-[#9b9b9b] sm:px-6">
              <kbd className="rounded bg-[#f0ebe6] px-1 py-0.5 font-sans text-[11px] text-[#504e49]">⌘/Ctrl+B</kbd> bold,{' '}
              <kbd className="rounded bg-[#f0ebe6] px-1 py-0.5 font-sans text-[11px] text-[#504e49]">⌘/Ctrl+I</kbd> italic,{' '}
              <kbd className="rounded bg-[#f0ebe6] px-1 py-0.5 font-sans text-[11px] text-[#504e49]">⌘/Ctrl+Z</kbd> undo. Use{' '}
              <span className="font-medium text-[#504e49]">Image</span> for uploads or{' '}
              <span className="font-medium text-[#504e49]">Image URL</span> for https links. Type{' '}
              <kbd className="rounded bg-[#f0ebe6] px-1 py-0.5 font-sans text-[11px] text-[#504e49]">#</kbd> then space for a
              heading.
            </p>
          </div>
        </section>

        <div className="mt-10 flex flex-wrap items-center gap-2">
          <Link
            href={`/broadcasts/${broadcastId}`}
            className="rounded-lg px-3 py-2 text-[13px] font-medium text-[#6b6b6b] transition hover:bg-[#ebe8e4] hover:text-[#2d2d2d]"
          >
            Cancel
          </Link>
          <button
            type="button"
            disabled={saving}
            onClick={() => void onSave()}
            className={EDIT_PRIMARY_SAVE_CLASS}
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </article>
    </div>
  );
}
