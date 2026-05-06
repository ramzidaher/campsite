'use client';

import { FormSelect } from '@campsite/ui/web';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';

const MAX_BYTES = 20 * 1024 * 1024;

/** Extensions we allow for staff resource uploads (validated client-side; must stay in sync with product copy). */
const ALLOWED_EXTENSIONS = new Set([
  '.pdf',
  '.txt',
  '.md',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
]);

const ACCEPT_ATTR =
  '.pdf,.txt,.md,.doc,.docx,.xls,.xlsx,.ppt,.pptx,application/pdf,text/plain,text/markdown,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation';

function fileExtension(name: string): string {
  const i = name.lastIndexOf('.');
  if (i < 0) return '';
  return name.slice(i).toLowerCase();
}

function validatePickedFile(f: File): string | null {
  if (f.size > MAX_BYTES) {
    return `File must be ${Math.floor(MAX_BYTES / (1024 * 1024))} MB or smaller.`;
  }
  const ext = fileExtension(f.name);
  if (!ext || !ALLOWED_EXTENSIONS.has(ext)) {
    return 'Use PDF, plain text, Markdown, Word, Excel, or PowerPoint files only.';
  }
  return null;
}

function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function safeFileSegment(name: string): string {
  const base = name.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '');
  return base.slice(0, 180) || 'file';
}

type FolderOpt = { id: string; name: string };

export function ResourceNewClient({
  orgId,
  userId,
  defaultFolder,
}: {
  orgId: string;
  userId: string;
  /** From `?folder=`  UUID, `none`, or no selection */
  defaultFolder: string | null | 'none';
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const fileInputId = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [fileFieldError, setFileFieldError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragDepthRef = useRef(0);
  const [folders, setFolders] = useState<FolderOpt[]>([]);
  const [folderId, setFolderId] = useState<string | null>(() =>
    defaultFolder && defaultFolder !== 'none' ? defaultFolder : null,
  );
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const applyPickedFile = useCallback((next: File | null) => {
    setFileFieldError(null);
    if (!next) {
      setFile(null);
      return;
    }
    const msg = validatePickedFile(next);
    if (msg) {
      setFile(null);
      setFileFieldError(msg);
      return;
    }
    setFile(next);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .from('staff_resource_folders')
        .select('id, name')
        .eq('org_id', orgId)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true });
      if (cancelled) return;
      if (!error && data) setFolders(data as FolderOpt[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, orgId]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    const t = title.trim();
    if (!t) {
      setErr('Please enter a title.');
      return;
    }
    if (!file) {
      setErr('Please choose a file.');
      return;
    }
    const fileErr = validatePickedFile(file);
    if (fileErr) {
      setErr(fileErr);
      return;
    }

    setBusy(true);
    try {
      const resourceId = crypto.randomUUID();
      const safeName = safeFileSegment(file.name);
      const path = `${orgId}/${resourceId}/${safeName}`;

      const { error: upErr } = await supabase.storage.from('staff-resources').upload(path, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type || 'application/octet-stream',
      });
      if (upErr) {
        setErr(upErr.message);
        setBusy(false);
        return;
      }

      const { error: insErr } = await supabase.from('staff_resources').insert({
        id: resourceId,
        org_id: orgId,
        title: t,
        description: description.trim(),
        storage_path: path,
        file_name: file.name,
        mime_type: file.type || 'application/octet-stream',
        byte_size: file.size,
        created_by: userId,
        folder_id: folderId,
      });
      if (insErr) {
        setErr(insErr.message);
        await supabase.storage.from('staff-resources').remove([path]);
        setBusy(false);
        return;
      }

      router.push(`/resources/${resourceId}`);
      router.refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Upload failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg px-7 py-8">
      <h1 className="font-authSerif text-2xl text-[var(--org-brand-text)]">Upload resource</h1>
      <p className="mt-1 text-[13px] text-[var(--org-brand-muted)]">
        PDF, plain text, Markdown, Word, Excel, or PowerPoint  max {Math.floor(MAX_BYTES / (1024 * 1024))} MB.
      </p>

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <div>
          <label className="mb-1 block text-[12px] font-medium text-[var(--org-brand-text)]">Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="h-10 w-full rounded-lg border border-[var(--org-brand-border)] bg-[var(--org-brand-bg)] px-3 text-[13px] text-[var(--org-brand-text)] outline-none focus:border-[var(--org-brand-primary)] focus:ring-[3px] focus:ring-[color-mix(in_oklab,var(--org-brand-primary)_15%,transparent)]"
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-[12px] font-medium text-[var(--org-brand-text)]">Folder (optional)</label>
          <FormSelect
            value={folderId ?? ''}
            onChange={(e) => setFolderId(e.target.value || null)}
            className="h-10 w-full rounded-lg border border-[var(--org-brand-border)] bg-[var(--org-brand-bg)] px-3 text-[13px] text-[var(--org-brand-text)] outline-none focus:border-[var(--org-brand-primary)] focus:ring-[3px] focus:ring-[color-mix(in_oklab,var(--org-brand-primary)_15%,transparent)]"
          >
            <option value="">No folder</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </FormSelect>
        </div>
        <div>
          <label className="mb-1 block text-[12px] font-medium text-[var(--org-brand-text)]">
            Description (optional)
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-[var(--org-brand-border)] bg-[var(--org-brand-bg)] px-3 py-2 text-[13px] text-[var(--org-brand-text)] outline-none focus:border-[var(--org-brand-primary)] focus:ring-[3px] focus:ring-[color-mix(in_oklab,var(--org-brand-primary)_15%,transparent)]"
          />
        </div>
        <div>
          <span className="mb-1 block text-[12px] font-medium text-[var(--org-brand-text)]">File</span>
          <p className="mb-2 text-[11px] text-[var(--org-brand-muted)]">
            Drag and drop here, or browse. Allowed: {Array.from(ALLOWED_EXTENSIONS).sort().join(', ')}.
          </p>
          <input
            ref={fileInputRef}
            id={fileInputId}
            type="file"
            accept={ACCEPT_ATTR}
            className="sr-only"
            tabIndex={-1}
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              e.target.value = '';
              applyPickedFile(f);
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            onDragEnter={(e) => {
              e.preventDefault();
              e.stopPropagation();
              dragDepthRef.current += 1;
              setIsDragging(true);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              e.dataTransfer.dropEffect = 'copy';
              setIsDragging(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              e.stopPropagation();
              dragDepthRef.current -= 1;
              if (dragDepthRef.current <= 0) {
                dragDepthRef.current = 0;
                setIsDragging(false);
              }
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              dragDepthRef.current = 0;
              setIsDragging(false);
              const dropped = e.dataTransfer.files?.[0] ?? null;
              applyPickedFile(dropped);
            }}
            aria-labelledby={`${fileInputId}-label`}
            className={`relative w-full rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors ${
              isDragging
                ? 'border-[var(--org-brand-primary)] bg-[color-mix(in_oklab,var(--org-brand-primary)_10%,var(--org-brand-bg))]'
                : 'border-[var(--org-brand-border)] bg-[var(--org-brand-bg)] hover:border-[color-mix(in_oklab,var(--org-brand-primary)_45%,var(--org-brand-border))]'
            }`}
          >
            <span
              id={`${fileInputId}-label`}
              className="pointer-events-none block text-[13px] text-[var(--org-brand-text)]"
            >
              {file ? (
                <>
                  <span className="font-medium">{file.name}</span>
                  <span className="mt-1 block text-[12px] text-[var(--org-brand-muted)]">
                    {formatFileSize(file.size)}
                  </span>
                </>
              ) : (
                <>
                  Drop a file here or{' '}
                  <span className="font-medium text-[var(--org-brand-primary)] underline decoration-[color-mix(in_oklab,var(--org-brand-muted)_80%,var(--org-brand-border))] underline-offset-2">
                    choose from your device
                  </span>
                </>
              )}
            </span>
          </button>
          {file ? (
            <div className="mt-2">
              <button
                type="button"
                onClick={() => {
                  applyPickedFile(null);
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
                className="text-[12px] font-medium text-[var(--org-brand-muted)] underline underline-offset-2 hover:text-[var(--org-brand-text)]"
              >
                Remove file
              </button>
            </div>
          ) : null}
          {fileFieldError ? (
            <p className="mt-2 text-[13px] text-[var(--campsite-warning)]" role="alert">
              {fileFieldError}
            </p>
          ) : null}
        </div>
        {err ? <p className="text-[13px] text-[var(--campsite-warning)]">{err}</p> : null}
        <div className="flex gap-2 pt-2">
          <button
            type="submit"
            disabled={busy}
            className="inline-flex h-10 items-center rounded-lg bg-[var(--org-brand-primary)] px-4 text-[13px] font-medium text-[var(--org-brand-on-primary)] disabled:opacity-60"
          >
            {busy ? 'Uploading…' : 'Upload'}
          </button>
          <Link
            href="/resources"
            className="inline-flex h-10 items-center rounded-lg border border-[var(--org-brand-border)] px-4 text-[13px] text-[var(--org-brand-text)]"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
