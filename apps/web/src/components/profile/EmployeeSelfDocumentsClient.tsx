'use client';

import { createClient } from '@/lib/supabase/client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

type SelfDoc = {
  id: string;
  category: string;
  document_kind: string;
  bucket_id: string;
  label: string;
  storage_path: string;
  file_name: string;
  byte_size: number;
  created_at: string;
  id_document_type: string | null;
  id_number_last4: string | null;
  expires_on: string | null;
  is_current: boolean;
};

const DOC_MAX_BYTES = 20 * 1024 * 1024;
const PHOTO_BUCKET = 'employee-photos';
const ID_BUCKET = 'employee-id-documents';

function safeFileSegment(name: string): string {
  const base = name.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '');
  return base.slice(0, 180) || 'file';
}

function formatFileSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function EmployeeSelfDocumentsClient({
  orgId,
  userId,
  docs,
  canViewPhoto,
  canUploadPhoto,
  canDeletePhoto,
  canViewId,
  canUploadId,
  canDeleteId,
}: {
  orgId: string;
  userId: string;
  docs: SelfDoc[];
  canViewPhoto: boolean;
  canUploadPhoto: boolean;
  canDeletePhoto: boolean;
  canViewId: boolean;
  canUploadId: boolean;
  canDeleteId: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [idType, setIdType] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [idExpiry, setIdExpiry] = useState('');

  async function uploadPhoto(file: File) {
    if (!canUploadPhoto) return;
    if (!file.type.startsWith('image/')) {
      setMsg('Photo upload requires an image file.');
      return;
    }
    if (file.size > DOC_MAX_BYTES) {
      setMsg('File must be 20 MB or smaller.');
      return;
    }
    setBusy(true);
    setMsg(null);
    const id = crypto.randomUUID();
    const path = `${orgId}/${id}/${safeFileSegment(file.name)}`;
    const { error: upErr } = await supabase.storage.from(PHOTO_BUCKET).upload(path, file, {
      upsert: false,
      contentType: file.type || 'application/octet-stream',
      cacheControl: '3600',
    });
    if (upErr) {
      setBusy(false);
      setMsg(upErr.message);
      return;
    }
    const { error: insErr } = await supabase.from('employee_hr_documents').insert({
      id,
      org_id: orgId,
      user_id: userId,
      category: 'employee_photo',
      document_kind: 'employee_photo',
      bucket_id: PHOTO_BUCKET,
      label: 'Employee photo',
      storage_path: path,
      file_name: file.name,
      mime_type: file.type || 'application/octet-stream',
      byte_size: file.size,
      uploaded_by: userId,
    });
    if (insErr) {
      await supabase.storage.from(PHOTO_BUCKET).remove([path]);
      setBusy(false);
      setMsg(insErr.message);
      return;
    }
    await supabase
      .from('employee_hr_documents')
      .update({ is_current: false, replaced_by_document_id: id })
      .eq('org_id', orgId)
      .eq('user_id', userId)
      .eq('document_kind', 'employee_photo')
      .neq('id', id)
      .eq('is_current', true);
    setBusy(false);
    router.refresh();
  }

  async function uploadId(file: File) {
    if (!canUploadId) return;
    const mime = (file.type || '').toLowerCase().split(';')[0]?.trim() ?? '';
    if (!(mime === 'application/pdf' || mime.startsWith('image/'))) {
      setMsg('ID uploads must be PDF or image files.');
      return;
    }
    if (file.size > DOC_MAX_BYTES) {
      setMsg('File must be 20 MB or smaller.');
      return;
    }
    const idLast4 = idNumber.replace(/\D+/g, '').slice(-4);
    if (idNumber.trim() && idLast4.length < 4) {
      setMsg('ID number must include at least 4 digits.');
      return;
    }
    setBusy(true);
    setMsg(null);
    const id = crypto.randomUUID();
    const path = `${orgId}/${id}/${safeFileSegment(file.name)}`;
    const { error: upErr } = await supabase.storage.from(ID_BUCKET).upload(path, file, {
      upsert: false,
      contentType: file.type || 'application/octet-stream',
      cacheControl: '3600',
    });
    if (upErr) {
      setBusy(false);
      setMsg(upErr.message);
      return;
    }
    const { error: insErr } = await supabase.from('employee_hr_documents').insert({
      id,
      org_id: orgId,
      user_id: userId,
      category: 'id_document',
      document_kind: 'id_document',
      bucket_id: ID_BUCKET,
      label: 'Identity document',
      storage_path: path,
      file_name: file.name,
      mime_type: file.type || 'application/octet-stream',
      byte_size: file.size,
      uploaded_by: userId,
      id_document_type: idType.trim() || null,
      id_number_last4: idLast4 || null,
      expires_on: idExpiry || null,
    });
    if (insErr) {
      await supabase.storage.from(ID_BUCKET).remove([path]);
      setBusy(false);
      setMsg(insErr.message);
      return;
    }
    await supabase
      .from('employee_hr_documents')
      .update({ is_current: false, replaced_by_document_id: id })
      .eq('org_id', orgId)
      .eq('user_id', userId)
      .eq('document_kind', 'id_document')
      .neq('id', id)
      .eq('is_current', true);
    setIdType('');
    setIdNumber('');
    setIdExpiry('');
    setBusy(false);
    router.refresh();
  }

  async function openDoc(d: SelfDoc) {
    const { data, error } = await supabase.storage
      .from(d.bucket_id || (d.document_kind === 'employee_photo' ? PHOTO_BUCKET : ID_BUCKET))
      .createSignedUrl(d.storage_path, 3600);
    if (error || !data?.signedUrl) {
      setMsg(error?.message ?? 'Could not open file.');
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  }

  async function removeDoc(d: SelfDoc) {
    const canDelete =
      (d.document_kind === 'employee_photo' && canDeletePhoto) ||
      (d.document_kind === 'id_document' && canDeleteId);
    if (!canDelete) return;
    setBusy(true);
    setMsg(null);
    const bucket = d.bucket_id || (d.document_kind === 'employee_photo' ? PHOTO_BUCKET : ID_BUCKET);
    const { error: rmErr } = await supabase.storage.from(bucket).remove([d.storage_path]);
    if (rmErr) {
      setBusy(false);
      setMsg(rmErr.message);
      return;
    }
    const { error: delErr } = await supabase.from('employee_hr_documents').delete().eq('id', d.id);
    if (delErr) {
      setBusy(false);
      setMsg(delErr.message);
      return;
    }
    setBusy(false);
    router.refresh();
  }

  const photoDocs = docs.filter((d) => d.document_kind === 'employee_photo');
  const idDocs = docs.filter((d) => d.document_kind === 'id_document');

  return (
    <div className="mt-3 rounded-xl border border-[#e8e8e8] bg-white p-5 text-[13px]">
      {msg ? <p className="mb-3 text-[#b91c1c]">{msg}</p> : null}
      <h3 className="text-[14px] font-semibold text-[#121212]">Employee photo</h3>
      {canUploadPhoto ? (
        <label className="mt-2 inline-flex cursor-pointer rounded-lg bg-[#121212] px-3 py-1.5 text-[12px] font-medium text-[#faf9f6]">
          <input type="file" className="sr-only" accept="image/*" disabled={busy} onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = '';
            if (f) void uploadPhoto(f);
          }} />
          {busy ? 'Uploading…' : 'Upload / replace photo'}
        </label>
      ) : null}
      {canViewPhoto && photoDocs.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {photoDocs.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-2">
              <span className="text-[#6b6b6b]">{d.file_name} · {formatFileSize(d.byte_size)}{!d.is_current ? ' · Superseded' : ''}</span>
              <div className="flex gap-2">
                <button type="button" className="underline" onClick={() => void openDoc(d)}>Open</button>
                {(canDeletePhoto) ? <button type="button" className="text-[#991b1b]" onClick={() => void removeDoc(d)}>Delete</button> : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      <h3 className="mt-5 text-[14px] font-semibold text-[#121212]">ID documents</h3>
      {canUploadId ? (
        <div className="mt-2 flex flex-wrap items-end gap-2">
          <input value={idType} onChange={(e) => setIdType(e.target.value)} placeholder="ID type" className="rounded border border-[#d8d8d8] px-2 py-1.5" />
          <input value={idNumber} onChange={(e) => setIdNumber(e.target.value)} placeholder="ID number (masked to last 4)" className="rounded border border-[#d8d8d8] px-2 py-1.5" />
          <input type="date" value={idExpiry} onChange={(e) => setIdExpiry(e.target.value)} className="rounded border border-[#d8d8d8] px-2 py-1.5" />
          <label className="inline-flex cursor-pointer rounded-lg bg-[#121212] px-3 py-1.5 text-[12px] font-medium text-[#faf9f6]">
            <input type="file" className="sr-only" disabled={busy} accept=".pdf,image/*" onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (f) void uploadId(f);
            }} />
            {busy ? 'Uploading…' : 'Upload ID'}
          </label>
        </div>
      ) : null}
      {canViewId && idDocs.length > 0 ? (
        <ul className="mt-2 space-y-1">
          {idDocs.map((d) => (
            <li key={d.id} className="flex items-center justify-between gap-2">
              <span className="text-[#6b6b6b]">
                {d.file_name} · {formatFileSize(d.byte_size)}
                {d.id_document_type ? ` · ${d.id_document_type}` : ''}
                {d.id_number_last4 ? ` · ****${d.id_number_last4}` : ''}
                {d.expires_on ? ` · Expires ${d.expires_on}` : ''}
                {!d.is_current ? ' · Superseded' : ''}
              </span>
              <div className="flex gap-2">
                <button type="button" className="underline" onClick={() => void openDoc(d)}>Open</button>
                {(canDeleteId) ? <button type="button" className="text-[#991b1b]" onClick={() => void removeDoc(d)}>Delete</button> : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
