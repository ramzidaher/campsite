'use client';

import { AlertCircle, Download, FileText, Pencil } from 'lucide-react';
import Link from 'next/link';

const rowNeutral =
  'flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-[13px] font-medium text-[#121212] transition hover:bg-[#faf9f6] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--org-brand-primary,#0f6e56)] focus-visible:ring-offset-1';

type Props = {
  subjectUserId: string;
  /** Show edit / create row (caller passes `canManage && !editing`). */
  showEdit: boolean;
  onEdit: () => void;
  editLabel: string;
  canExportCsv: boolean;
  canExportPdf: boolean;
  /** Sensitive CSV  same gate as page: `include_sensitive` + CSV permission. */
  canExportSensitive: boolean;
  className?: string;
};

function csvHref(userId: string) {
  return `/api/hr/records/export?userId=${encodeURIComponent(userId)}&format=csv`;
}

function pdfHref(userId: string) {
  return `/api/hr/records/export?userId=${encodeURIComponent(userId)}&format=pdf`;
}

export function EmployeeRecordHeroActionMenu({
  subjectUserId,
  showEdit,
  onEdit,
  editLabel,
  canExportCsv,
  canExportPdf,
  canExportSensitive,
  className = '',
}: Props) {
  const hasExports = canExportCsv || canExportPdf || canExportSensitive;
  if (!showEdit && !hasExports) return null;

  const hasStandardExports = canExportCsv || canExportPdf;
  /** Separator after Edit when CSV/PDF follow (not when only sensitive follows  that uses the divider before sensitive). */
  const showDividerAfterEdit = showEdit && hasStandardExports;
  const showDividerBeforeSensitive =
    canExportSensitive && (showEdit || hasStandardExports);

  function onSensitiveExport() {
    const reason = window.prompt('Enter a reason for sensitive export (required):', '')?.trim() ?? '';
    if (!reason) return;
    const url = `/api/hr/records/export?userId=${encodeURIComponent(subjectUserId)}&format=csv&includeSensitive=1&reason=${encodeURIComponent(reason)}`;
    window.location.assign(url);
  }

  return (
    <div
      className={[
        'w-full min-w-[12rem] overflow-hidden rounded-lg border border-[#e8e8e8] bg-white shadow-sm sm:max-w-[16rem]',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {showEdit ? (
        <button type="button" onClick={onEdit} className={rowNeutral}>
          <Pencil className="h-4 w-4 shrink-0 text-[#6b6b6b]" aria-hidden />
          {editLabel}
        </button>
      ) : null}
      {showDividerAfterEdit ? <div className="border-t border-[#f0f0f0]" role="separator" /> : null}
      {canExportCsv ? (
        <Link href={csvHref(subjectUserId)} className={rowNeutral} prefetch={false}>
          <Download className="h-4 w-4 shrink-0 text-[#6b6b6b]" aria-hidden />
          Export CSV
        </Link>
      ) : null}
      {canExportPdf ? (
        <Link href={pdfHref(subjectUserId)} className={rowNeutral} prefetch={false}>
          <FileText className="h-4 w-4 shrink-0 text-[#6b6b6b]" aria-hidden />
          Export PDF
        </Link>
      ) : null}
      {showDividerBeforeSensitive ? <div className="border-t border-[#f0f0f0]" role="separator" /> : null}
      {canExportSensitive ? (
        <button
          type="button"
          onClick={onSensitiveExport}
          className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-[13px] font-medium text-[#991b1b] transition hover:bg-[#fef2f2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300 focus-visible:ring-offset-1"
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-red-100" aria-hidden>
            <AlertCircle className="h-3.5 w-3.5 text-red-600" strokeWidth={2.25} />
          </span>
          <span className="min-w-0 flex-1">Export CSV</span>
          <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold lowercase tracking-wide text-red-800">
            sensitive
          </span>
        </button>
      ) : null}
    </div>
  );
}
