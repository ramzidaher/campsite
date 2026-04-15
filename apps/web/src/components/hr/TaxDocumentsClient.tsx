'use client';

import { createClient } from '@/lib/supabase/client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

type TaxDoc = {
  id: string;
  document_type: 'p45' | 'p60';
  tax_year: string | null;
  issue_date: string | null;
  payroll_period_end: string | null;
  status: 'draft' | 'final' | 'issued';
  finance_reference: string | null;
  wagesheet_id: string | null;
  payroll_run_reference: string | null;
  bucket_id: string;
  storage_path: string;
  file_name: string;
  byte_size: number;
  is_current: boolean;
  created_at: string;
};

type PermissionSet = {
  viewAll: boolean;
  manageAll: boolean;
  viewOwn: boolean;
  uploadOwn: boolean;
  canExport: boolean;
};

const DOC_MAX_BYTES = 20 * 1024 * 1024;
const TAX_DOC_BUCKET = 'employee-tax-documents';

function safeFileSegment(name: string): string {
  const base = name.replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '');
  return base.slice(0, 180) || 'file';
}

function formatFileSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function TaxDocumentsClient({
  title = 'P45 / P60 documents',
  description,
  orgId,
  subjectUserId,
  actorUserId,
  initialDocs,
  permissions,
}: {
  title?: string;
  description?: string;
  orgId: string;
  subjectUserId: string;
  actorUserId: string;
  initialDocs: TaxDoc[];
  permissions: PermissionSet;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [docs, setDocs] = useState<TaxDoc[]>(initialDocs);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [documentType, setDocumentType] = useState<'p45' | 'p60'>('p60');
  const [taxYear, setTaxYear] = useState('');
  const [issueDate, setIssueDate] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [docStatus, setDocStatus] = useState<'draft' | 'final' | 'issued'>('issued');
  const [financeReference, setFinanceReference] = useState('');
  const [wagesheetId, setWagesheetId] = useState('');
  const [payrollRunReference, setPayrollRunReference] = useState('');

  const canManage = permissions.manageAll || permissions.uploadOwn;

  async function upload(file: File) {
    if (!canManage) return;
    if (file.size > DOC_MAX_BYTES) {
      setMsg({ type: 'error', text: 'File must be 20 MB or smaller.' });
      return;
    }
    const mime = (file.type || '').toLowerCase().split(';')[0]?.trim() ?? '';
    if (!(mime === 'application/pdf' || mime.startsWith('image/'))) {
      setMsg({ type: 'error', text: 'Use PDF or image files for P45/P60.' });
      return;
    }

    setBusy(true);
    setMsg(null);
    const id = crypto.randomUUID();
    const path = `${orgId}/${id}/${safeFileSegment(file.name)}`;
    const { error: upErr } = await supabase.storage.from(TAX_DOC_BUCKET).upload(path, file, {
      upsert: false,
      cacheControl: '3600',
      contentType: file.type || 'application/octet-stream',
    });
    if (upErr) {
      setBusy(false);
      setMsg({ type: 'error', text: upErr.message });
      return;
    }

    const { error: insErr } = await supabase.from('employee_tax_documents').insert({
      id,
      org_id: orgId,
      user_id: subjectUserId,
      document_type: documentType,
      tax_year: taxYear.trim() || null,
      issue_date: issueDate || null,
      payroll_period_end: periodEnd || null,
      status: docStatus,
      finance_reference: financeReference.trim() || null,
      wagesheet_id: wagesheetId.trim() || null,
      payroll_run_reference: payrollRunReference.trim() || null,
      bucket_id: TAX_DOC_BUCKET,
      storage_path: path,
      file_name: file.name,
      mime_type: file.type || 'application/octet-stream',
      byte_size: file.size,
      uploaded_by: actorUserId,
      is_current: true,
    });
    if (insErr) {
      await supabase.storage.from(TAX_DOC_BUCKET).remove([path]);
      setBusy(false);
      setMsg({ type: 'error', text: insErr.message });
      return;
    }

    await supabase
      .from('employee_tax_documents')
      .update({ is_current: false, replaced_by_document_id: id })
      .eq('org_id', orgId)
      .eq('user_id', subjectUserId)
      .eq('document_type', documentType)
      .neq('id', id)
      .eq('is_current', true);

    setTaxYear('');
    setIssueDate('');
    setPeriodEnd('');
    setDocStatus('issued');
    setFinanceReference('');
    setWagesheetId('');
    setPayrollRunReference('');
    setBusy(false);
    setMsg({ type: 'success', text: 'Tax document uploaded.' });
    router.refresh();
  }

  async function openDoc(d: TaxDoc) {
    const { data, error } = await supabase.storage
      .from(d.bucket_id || TAX_DOC_BUCKET)
      .createSignedUrl(d.storage_path, 3600);
    if (error || !data?.signedUrl) {
      setMsg({ type: 'error', text: error?.message ?? 'Could not open file.' });
      return;
    }
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
  }

  async function removeDoc(d: TaxDoc) {
    if (!canManage) return;
    if (!window.confirm(`Remove ${d.document_type.toUpperCase()} document "${d.file_name}"?`)) return;
    setBusy(true);
    setMsg(null);
    const bucket = d.bucket_id || TAX_DOC_BUCKET;
    const { error: rmErr } = await supabase.storage.from(bucket).remove([d.storage_path]);
    if (rmErr) {
      setBusy(false);
      setMsg({ type: 'error', text: rmErr.message });
      return;
    }
    const { error: delErr } = await supabase.from('employee_tax_documents').delete().eq('id', d.id);
    if (delErr) {
      setBusy(false);
      setMsg({ type: 'error', text: delErr.message });
      return;
    }
    setDocs((prev) => prev.filter((x) => x.id !== d.id));
    setBusy(false);
    setMsg({ type: 'success', text: 'Tax document removed.' });
    router.refresh();
  }

  return (
    <section className="mt-6 rounded-xl border border-[#d8d8d8] bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold text-[#121212]">{title}</h2>
          <p className="mt-1 text-[12px] text-[#9b9b9b]">
            {description ?? 'Secure payroll tax docs with finance linkage metadata and private storage.'}
          </p>
        </div>
        {permissions.canExport ? (
          <a
            href={`/api/payroll/tax-documents/export?userId=${encodeURIComponent(subjectUserId)}`}
            className="rounded-lg border border-[#d8d8d8] bg-white px-3 py-1.5 text-[12.5px] text-[#121212] hover:bg-[#fafafa]"
          >
            Export index
          </a>
        ) : null}
      </div>

      {msg ? (
        <p className={['mt-3 rounded-lg px-3 py-2 text-[13px]', msg.type === 'error'
          ? 'border border-[#fecaca] bg-[#fef2f2] text-[#b91c1c]'
          : 'border border-[#86efac] bg-[#f0fdf4] text-[#166534]'].join(' ')}>
          {msg.text}
        </p>
      ) : null}

      {canManage ? (
        <div className="mt-4 rounded-lg border border-[#ececec] bg-[#faf9f6] p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-[12.5px] font-medium text-[#6b6b6b]">
              Document type
              <select value={documentType} onChange={(e) => setDocumentType(e.target.value as 'p45' | 'p60')} className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px]">
                <option value="p45">P45</option>
                <option value="p60">P60</option>
              </select>
            </label>
            <label className="text-[12.5px] font-medium text-[#6b6b6b]">
              Tax year
              <input value={taxYear} onChange={(e) => setTaxYear(e.target.value)} placeholder="e.g. 2025/26" className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px]" />
            </label>
            <label className="text-[12.5px] font-medium text-[#6b6b6b]">
              Issue date
              <input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px]" />
            </label>
            <label className="text-[12.5px] font-medium text-[#6b6b6b]">
              Payroll period end
              <input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px]" />
            </label>
            <label className="text-[12.5px] font-medium text-[#6b6b6b]">
              Status
              <select value={docStatus} onChange={(e) => setDocStatus(e.target.value as 'draft' | 'final' | 'issued')} className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px]">
                <option value="draft">Draft</option>
                <option value="final">Final</option>
                <option value="issued">Issued</option>
              </select>
            </label>
            <label className="text-[12.5px] font-medium text-[#6b6b6b]">
              Finance reference
              <input value={financeReference} onChange={(e) => setFinanceReference(e.target.value)} className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px]" />
            </label>
            <label className="text-[12.5px] font-medium text-[#6b6b6b]">
              Wagesheet ID
              <input value={wagesheetId} onChange={(e) => setWagesheetId(e.target.value)} className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px]" />
            </label>
            <label className="text-[12.5px] font-medium text-[#6b6b6b]">
              Payroll run reference
              <input value={payrollRunReference} onChange={(e) => setPayrollRunReference(e.target.value)} className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px]" />
            </label>
          </div>
          <div className="mt-3">
            <label className="inline-flex cursor-pointer items-center rounded-lg bg-[#121212] px-4 py-2 text-[13px] font-medium text-[#faf9f6]">
              <input
                type="file"
                className="sr-only"
                disabled={busy}
                accept=".pdf,image/*"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (f) void upload(f);
                }}
              />
              {busy ? 'Uploading…' : 'Upload document'}
            </label>
          </div>
        </div>
      ) : null}

      {docs.length === 0 ? (
        <p className="mt-4 text-[13px] text-[#9b9b9b]">No P45/P60 documents uploaded yet.</p>
      ) : (
        <ul className="mt-4 divide-y divide-[#ececec] rounded-lg border border-[#ececec]">
          {docs.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-3 text-[13px]">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-[#121212]">
                  {d.document_type.toUpperCase()} {d.tax_year ? `· ${d.tax_year}` : ''}
                  {!d.is_current ? <span className="ml-1 rounded bg-[#f3f3f3] px-1.5 py-0.5 text-[10.5px] text-[#6b6b6b]">Superseded</span> : null}
                </p>
                <p className="mt-0.5 truncate text-[12px] text-[#6b6b6b]">{d.file_name} · {formatFileSize(d.byte_size)}</p>
                <p className="mt-0.5 text-[11px] text-[#9b9b9b]">
                  {d.status}{d.issue_date ? ` · Issued ${d.issue_date}` : ''}{d.finance_reference ? ` · Ref ${d.finance_reference}` : ''}
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <button type="button" onClick={() => void openDoc(d)} className="rounded-lg border border-[#d8d8d8] bg-white px-3 py-1.5 text-[12.5px] font-medium text-[#121212] hover:bg-[#fafafa]">Open</button>
                {canManage ? (
                  <button type="button" disabled={busy} onClick={() => void removeDoc(d)} className="rounded-lg border border-[#fecaca] bg-white px-3 py-1.5 text-[12.5px] text-[#991b1b] hover:bg-[#fef2f2] disabled:opacity-50">Remove</button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
