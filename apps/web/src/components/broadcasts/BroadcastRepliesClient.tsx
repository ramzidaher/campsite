'use client';

import { createClient } from '@/lib/supabase/client';
import { useMemo, useState } from 'react';

export type BroadcastReplyRow = {
  id: string;
  body: string;
  visibility: 'private_to_author' | 'org_thread';
  created_at: string;
  author_id: string;
  author_name: string | null;
};

type VisibilityChoice = 'private_to_author' | 'org_thread';

export function BroadcastRepliesClient({
  orgId,
  broadcastId,
  currentUserId,
  broadcastAuthorId,
  initialRows,
}: {
  orgId: string;
  broadcastId: string;
  currentUserId: string;
  broadcastAuthorId: string;
  initialRows: BroadcastReplyRow[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<BroadcastReplyRow[]>(initialRows);
  const [body, setBody] = useState('');
  const [visibility, setVisibility] = useState<VisibilityChoice>('org_thread');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    const t = body.trim();
    if (!t || busy) return;
    setBusy(true);
    setErr(null);
    const { data, error } = await supabase
      .from('broadcast_replies')
      .insert({
        org_id: orgId,
        broadcast_id: broadcastId,
        author_id: currentUserId,
        body: t.slice(0, 8000),
        visibility,
      })
      .select('id, body, visibility, created_at, author_id')
      .single();

    if (error) {
      setErr(error.message);
      setBusy(false);
      return;
    }
    const r = data as {
      id: string;
      body: string;
      visibility: VisibilityChoice;
      created_at: string;
      author_id: string;
    };
    const { data: me } = await supabase.from('profiles').select('full_name').eq('id', currentUserId).maybeSingle();
    const next: BroadcastReplyRow = {
      ...r,
      author_name: (me?.full_name as string | null) ?? null,
    };
    setRows((prev) => [...prev, next].sort((a, b) => a.created_at.localeCompare(b.created_at)));
    setBody('');
    setBusy(false);
  }

  return (
    <section className="mt-10 border-t border-[#d8d8d8] pt-8" aria-labelledby="broadcast-replies-heading">
      <h2 id="broadcast-replies-heading" className="text-base font-semibold text-[#121212]">
        Replies
      </h2>
      <p className="mt-1 text-xs text-[#6b6b6b]">
        Reply only to the original author, or start a thread everyone who can see this broadcast can read.
      </p>

      <ul className="mt-4 divide-y divide-[#eceae6] rounded-lg border border-[#eceae6] bg-white">
        {rows.map((r) => {
          const mine = r.author_id === currentUserId;
          if (r.visibility === 'private_to_author' && !mine && broadcastAuthorId !== currentUserId) {
            return null;
          }
          return (
            <li
              key={r.id}
              className="px-4 py-3 text-sm text-[#121212]"
            >
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#6b6b6b]">
                <span className="font-medium text-[#121212]">{r.author_name?.trim() || 'Unknown'}</span>
                <span className="text-[#b4b1aa]">•</span>
                <span>{r.visibility === 'org_thread' ? 'Org thread' : 'Personal (author only)'}</span>
                <span className="text-[#b4b1aa]">•</span>
                <time className="text-[11px] text-[#9b9b9b]" dateTime={r.created_at}>
                  {new Date(r.created_at).toLocaleString('en-GB', {
                    timeZone: 'UTC',
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </time>
              </div>
              <p className="mt-1.5 whitespace-pre-wrap leading-relaxed">{r.body}</p>
            </li>
          );
        })}
      </ul>

      <div className="mt-5 space-y-3">
        <div className="flex flex-col gap-2 text-[13px] sm:flex-row sm:flex-wrap sm:gap-4">
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="radio"
              name="reply-vis"
              checked={visibility === 'org_thread'}
              onChange={() => setVisibility('org_thread')}
              className="h-4 w-4 border-[#d8d8d8] text-[#121212]"
            />
            <span>Org-wide reply</span>
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="radio"
              name="reply-vis"
              checked={visibility === 'private_to_author'}
              onChange={() => setVisibility('private_to_author')}
              className="h-4 w-4 border-[#d8d8d8] text-[#121212]"
            />
            <span>Personal reply (author only)</span>
          </label>
        </div>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
          maxLength={8000}
          placeholder="Write a reply…"
          className="w-full rounded-xl border border-[#d8d8d8] bg-white px-3 py-2.5 text-sm text-[#121212] shadow-sm outline-none placeholder:text-[#9b9b9b] focus:border-[#121212] focus:ring-[3px] focus:ring-[#121212]/10"
        />
        {err ? (
          <p className="text-sm text-red-800" role="alert">
            {err}
          </p>
        ) : null}
        <button
          type="button"
          disabled={busy || !body.trim()}
          onClick={() => void submit()}
          className="rounded-lg bg-[#121212] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? 'Sending…' : 'Send reply'}
        </button>
      </div>
    </section>
  );
}
