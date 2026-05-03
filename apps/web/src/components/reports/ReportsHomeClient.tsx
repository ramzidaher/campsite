'use client';

import { FormSelect } from '@campsite/ui/web';
import { useEffect, useMemo, useState } from 'react';
import { REPORT_FIELDS } from '@/lib/reports/catalog';

type ReportRow = {
  id: string;
  name: string;
  domains: string[];
  visibility: string;
  tags: string[];
  updated_at: string;
};

type ReportRunRow = {
  id: string;
  status: string;
  row_count: number | null;
  created_at: string;
  error_message: string | null;
  result_preview: Record<string, unknown>[];
};

type RunDiagnostics = {
  durationMs: number;
  baseRowCount: number;
  filteredRowCount: number;
  appliedFilterCount: number;
  fieldCount: number;
  noDataReason: string | null;
};

const DEFAULT_CONFIG = {
  domains: ['hr'],
  fields: ['employee_name', 'employee_department', 'employee_role', 'employee_status'],
  filters: [],
  filterMode: 'and',
  sort: [{ field: 'employee_name', direction: 'asc' }],
  groupBy: [],
  quickFilters: [],
};

export function ReportsHomeClient({ canManage }: { canManage: boolean }) {
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState('New report');
  const [domains, setDomains] = useState<string[]>(['hr']);
  const [fields, setFields] = useState<string[]>(DEFAULT_CONFIG.fields);
  const [preview, setPreview] = useState<Record<string, unknown>[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [runDiagnostics, setRunDiagnostics] = useState<RunDiagnostics | null>(null);
  const [recentRuns, setRecentRuns] = useState<ReportRunRow[]>([]);
  const [running, setRunning] = useState(false);
  const [exporting, setExporting] = useState<'csv' | 'pdf' | null>(null);
  const [homeMetrics, setHomeMetrics] = useState<Record<string, number>>({});
  const [runError, setRunError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [runInfo, setRunInfo] = useState<string | null>(null);
  const [chartDimension, setChartDimension] = useState<string>('employee_department');
  const [chartMetric, setChartMetric] = useState<string>('count');

  const filteredFieldOptions = useMemo(
    () => REPORT_FIELDS.filter((f) => domains.includes(f.domain)),
    [domains]
  );

  async function loadReports() {
    const res = await fetch('/api/reports', { cache: 'no-store', credentials: 'include' });
    const json = await res.json();
    setReports(Array.isArray(json.reports) ? json.reports : []);
  }

  async function loadHome() {
    const res = await fetch('/api/reports/home', { cache: 'no-store', credentials: 'include' });
    const json = await res.json();
    setHomeMetrics((json.metrics ?? {}) as Record<string, number>);
  }

  useEffect(() => {
    void loadReports();
    void loadHome();
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setRecentRuns([]);
      return;
    }
    void loadRuns(selectedId);
  }, [selectedId]);

  async function loadRuns(reportId: string) {
    const res = await fetch(`/api/reports/${reportId}/runs`, { cache: 'no-store', credentials: 'include' });
    const json = await res.json();
    setRecentRuns(Array.isArray(json.runs) ? (json.runs as ReportRunRow[]) : []);
  }

  async function saveReport() {
    const payload = {
      name,
      domains,
      config: { ...DEFAULT_CONFIG, domains, fields },
      visibility: 'private',
    };
    const res = await fetch('/api/reports', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) await loadReports();
  }

  async function runSelected(reportId: string) {
    setRunning(true);
    setRunError(null);
    setExportError(null);
    setRunInfo(null);
    try {
      const res = await fetch(`/api/reports/${reportId}/run`, {
        method: 'POST',
        credentials: 'include',
      });
      const json = await res.json();
      if (!res.ok) {
        setRunError(String(json?.error ?? 'Run failed'));
        setPreview([]);
        setTotalRows(0);
        setRunDiagnostics(null);
        return;
      }
      setPreview(Array.isArray(json.previewRows) ? json.previewRows : []);
      setTotalRows(Number(json.totalRows ?? 0));
      setRunDiagnostics((json.diagnostics ?? null) as RunDiagnostics | null);
      setRunInfo(`Run complete: ${Number(json.totalRows ?? 0)} rows`);
      await loadRuns(reportId);
    } finally {
      setRunning(false);
    }
  }

  async function exportSelected(format: 'csv' | 'pdf') {
    if (!selectedId) return;
    setExporting(format);
    setExportError(null);
    try {
      const res = await fetch(`/api/reports/${selectedId}/export?format=${format}`, {
        credentials: 'include',
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { error?: string };
        setExportError(payload.error ?? `Failed to export ${format.toUpperCase()}`);
        return;
      }
      const blob = await res.blob();
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = href;
      anchor.download = `report-${selectedId}.${format}`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(href);
    } finally {
      setExporting(null);
    }
  }

  const previewColumns = useMemo(() => (preview.length ? Object.keys(preview[0]) : []), [preview]);
  const numericChartFields = useMemo(() => previewColumns.filter((column) => preview.some((row) => Number.isFinite(Number(row[column])))), [preview, previewColumns]);
  useEffect(() => {
    if (!previewColumns.length) return;
    if (!previewColumns.includes(chartDimension)) setChartDimension(previewColumns[0]);
    if (chartMetric !== 'count' && !numericChartFields.includes(chartMetric)) {
      setChartMetric('count');
    }
  }, [previewColumns, chartDimension, chartMetric, numericChartFields]);
  const chartRows = useMemo(() => {
    if (!preview.length || !chartDimension) return [];
    const groups = new Map<string, { label: string; count: number; sum: number }>();
    for (const row of preview) {
      const label = String(row[chartDimension] ?? 'Unknown').trim() || 'Unknown';
      const current = groups.get(label) ?? { label, count: 0, sum: 0 };
      current.count += 1;
      if (chartMetric !== 'count') current.sum += Number(row[chartMetric] ?? 0);
      groups.set(label, current);
    }
    return Array.from(groups.values())
      .map((entry) => ({
        label: entry.label,
        value: chartMetric === 'count' ? entry.count : entry.sum,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 12);
  }, [preview, chartDimension, chartMetric]);

  return (
    <div className="space-y-6">
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <Metric title="Total headcount" value={homeMetrics.totalHeadcount ?? 0} />
        <Metric title="Active absences today" value={homeMetrics.activeAbsencesToday ?? 0} />
        <Metric title="Timesheets pending" value={homeMetrics.timesheetsPendingApproval ?? 0} />
        <Metric title="Overdue reviews" value={homeMetrics.overduePerformanceReviews ?? 0} />
        <Metric title="Hiring pending approvals" value={homeMetrics.hiringRequisitionsPending ?? 0} />
        <Metric title="Hiring starts confirmed" value={homeMetrics.hiringStartsConfirmed ?? 0} />
      </section>
      <section className="rounded-xl border border-[#e8e8e8] bg-white p-4">
        <h2 className="text-[12px] font-semibold uppercase tracking-widest text-[#9b9b9b]">Builder</h2>
        <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            <label className="block text-[12px] font-semibold text-[#6b6b6b]">
              Report name
              <input className="mt-1 w-full rounded-xl border border-[#d8d8d8] px-3 py-2 text-[14px]" value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <div>
              <p className="text-[12px] font-semibold text-[#6b6b6b]">Domain</p>
              <div className="mt-2 flex gap-3 text-[13px]">
                <label><input type="checkbox" checked={domains.includes('hr')} onChange={(e) => setDomains((d) => e.target.checked ? Array.from(new Set([...d, 'hr'])) : d.filter((x) => x !== 'hr'))} /> HR</label>
                <label><input type="checkbox" checked={domains.includes('finance')} onChange={(e) => setDomains((d) => e.target.checked ? Array.from(new Set([...d, 'finance'])) : d.filter((x) => x !== 'finance'))} /> Finance</label>
                {domains.includes('hr') && domains.includes('finance') && !canManage ? <span className="text-[#b42318]">Requires `reports.manage`</span> : null}
              </div>
            </div>
            <button className="rounded-lg bg-[#121212] px-3 py-2 text-[13px] text-white" onClick={() => void saveReport()}>
              Save report
            </button>
          </div>
          <div>
            <p className="text-[12px] font-semibold text-[#6b6b6b]">Fields</p>
            <div className="mt-2 max-h-56 overflow-auto rounded-xl border border-[#e8e8e8] p-2 text-[13px]">
              {filteredFieldOptions.map((f) => (
                <label key={f.key} className="flex items-center gap-2 py-1">
                  <input
                    type="checkbox"
                    checked={fields.includes(f.key)}
                    onChange={(e) =>
                      setFields((prev) => (e.target.checked ? Array.from(new Set([...prev, f.key])) : prev.filter((k) => k !== f.key)))
                    }
                  />
                  <span>{f.label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-[#e8e8e8] bg-white p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-[12px] font-semibold uppercase tracking-widest text-[#9b9b9b]">Saved reports</h2>
            {selectedId ? (
              <div className="flex gap-2">
                <button className="rounded-lg border border-[#d8d8d8] px-2 py-1 text-[12px]" onClick={() => void runSelected(selectedId)}>{running ? 'Running...' : 'Run'}</button>
                <button className="rounded-lg border border-[#d8d8d8] px-2 py-1 text-[12px]" onClick={() => void exportSelected('csv')}>{exporting === 'csv' ? 'Exporting...' : 'CSV'}</button>
                <button className="rounded-lg border border-[#d8d8d8] px-2 py-1 text-[12px]" onClick={() => void exportSelected('pdf')}>{exporting === 'pdf' ? 'Exporting...' : 'PDF'}</button>
              </div>
            ) : null}
          </div>
          <div className="mt-3 space-y-2">
            {reports.map((r) => (
              <button key={r.id} className={`w-full rounded-lg border px-3 py-2 text-left ${selectedId === r.id ? 'border-[#121212] bg-[#f7f7f7]' : 'border-[#e8e8e8]'}`} onClick={() => setSelectedId(r.id)}>
                <div className="text-[13px] font-semibold">{r.name}</div>
                <div className="text-[12px] text-[#6b6b6b]">{r.domains.join(', ')} · {r.visibility}</div>
              </button>
            ))}
            {!reports.length ? <p className="text-[13px] text-[#6b6b6b]">No saved reports yet.</p> : null}
          </div>
          {selectedId ? (
            <div className="mt-3 rounded-xl border border-[#efefef] p-3">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-[#9b9b9b]">Recent runs</p>
              <div className="mt-2 space-y-1 text-[12px]">
                {recentRuns.slice(0, 4).map((run) => (
                  <div key={run.id} className="rounded-md bg-[#fafafa] px-2 py-1">
                    <span className="font-semibold">{run.status}</span> · {run.row_count ?? 0} rows · {new Date(run.created_at).toLocaleString()}
                    {run.error_message ? <div className="text-[#b42318]">{run.error_message}</div> : null}
                  </div>
                ))}
                {!recentRuns.length ? <p className="text-[#6b6b6b]">No runs yet.</p> : null}
              </div>
            </div>
          ) : null}
        </div>
        <div className="rounded-xl border border-[#e8e8e8] bg-white p-4">
          <h2 className="text-[12px] font-semibold uppercase tracking-widest text-[#9b9b9b]">Preview (first 50)</h2>
          {runError ? (
            <p className="mt-2 rounded-lg border border-[#fecaca] bg-[#fef2f2] px-3 py-2 text-[12px] text-[#991b1b]">
              {runError}
            </p>
          ) : null}
          {exportError ? (
            <p className="mt-2 rounded-lg border border-[#fecaca] bg-[#fef2f2] px-3 py-2 text-[12px] text-[#991b1b]">
              {exportError}
            </p>
          ) : null}
          {runInfo ? <p className="mt-2 text-[12px] text-[#166534]">{runInfo}</p> : null}
          {runDiagnostics ? (
            <p className="mt-2 text-[12px] text-[#6b6b6b]">
              {`Rows: ${totalRows} · Base: ${runDiagnostics.baseRowCount} · Filtered: ${runDiagnostics.filteredRowCount} · Duration: ${runDiagnostics.durationMs}ms`}
            </p>
          ) : null}
          <div className="mt-3 rounded-lg border border-[#efefef] p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[12px] font-semibold text-[#6b6b6b]">Chart</span>
              <FormSelect className="rounded border border-[#d8d8d8] px-2 py-1 text-[12px]" value={chartDimension} onChange={(e) => setChartDimension(e.target.value)}>
                {previewColumns.map((field) => (
                  <option key={field} value={field}>{field}</option>
                ))}
              </FormSelect>
              <FormSelect className="rounded border border-[#d8d8d8] px-2 py-1 text-[12px]" value={chartMetric} onChange={(e) => setChartMetric(e.target.value)}>
                <option value="count">count</option>
                {numericChartFields.map((field) => (
                  <option key={field} value={field}>{`sum(${field})`}</option>
                ))}
              </FormSelect>
            </div>
            <div className="mt-3 space-y-2">
              {chartRows.length ? (
                chartRows.map((row) => {
                  const maxValue = chartRows[0]?.value || 1;
                  const width = Math.max(4, Math.round((row.value / maxValue) * 100));
                  return (
                    <div key={row.label}>
                      <div className="mb-1 flex items-center justify-between text-[11px]">
                        <span className="truncate">{row.label}</span>
                        <span className="font-semibold tabular-nums">{row.value.toFixed(0)}</span>
                      </div>
                      <div className="h-2 rounded bg-[#f1f1f1]">
                        <div className="h-2 rounded bg-[#111827]" style={{ width: `${width}%` }} />
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="text-[12px] text-[#6b6b6b]">Run a report to populate the chart.</p>
              )}
            </div>
          </div>
          {preview.length ? (
            <div className="mt-3 max-h-56 overflow-auto rounded-lg border border-[#efefef]">
              <table className="min-w-full text-[12px]">
                <thead className="sticky top-0 bg-[#fafafa]">
                  <tr>
                    {previewColumns.map((column) => (
                      <th key={column} className="border-b px-2 py-1 text-left font-semibold">{column}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row, idx) => (
                    <tr key={`${idx}-${String(row[previewColumns[0]] ?? idx)}`} className="border-b border-[#f1f1f1]">
                      {previewColumns.map((column) => (
                        <td key={column} className="px-2 py-1">{String(row[column] ?? '')}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          <pre className="mt-2 max-h-80 overflow-auto rounded-lg bg-[#0b0b0b] p-3 text-[11px] text-[#e5e7eb]">
            {JSON.stringify(preview, null, 2)}
          </pre>
        </div>
      </section>
    </div>
  );
}

function Metric({ title, value }: { title: string; value: number }) {
  return (
    <div className="rounded-xl border border-[#e8e8e8] bg-white p-4">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-[#9b9b9b]">{title}</p>
      <p className="mt-2 text-[30px] font-bold leading-none tracking-tight tabular-nums">{value}</p>
    </div>
  );
}
