import { runReport } from '@/lib/reports/engine';
import { getReportsViewerFromRequest } from '@/lib/reports/auth';
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

function csvEscape(value: unknown) {
  const s = value == null ? '' : String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function simplePdf(lines: string[]): string {
  const safe = lines.map((l) => l.replace(/[()\\]/g, '')).join('\n');
  const stream = `BT /F1 10 Tf 40 790 Td (${safe.replace(/\n/g, ') Tj T* (')}) Tj ET`;
  const objs = [
    '1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj',
    '2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj',
    '3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj',
    `4 0 obj << /Length ${stream.length} >> stream\n${stream}\nendstream endobj`,
    '5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj',
  ];
  let body = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (const o of objs) {
    offsets.push(body.length);
    body += `${o}\n`;
  }
  const xrefStart = body.length;
  body += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objs.length; i += 1) body += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  body += `trailer << /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return body;
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const requestStartedAt = Date.now();
  const viewer = await getReportsViewerFromRequest(req);
  if (!viewer) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (!viewer.canView) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const { id } = await params;
  const format = (new URL(req.url).searchParams.get('format') ?? 'csv').toLowerCase();
  if (format !== 'csv' && format !== 'pdf' && format !== 'xlsx') {
    return NextResponse.json({ error: 'Invalid format' }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: report } = await supabase
    .from('reports')
    .select('id, name, config')
    .eq('org_id', viewer.orgId)
    .eq('id', id)
    .maybeSingle();
  if (!report) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const result = await runReport(
    report.config,
    {
      orgId: viewer.orgId,
      userId: viewer.userId,
      departmentId: viewer.departmentId,
      orgWideDataAccess: viewer.orgWideDataAccess,
    },
    5000
  );

  const rows = result.previewRows;
  const cols = rows.length ? Object.keys(rows[0] as Record<string, unknown>) : [];
  const stamp = new Date().toISOString();

  if ((format === 'pdf' || format === 'xlsx') && result.totalRows === 0) {
    console.warn('[reports.export] blocked_empty_export', {
      reportId: id,
      orgId: viewer.orgId,
      format,
      requestDurationMs: Date.now() - requestStartedAt,
      ...result.diagnostics,
    });
    return NextResponse.json(
      {
        error: 'No rows matched your current scope and filters. This export requires at least one row.',
        noDataReason: result.diagnostics.noDataReason,
      },
      { status: 422 }
    );
  }

  const { error: exportLogError } = await supabase.from('report_exports').insert({
    org_id: viewer.orgId,
    report_id: id,
    run_id: null,
    exported_by: viewer.userId,
    format,
    row_count: result.totalRows,
  });
  if (exportLogError) {
    return NextResponse.json({ error: exportLogError.message }, { status: 400 });
  }

  console.info('[reports.export] completed', {
    reportId: id,
    orgId: viewer.orgId,
    format,
    requestDurationMs: Date.now() - requestStartedAt,
    totalRows: result.totalRows,
    ...result.diagnostics,
  });

  if (format === 'pdf') {
    const lines = [
      `Report: ${report.name}`,
      `Run at: ${stamp}`,
      `Rows: ${result.totalRows}`,
      '',
      ...rows.slice(0, 200).map((r) => cols.map((c) => `${c}: ${String((r as Record<string, unknown>)[c] ?? '')}`).join(' | ')),
    ];
    return new NextResponse(simplePdf(lines), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="report-${id}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  }

  if (format === 'xlsx') {
    const sheetRows = rows.length ? (rows as Record<string, unknown>[]) : [{}];
    const ws = XLSX.utils.json_to_sheet(sheetRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Report');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="report-${id}.xlsx"`,
        'Cache-Control': 'no-store',
      },
    });
  }

  const csv = [
    result.totalRows === 0 ? '# no rows matched current scope and filters' : '',
    cols.join(','),
    ...rows.map((r) => cols.map((c) => csvEscape((r as Record<string, unknown>)[c])).join(',')),
  ]
    .filter(Boolean)
    .join('\n');
  return new NextResponse(`${csv}\n`, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="report-${id}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
