'use client';

import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

const MAX_BYTES = 20 * 1024 * 1024;

function safeFileSegment(name: string): string {
  const base = name.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '');
  return base.slice(0, 180) || 'file';
}

export function ResourceNewClient({
  orgId,
  userId,
}: {
  orgId: string;
  userId: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

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
    if (file.size > MAX_BYTES) {
      setErr('File must be 20 MB or smaller.');
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
      <Link href="/resources" className="text-[13px] text-[#6b6b6b] hover:text-[#121212]">
        ← Resource library
      </Link>
      <h1 className="mt-4 font-authSerif text-2xl text-[#121212]">Upload resource</h1>
      <p className="mt-1 text-[13px] text-[#6b6b6b]">PDF, text, or common office formats (max 20 MB).</p>

      <form onSubmit={onSubmit} className="mt-6 space-y-4">
        <div>
          <label className="mb-1 block text-[12px] font-medium text-[#121212]">Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="h-10 w-full rounded-lg border border-[#d8d8d8] bg-white px-3 text-[13px] outline-none focus:border-[#121212] focus:ring-[3px] focus:ring-[#121212]/10"
            required
          />
        </div>
        <div>
          <label className="mb-1 block text-[12px] font-medium text-[#121212]">Description (optional)</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px] outline-none focus:border-[#121212] focus:ring-[3px] focus:ring-[#121212]/10"
          />
        </div>
        <div>
          <label className="mb-1 block text-[12px] font-medium text-[#121212]">File</label>
          <input
            type="file"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-[13px] text-[#121212] file:mr-3 file:rounded-lg file:border file:border-[#d8d8d8] file:bg-[#f5f4f1] file:px-3 file:py-1.5 file:text-[12px]"
          />
        </div>
        {err ? <p className="text-[13px] text-red-700">{err}</p> : null}
        <div className="flex gap-2 pt-2">
          <button
            type="submit"
            disabled={busy}
            className="inline-flex h-10 items-center rounded-lg bg-[#121212] px-4 text-[13px] font-medium text-[#faf9f6] disabled:opacity-60"
          >
            {busy ? 'Uploading…' : 'Upload'}
          </button>
          <Link
            href="/resources"
            className="inline-flex h-10 items-center rounded-lg border border-[#d8d8d8] px-4 text-[13px] text-[#121212]"
          >
            Cancel
          </Link>
        </div>
      </form>
    </div>
  );
}
