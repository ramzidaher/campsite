'use client';

import { createClient } from '@/lib/supabase/client';
import {
  getResourcePreviewKind,
  TEXT_PREVIEW_MAX_BYTES,
  type ResourcePreviewKind,
} from '@/lib/resourcePreview';
import { ResourceDocumentAssistant } from '@/components/resources/ResourceDocumentAssistant';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';

type Row = {
  id: string;
  title: string;
  description: string;
  file_name: string;
  mime_type: string;
  byte_size: number;
  storage_path: string;
  updated_at: string;
  archived_at: string | null;
  folder: { id: string; name: string } | null;
};

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function fileKindLabel(mime: string, fileName: string): string {
  const m = mime.toLowerCase();
  const ext = fileName.split('.').pop()?.toUpperCase() ?? '';
  if (m === 'application/pdf' || ext === 'PDF') return 'PDF';
  if (m.startsWith('image/')) return ext || 'Image';
  if (m.startsWith('video/')) return ext || 'Video';
  if (m.startsWith('audio/')) return ext || 'Audio';
  if (m.startsWith('text/') || m === 'application/json') return ext || 'Text';
  return ext || 'File';
}

export function ResourceDetailClient({
  initial,
  canManage,
  archiveSupported = true,
  titleFontClassName,
}: {
  initial: Row;
  canManage: boolean;
  /** False when the DB has no `archived_at` column (migration not applied); archive/restore UI is hidden. */
  archiveSupported?: boolean;
  /** Display font for titles; omit to use Campsite default (`font-authSerif` / DM Serif Display). */
  titleFontClassName?: string;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [archivedAt, setArchivedAt] = useState<string | null>(initial.archived_at);
  const [manageBusy, setManageBusy] = useState(false);
  const [manageErr, setManageErr] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [previewUrlErr, setPreviewUrlErr] = useState<string | null>(null);
  const [downloadUrlErr, setDownloadUrlErr] = useState<string | null>(null);
  const [textBody, setTextBody] = useState<string | null>(null);
  const [textErr, setTextErr] = useState<string | null>(null);
  const [textBusy, setTextBusy] = useState(false);
  const previewKind: ResourcePreviewKind = getResourcePreviewKind(initial.mime_type, initial.file_name);
  const displayFont = titleFontClassName ?? 'font-authSerif';

  const updatedLabel = useMemo(() => {
    try {
      return new Date(initial.updated_at).toLocaleDateString('en-GB', { timeZone: 'UTC', 
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return initial.updated_at;
    }
  }, [initial.updated_at]);

  const monthTag = useMemo(() => {
    try {
      return new Date(initial.updated_at).toLocaleDateString('en-GB', { timeZone: 'UTC',  month: 'long', year: 'numeric' });
    } catch {
      return null;
    }
  }, [initial.updated_at]);

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

  const hasPreview = Boolean(previewUrl && previewKind);
  const noPreviewButFile = Boolean(previewUrl && !previewKind);
  const isArchived = archiveSupported && archivedAt != null;

  const setArchiveState = useCallback(
    async (next: string | null) => {
      if (!canManage || !archiveSupported) return;
      setManageErr(null);
      setManageBusy(true);
      try {
        const now = new Date().toISOString();
        const { error } = await supabase
          .from('staff_resources')
          .update({
            archived_at: next,
            updated_at: now,
          })
          .eq('id', initial.id);
        if (error) throw error;
        setArchivedAt(next);
        router.refresh();
      } catch (e) {
        setManageErr(e instanceof Error ? e.message : 'Could not update resource.');
      } finally {
        setManageBusy(false);
      }
    },
    [archiveSupported, canManage, initial.id, router, supabase],
  );

  const deleteForever = useCallback(async () => {
    if (!canManage) return;
    if (
      !window.confirm(
        `Permanently delete “${initial.title}”? The file will be removed from storage and cannot be recovered.`,
      )
    ) {
      return;
    }
    setManageErr(null);
    setManageBusy(true);
    try {
      const { error: rowErr } = await supabase.from('staff_resources').delete().eq('id', initial.id);
      if (rowErr) throw rowErr;
      const { error: stErr } = await supabase.storage.from('staff-resources').remove([initial.storage_path]);
      if (stErr) {
        console.warn('staff-resources storage remove:', stErr.message);
      }
      router.push('/resources');
      router.refresh();
    } catch (e) {
      setManageErr(e instanceof Error ? e.message : 'Could not delete resource.');
    } finally {
      setManageBusy(false);
    }
  }, [canManage, initial.id, initial.storage_path, initial.title, router, supabase]);

  return (
    <div className="resource-detail-redesign mx-auto max-w-[1100px] px-5 py-8 sm:px-[28px]">
      <nav className="mb-6 flex flex-wrap items-center gap-2 text-[13px] text-[var(--org-brand-muted)]">
        <Link href="/resources" className="transition hover:text-[var(--org-brand-text)]">
          Resource library
        </Link>
        <span className="text-[10px] opacity-50" aria-hidden>
          ›
        </span>
        {initial.folder ? (
          <>
            <Link
              href={`/resources?folder=${initial.folder.id}`}
              className="transition hover:text-[var(--org-brand-text)]"
            >
              {initial.folder.name}
            </Link>
            <span className="text-[10px] opacity-50" aria-hidden>
              ›
            </span>
          </>
        ) : null}
        <span className="text-[var(--org-brand-text)]">{initial.title}</span>
      </nav>

      {manageErr ? <p className="status-banner-error mb-4 rounded-lg px-3 py-2 text-[13px]">{manageErr}</p> : null}

      {isArchived ? (
        <div className="mb-4 rounded-xl border border-[var(--org-brand-border)] bg-[var(--org-brand-surface)] px-4 py-3 text-[13px] text-[var(--org-brand-text)]">
          <strong className="font-semibold">Archived</strong> — hidden from the resource library and search. Restore to
          make it visible again, or delete permanently.
        </div>
      ) : null}

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[1fr_380px]">
        <div className="overflow-hidden rounded-2xl border border-[color-mix(in_oklab,var(--org-brand-border)_90%,transparent)] bg-[var(--org-brand-bg)] shadow-[0_1px_0_color-mix(in_oklab,var(--org-brand-border)_35%,transparent)]">
          <div className="flex flex-col gap-3 border-b border-[color-mix(in_oklab,var(--org-brand-border)_90%,transparent)] px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <div className="min-w-0 flex-1">
              <h1
                className={`${displayFont} text-lg font-semibold tracking-tight text-[var(--org-brand-text)] sm:text-[18px]`}
              >
                {initial.title}
              </h1>
              <p className="mt-1 text-[12px] text-[var(--org-brand-muted)]">
                {initial.file_name} · {formatBytes(initial.byte_size)} · Updated {updatedLabel}
              </p>
              {initial.description ? (
                <p className="mt-2 text-[13px] leading-relaxed text-[var(--org-brand-muted)]">
                  {initial.description}
                </p>
              ) : null}
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              {canManage ? (
                <Link
                  href="/resources/new"
                  className="inline-flex h-9 items-center rounded-lg border border-[color-mix(in_oklab,var(--org-brand-border)_90%,transparent)] bg-transparent px-3.5 text-[13px] font-medium text-[var(--org-brand-text)] transition hover:bg-[color-mix(in_oklab,var(--org-brand-primary)_6%,var(--org-brand-bg))]"
                >
                  Upload another
                </Link>
              ) : null}
              {canManage && archiveSupported && !isArchived ? (
                <button
                  type="button"
                  disabled={manageBusy}
                  onClick={() => void setArchiveState(new Date().toISOString())}
                  className="inline-flex h-9 items-center rounded-lg border border-[color-mix(in_oklab,var(--org-brand-border)_95%,transparent)] bg-transparent px-3.5 text-[13px] font-medium text-[var(--org-brand-muted)] transition hover:bg-[color-mix(in_oklab,var(--org-brand-primary)_6%,var(--org-brand-bg))] disabled:opacity-50"
                >
                  Archive
                </button>
              ) : null}
              {canManage && archiveSupported && isArchived ? (
                <button
                  type="button"
                  disabled={manageBusy}
                  onClick={() => void setArchiveState(null)}
                  className="inline-flex h-9 items-center rounded-lg border border-[color-mix(in_oklab,var(--org-brand-border)_90%,transparent)] bg-transparent px-3.5 text-[13px] font-medium text-[var(--org-brand-text)] transition hover:bg-[color-mix(in_oklab,var(--org-brand-primary)_6%,var(--org-brand-bg))] disabled:opacity-50"
                >
                  Restore
                </button>
              ) : null}
              {canManage ? (
                <button
                  type="button"
                  disabled={manageBusy}
                  onClick={() => void deleteForever()}
                  className="inline-flex h-9 items-center rounded-lg border border-red-200 bg-[var(--org-brand-bg)] px-3.5 text-[13px] font-medium text-red-800 transition hover:bg-red-50 disabled:opacity-50"
                >
                  Delete permanently
                </button>
              ) : null}
              {downloadUrl ? (
                <a
                  href={downloadUrl}
                  className="inline-flex h-9 items-center rounded-lg bg-[var(--org-brand-primary)] px-3.5 text-[13px] font-medium text-[var(--org-brand-on-primary)] transition hover:bg-[color-mix(in_oklab,var(--org-brand-primary)_88%,black)]"
                >
                  ↓ Download
                </a>
              ) : (
                <span className="inline-flex h-9 items-center text-[13px] text-[var(--org-brand-muted)]">
                  {downloadUrlErr ? downloadUrlErr : 'Preparing file…'}
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5 border-b border-[color-mix(in_oklab,var(--org-brand-border)_90%,transparent)] px-5 py-3">
            <span className="mr-1 text-[12px] text-[var(--org-brand-muted)]">Tags</span>
            {initial.folder ? (
              <span className="rounded-full bg-[color-mix(in_oklab,var(--org-brand-primary)_14%,var(--org-brand-bg))] px-2.5 py-1 text-[11px] font-medium text-[var(--org-brand-primary)]">
                {initial.folder.name}
              </span>
            ) : null}
            <span className="rounded-full bg-[color-mix(in_oklab,var(--org-brand-primary)_10%,var(--org-brand-surface))] px-2.5 py-1 text-[11px] font-medium text-[var(--org-brand-primary)]">
              {fileKindLabel(initial.mime_type, initial.file_name)}
            </span>
            {monthTag ? (
              <span className="rounded-full bg-[color-mix(in_oklab,var(--org-brand-surface)_85%,var(--org-brand-border))] px-2.5 py-1 text-[11px] font-medium text-[var(--org-brand-muted)]">
                {monthTag}
              </span>
            ) : null}
          </div>

          {previewUrlErr && !previewUrl ? (
            <p className="px-5 py-4 text-[13px] text-red-800">Preview unavailable: {previewUrlErr}</p>
          ) : null}

          {hasPreview ? (
            <div className="resource-doc-preview">
              <div className="flex items-center justify-between border-b border-[color-mix(in_oklab,var(--org-brand-border)_90%,transparent)] bg-[var(--org-brand-surface)] px-5 py-2.5">
                <span className="text-[11px] font-medium uppercase tracking-[0.06em] text-[var(--org-brand-muted)]">
                  Preview
                </span>
              </div>
              <div className="bg-[var(--org-brand-bg)] p-4 sm:p-6">
                {previewKind === 'pdf' ? (
                  <iframe
                    title="Document preview"
                    src={previewUrl!}
                    className="h-[min(72vh,680px)] w-full rounded-lg border border-[color-mix(in_oklab,var(--org-brand-border)_80%,transparent)] bg-[color-mix(in_oklab,var(--org-brand-surface)_50%,white)]"
                  />
                ) : null}
                {previewKind === 'image' ? (
                  <img
                    src={previewUrl!}
                    alt=""
                    className="max-h-[min(72vh,680px)] w-full object-contain"
                  />
                ) : null}
                {previewKind === 'video' ? (
                  <video src={previewUrl!} controls className="max-h-[min(72vh,680px)] w-full rounded-lg" />
                ) : null}
                {previewKind === 'audio' ? (
                  <audio src={previewUrl!} controls className="w-full" />
                ) : null}
                {previewKind === 'text' ? (
                  <div className="max-h-[min(72vh,520px)] overflow-auto rounded-lg border border-[color-mix(in_oklab,var(--org-brand-border)_80%,transparent)] bg-[var(--org-brand-surface)] p-4">
                    {textBusy ? (
                      <p className="text-[13px] text-[var(--org-brand-muted)]">Loading text…</p>
                    ) : textErr ? (
                      <p className="text-[13px] text-red-800">{textErr}</p>
                    ) : textBody != null ? (
                      <pre className="whitespace-pre-wrap break-words font-mono text-[13px] text-[var(--org-brand-text)]">
                        {textBody}
                      </pre>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          ) : noPreviewButFile ? (
            <div className="px-5 py-8 text-center text-[13px] text-[var(--org-brand-muted)]">
              No inline preview for this file type. Use Download to open it.
            </div>
          ) : !previewUrl ? (
            <div className="px-5 py-8 text-[13px] text-[var(--org-brand-muted)]">Preparing preview…</div>
          ) : null}
        </div>

        <aside className="lg:sticky lg:top-4">
          {isArchived ? (
            <div className="rounded-2xl border border-[color-mix(in_oklab,var(--org-brand-border)_90%,transparent)] bg-[var(--org-brand-bg)] px-4 py-4 text-[13px] text-[var(--org-brand-muted)] shadow-[0_1px_0_color-mix(in_oklab,var(--org-brand-border)_35%,transparent)]">
              Scout is disabled while this file is archived. Restore the resource to ask questions about it.
            </div>
          ) : (
            <ResourceDocumentAssistant displayFontClassName={displayFont} resourceId={initial.id} />
          )}
        </aside>
      </div>
    </div>
  );
}
