'use client';

import { createClient } from '@/lib/supabase/client';
import {
  getResourcePreviewKind,
  TEXT_PREVIEW_MAX_BYTES,
  type ResourcePreviewKind,
} from '@/lib/resourcePreview';
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
  folder: { id: string; name: string } | null;
};

export function ResourceDetailClient({
  initial,
  canManage,
}: {
  initial: Row;
  canManage: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [previewUrlErr, setPreviewUrlErr] = useState<string | null>(null);
  const [downloadUrlErr, setDownloadUrlErr] = useState<string | null>(null);
  const [textBody, setTextBody] = useState<string | null>(null);
  const [textErr, setTextErr] = useState<string | null>(null);
  const [textBusy, setTextBusy] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [summaryNote, setSummaryNote] = useState<string | null>(null);
  const [summaryErr, setSummaryErr] = useState<string | null>(null);
  const [summaryBusy, setSummaryBusy] = useState(true);

  const previewKind: ResourcePreviewKind = getResourcePreviewKind(initial.mime_type, initial.file_name);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setPreviewUrlErr(null);
      setDownloadUrlErr(null);
      const [previewRes, downloadRes] = await Promise.all([
        supabase.storage.from('staff-resources').createSignedUrl(initial.storage_path, 3600),
        supabase.storage
          .from('staff-resources')
          .createSignedUrl(initial.storage_path, 3600, { download: initial.file_name }),
      ]);
      if (cancelled) return;
      if (previewRes.error) {
        setPreviewUrlErr(previewRes.error.message);
        setPreviewUrl(null);
      } else {
        setPreviewUrl(previewRes.data?.signedUrl ?? null);
      }
      if (downloadRes.error) {
        setDownloadUrlErr(downloadRes.error.message);
        setDownloadUrl(null);
      } else {
        setDownloadUrl(downloadRes.data?.signedUrl ?? null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, initial.storage_path, initial.file_name]);

  useEffect(() => {
    if (previewKind !== 'text' || !previewUrl) {
      setTextBody(null);
      setTextErr(null);
      setTextBusy(false);
      return;
    }
    if (initial.byte_size > TEXT_PREVIEW_MAX_BYTES) {
      setTextErr('File is too large to preview here. Use Download.');
      setTextBody(null);
      return;
    }
    let cancelled = false;
    setTextBusy(true);
    setTextErr(null);
    setTextBody(null);
    void (async () => {
      try {
        const res = await fetch(previewUrl);
        if (cancelled) return;
        if (!res.ok) {
          setTextErr('Could not load text preview.');
          return;
        }
        const t = await res.text();
        if (cancelled) return;
        setTextBody(t);
      } catch {
        if (!cancelled) setTextErr('Could not load text preview.');
      } finally {
        if (!cancelled) setTextBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [previewKind, previewUrl, initial.byte_size]);

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

      {initial.folder ? (
        <p className="mt-3 text-[13px] text-[#6b6b6b]">
          Folder:{' '}
          <Link
            href={`/resources?folder=${initial.folder.id}`}
            className="font-medium text-[#121212] underline"
          >
            {initial.folder.name}
          </Link>
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        {downloadUrl ? (
          <a
            href={downloadUrl}
            className="inline-flex h-9 items-center rounded-lg bg-[#121212] px-4 text-[13px] font-medium text-[#faf9f6] hover:bg-black"
          >
            Download
          </a>
        ) : (
          <span className="text-[13px] text-[#6b6b6b]">
            {downloadUrlErr ? downloadUrlErr : 'Preparing file…'}
          </span>
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

      {previewUrlErr && !previewUrl ? (
        <p className="mt-6 text-[13px] text-red-800">Preview unavailable: {previewUrlErr}</p>
      ) : null}

      {previewUrl && previewKind ? (
        <div className="mt-8 overflow-hidden rounded-xl border border-[#d8d8d8] bg-white">
          <h2 className="border-b border-[#ececec] px-4 py-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-[#6b6b6b]">
            Preview
          </h2>
          <div className="p-2">
            {previewKind === 'pdf' ? (
              <iframe
                title="Document preview"
                src={previewUrl}
                className="h-[min(75vh,720px)] w-full rounded-lg border border-[#ececec] bg-[#f5f4f1]"
              />
            ) : null}
            {previewKind === 'image' ? (
              // eslint-disable-next-line @next/next/no-img-element -- signed Supabase URL, not static import
              <img
                src={previewUrl}
                alt=""
                className="max-h-[min(75vh,720px)] w-full object-contain"
              />
            ) : null}
            {previewKind === 'video' ? (
              <video src={previewUrl} controls className="max-h-[min(75vh,720px)] w-full rounded-lg" />
            ) : null}
            {previewKind === 'audio' ? (
              <audio src={previewUrl} controls className="w-full" />
            ) : null}
            {previewKind === 'text' ? (
              <div className="max-h-[min(75vh,720px)] overflow-auto rounded-lg border border-[#ececec] bg-[#faf9f6] p-4">
                {textBusy ? (
                  <p className="text-[13px] text-[#6b6b6b]">Loading text…</p>
                ) : textErr ? (
                  <p className="text-[13px] text-red-800">{textErr}</p>
                ) : textBody != null ? (
                  <pre className="whitespace-pre-wrap break-words font-mono text-[13px] text-[#121212]">
                    {textBody}
                  </pre>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      ) : previewUrl && !previewKind ? (
        <p className="mt-6 text-[13px] text-[#6b6b6b]">
          No inline preview for this file type. Use Download to open it.
        </p>
      ) : null}

      <div className="mt-8 rounded-xl border border-[#d8d8d8] bg-[#f5f4f1] p-4">
        <h2 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#6b6b6b]">AI summary</h2>
        {summaryBusy ? (
          <p className="mt-2 text-[13px] text-[#6b6b6b]">Generating summary…</p>
        ) : summaryErr ? (
          <p className="mt-2 text-[13px] text-red-800">{summaryErr}</p>
        ) : summary ? (
          <div className="mt-2 whitespace-pre-wrap text-[14px] leading-relaxed text-[#121212]">{summary}</div>
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
