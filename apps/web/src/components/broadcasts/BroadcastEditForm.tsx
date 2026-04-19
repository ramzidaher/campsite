'use client';

import {
  BroadcastBodyEditor,
  type BroadcastBodyEditorHandle,
} from '@/components/broadcasts/BroadcastBodyEditor';
import { uploadBroadcastCover } from '@/lib/storage/uploadBroadcastCover';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useRef, useState } from 'react';

const TITLE_MAX = 120;

/** `datetime-local` values are local wall time */
function toDatetimeLocalValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function BroadcastEditForm({
  broadcastId,
  userId,
  initialTitle,
  initialBody,
  initialCoverUrl,
  status,
  initialScheduledAt,
}: {
  broadcastId: string;
  userId: string;
  initialTitle: string;
  initialBody: string;
  initialCoverUrl: string | null;
  status: string;
  initialScheduledAt: string | null;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const editorRef = useRef<BroadcastBodyEditorHandle>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
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

  return (
    <div className="mx-auto w-full max-w-3xl py-8">
      <Link
        href={`/broadcasts/${broadcastId}`}
        className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#121212] underline-offset-2 hover:underline"
      >
        <span aria-hidden>←</span> Back to broadcast
      </Link>

      <h1 className="mt-6 font-authSerif text-2xl font-normal text-[#121212]">Edit broadcast</h1>
      <p className="mt-2 text-sm text-[#6b6b6b]">
        {isSent
          ? 'Sent broadcasts can be edited for one hour after publishing (title, body, and cover).'
          : isScheduled
            ? 'Update this scheduled broadcast. You can change the send time below.'
            : 'Update this broadcast.'}
      </p>

      <div className="mt-8 flex flex-col gap-5">
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium text-[#121212]">Title</span>
          <input
            type="text"
            value={title}
            maxLength={TITLE_MAX}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-sm text-[#121212] shadow-sm outline-none focus:border-[#121212] focus:ring-[3px] focus:ring-[#121212]/10"
          />
        </label>

        {isScheduled ? (
          <label className="block">
            <span className="mb-1.5 block text-sm font-medium text-[#121212]">Scheduled for</span>
            <input
              type="datetime-local"
              value={scheduledAt}
              min={minSchedule}
              onChange={(e) => setScheduledAt(e.target.value)}
              className="w-full max-w-md rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-sm text-[#121212] shadow-sm outline-none focus:border-[#121212] focus:ring-[3px] focus:ring-[#121212]/10"
            />
          </label>
        ) : null}

        <div>
          <span className="mb-1.5 block text-sm font-medium text-[#121212]">Message</span>
          <BroadcastBodyEditor ref={editorRef} markdown={body} onMarkdownChange={setBody} />
        </div>

        <div>
          <span className="mb-1.5 block text-sm font-medium text-[#121212]">Cover image</span>
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
              className="rounded-lg border border-[#cfcfcf] bg-white px-3 py-2 text-sm font-medium text-[#121212] shadow-sm hover:bg-[#f5f5f5]"
            >
              Upload image
            </button>
            {coverUrl ? (
              <button
                type="button"
                onClick={() => void (async () => {
                  const { error: e } = await supabase
                    .from('broadcasts')
                    .update({ cover_image_url: null })
                    .eq('id', broadcastId);
                  if (e) setErr(e.message);
                  else setCoverUrl(null);
                })()}
                className="text-sm text-[#6b6b6b] underline"
              >
                Remove cover
              </button>
            ) : null}
          </div>
        </div>

        {err ? (
          <p className="text-sm text-red-800" role="alert">
            {err}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            disabled={saving}
            onClick={() => void onSave()}
            className="rounded-lg bg-[#121212] px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:opacity-90 disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
          <Link
            href={`/broadcasts/${broadcastId}`}
            className="rounded-lg border border-[#d8d8d8] bg-white px-5 py-2.5 text-sm font-medium text-[#121212] shadow-sm hover:bg-[#fafafa]"
          >
            Cancel
          </Link>
        </div>
      </div>
    </div>
  );
}
