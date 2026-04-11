'use client';

import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

type Row = {
  id: string;
  title: string;
  description: string;
  file_name: string;
  mime_type: string;
  byte_size: number;
  storage_path: string;
  updated_at: string;
};

export function ResourceDetailClient({
  initial,
  canManage,
}: {
  initial: Row;
  canManage: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [downloadErr, setDownloadErr] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [summaryNote, setSummaryNote] = useState<string | null>(null);
  const [summaryErr, setSummaryErr] = useState<string | null>(null);
  const [summaryBusy, setSummaryBusy] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setDownloadErr(null);
      const { data, error } = await supabase.storage
        .from('staff-resources')
        .createSignedUrl(initial.storage_path, 3600);
      if (cancelled) return;
      if (error) setDownloadErr(error.message);
      else setDownloadUrl(data?.signedUrl ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, initial.storage_path]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setSummaryBusy(true);
      setSummaryErr(null);
      setSummary(null);
      setSummaryNote(null);
      try {
        const res = await fetch('/api/resources/summarize', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ resourceId: initial.id }),
        });
        let data: { summary?: string; note?: string; error?: string; message?: string } = {};
        try {
          data = (await res.json()) as typeof data;
        } catch {
          /* ignore */
        }
        if (cancelled) return;
        if (!res.ok) {
          const msg =
            data.error === 'not_configured' && typeof data.message === 'string'
              ? data.message
              : typeof data.error === 'string'
                ? data.error
                : 'Could not generate summary.';
          setSummaryErr(msg);
          return;
        }
        if (typeof data.summary === 'string' && data.summary.trim()) {
          setSummary(data.summary.trim());
        } else {
          setSummaryErr('No summary returned.');
        }
        if (typeof data.note === 'string' && data.note.trim()) {
          setSummaryNote(data.note.trim());
        }
      } catch {
        if (!cancelled) setSummaryErr('Network error.');
      } finally {
        if (!cancelled) setSummaryBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [initial.id]);

  return (
    <div className="mx-auto max-w-3xl px-7 py-8">
      <Link href="/resources" className="text-[13px] text-[#6b6b6b] hover:text-[#121212]">
        ← Resource library
      </Link>

      <h1 className="mt-4 font-authSerif text-2xl text-[#121212]">{initial.title}</h1>
      {initial.description ? (
        <p className="mt-2 whitespace-pre-wrap text-[14px] text-[#3d3d3d]">{initial.description}</p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        {downloadUrl ? (
          <a
            href={downloadUrl}
            download={initial.file_name}
            className="inline-flex h-9 items-center rounded-lg bg-[#121212] px-4 text-[13px] font-medium text-[#faf9f6] hover:bg-black"
          >
            Download
          </a>
        ) : (
          <span className="text-[13px] text-[#6b6b6b]">{downloadErr ? downloadErr : 'Preparing download…'}</span>
        )}
        {canManage ? (
          <Link
            href="/resources/new"
            className="inline-flex h-9 items-center rounded-lg border border-[#d8d8d8] px-4 text-[13px] text-[#121212]"
          >
            Upload another
          </Link>
        ) : null}
      </div>

      <p className="mt-3 text-[12px] text-[#9b9b9b]">
        {initial.file_name} · {formatBytes(initial.byte_size)} · Updated{' '}
        {new Date(initial.updated_at).toLocaleString()}
      </p>

      <div className="mt-8 rounded-xl border border-[#d8d8d8] bg-[#f5f4f1] p-4">
        <h2 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#6b6b6b]">AI summary</h2>
        {summaryBusy ? (
          <p className="mt-2 text-[13px] text-[#6b6b6b]">Generating summary…</p>
        ) : summaryErr ? (
          <p className="mt-2 text-[13px] text-red-800">{summaryErr}</p>
        ) : summary ? (
          <div className="mt-2 text-[14px] leading-relaxed text-[#121212] whitespace-pre-wrap">{summary}</div>
        ) : (
          <p className="mt-2 text-[13px] text-[#6b6b6b]">No summary available.</p>
        )}
        {summaryNote ? <p className="mt-2 text-[12px] text-[#6b6b6b]">{summaryNote}</p> : null}
      </div>
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
