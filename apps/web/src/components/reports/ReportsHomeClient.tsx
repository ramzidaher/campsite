'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { REPORT_CATEGORY_ORDER, REPORT_FIELDS, type ReportFieldDef } from '@/lib/reports/catalog';
import { HR_REPORT_PRESETS, type HrReportPresetId } from '@/lib/reports/hrReportPresets';

type ReportRow = {
  id: string;
  name: string;
  domains: string[];
  visibility: string;
  tags: string[];
  updated_at: string;
};

type RunDiagnostics = {
  durationMs: number;
  baseRowCount: number;
  filteredRowCount: number;
  appliedFilterCount: number;
  fieldCount: number;
  noDataReason: string | null;
};

function noDataHint(reason: string | null): string {
  if (!reason) return 'No rows matched this report. Check department filters and your access scope.';
  if (reason === 'no_base_rows_in_scope') {
    return 'No employee rows were in scope for your account (for example, your department). People with org-wide HR or payroll access see everyone; others need a primary department or department membership.';
  }
  if (reason === 'filters_removed_all_rows') {
    return 'Saved filters excluded every row. Edit the saved report configuration or relax filters.';
  }
  if (reason === 'projection_or_scope_empty') {
    return 'Nothing to show—try adding columns or widening which departments are included.';
  }
  return 'No rows returned for this configuration.';
}

type PresentationMode = 'table' | 'chart' | 'summary';
type ChartStyle = 'bars' | 'donut';

const DEFAULT_CONFIG = {
  domains: ['hr'] as string[],
  fields: ['employee_name', 'employee_department', 'employee_role', 'employee_status'],
  filters: [],
  filterMode: 'and',
  sort: [{ field: 'employee_name', direction: 'asc' }],
  groupBy: [],
  quickFilters: [],
  departmentIds: [] as string[],
};

/** Custom first so the default preset (`custom-builder`) sits at the top of the dropdown. */
const PRESET_GROUP_ORDER = ['Custom', 'Shift & coverage', 'Time & pay', 'People'] as const;
const PRESET_GROUPS = PRESET_GROUP_ORDER.filter((g) => HR_REPORT_PRESETS.some((p) => p.group === g));

const PRESET_SELECT_CLASS =
  'w-full cursor-pointer appearance-none rounded-xl border border-[#d8d8d8] bg-white bg-[length:1rem] bg-[position:right_0.75rem_center] bg-no-repeat py-2.5 pl-3 pr-9 text-[13px] font-medium text-[#121212] shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-[#121212]/25';

type ReportsDepartmentOption = { id: string; name: string };

export function ReportsHomeClient({
  canManage,
  departments,
}: {
  canManage: boolean;
  departments: ReportsDepartmentOption[];
}) {
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activePreset, setActivePreset] = useState<HrReportPresetId>('custom-builder');
  const [name, setName] = useState('Custom report');
  const [domains, setDomains] = useState<string[]>(['hr']);
  const [fields, setFields] = useState<string[]>(DEFAULT_CONFIG.fields);
  const [financeNotice, setFinanceNotice] = useState<string | null>(null);
  const [preview, setPreview] = useState<Record<string, unknown>[]>([]);
  const [totalRows, setTotalRows] = useState(0);
  const [runDiagnostics, setRunDiagnostics] = useState<RunDiagnostics | null>(null);
  const [running, setRunning] = useState(false);
  const [exporting, setExporting] = useState<'csv' | 'pdf' | 'xlsx' | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [runInfo, setRunInfo] = useState<string | null>(null);
  const [chartDimension, setChartDimension] = useState<string>('employee_department');
  const [chartMetric, setChartMetric] = useState<string>('count');
  const [presentation, setPresentation] = useState<PresentationMode>('table');
  const [chartStyle, setChartStyle] = useState<ChartStyle>('bars');
  const [selectedDepartmentIds, setSelectedDepartmentIds] = useState<string[]>([]);
  const [checkedForDelete, setCheckedForDelete] = useState<string[]>([]);
  const [deletingReports, setDeletingReports] = useState(false);
  const [deleteReportsError, setDeleteReportsError] = useState<string | null>(null);

  const departmentIdSet = useMemo(() => new Set(departments.map((d) => d.id)), [departments]);

  const filteredFieldOptions = useMemo(
    () => REPORT_FIELDS.filter((f) => domains.includes(f.domain)),
    [domains]
  );

  const fieldsByCategory = useMemo(() => {
    const map = new Map<string, ReportFieldDef[]>();
    for (const f of filteredFieldOptions) {
      const list = map.get(f.category) ?? [];
      list.push(f);
      map.set(f.category, list);
    }
    const ordered: { category: string; fields: ReportFieldDef[] }[] = [];
    const seen = new Set<string>();
    for (const cat of REPORT_CATEGORY_ORDER) {
      const fields = map.get(cat);
      if (fields?.length) {
        ordered.push({ category: cat, fields });
        seen.add(cat);
      }
    }
    for (const [cat, fields] of map) {
      if (!seen.has(cat) && fields.length) ordered.push({ category: cat, fields });
    }
    return ordered;
  }, [filteredFieldOptions]);

  const applyPreset = useCallback(
    (presetId: HrReportPresetId) => {
      const preset = HR_REPORT_PRESETS.find((p) => p.id === presetId);
      if (!preset) return;
      setActivePreset(presetId);
      setFinanceNotice(null);

      let nextDomains = [...preset.domains];
      let nextFields = [...preset.fields];

      if (preset.requiresFinanceAccess && !canManage) {
        nextDomains = ['hr'];
        nextFields = preset.fields.filter((k) => REPORT_FIELDS.some((f) => f.key === k && f.domain === 'hr'));
        setFinanceNotice(
          'Finance columns require the reports.manage permission. Showing HR-only fields—you can still customize below.'
        );
      }

      setName(preset.suggestedReportName);
      setDomains(nextDomains);
      setFields(nextFields.length ? nextFields : DEFAULT_CONFIG.fields);
      setSelectedDepartmentIds([]);
    },
    [canManage]
  );

  async function loadReports() {
    const res = await fetch('/api/reports', { cache: 'no-store', credentials: 'include' });
    const json = await res.json();
    setReports(Array.isArray(json.reports) ? json.reports : []);
  }

  function toggleCheckedForDelete(id: string) {
    setCheckedForDelete((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function deleteSelectedReports() {
    const ids = checkedForDelete;
    if (ids.length === 0) return;
    if (!window.confirm(`Remove ${ids.length} saved report${ids.length === 1 ? '' : 's'} from your library?`)) return;
    setDeleteReportsError(null);
    setDeletingReports(true);
    try {
      for (const id of ids) {
        const res = await fetch(`/api/reports/${id}`, { method: 'DELETE', credentials: 'include' });
        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(err.error ?? `Failed to delete report ${id}`);
        }
      }
      if (selectedId && ids.includes(selectedId)) {
        setSelectedId(null);
        setPreview([]);
        setTotalRows(0);
        setRunDiagnostics(null);
        setRunInfo(null);
        setRunError(null);
      }
      setCheckedForDelete([]);
      await loadReports();
    } catch (e) {
      setDeleteReportsError(e instanceof Error ? e.message : 'Could not delete reports');
    } finally {
      setDeletingReports(false);
    }
  }

  useEffect(() => {
    void loadReports();
  }, []);

  useEffect(() => {
    setCheckedForDelete((prev) => prev.filter((id) => reports.some((r) => r.id === id)));
  }, [reports]);

  useEffect(() => {
    if (!selectedId) return;
    let cancelled = false;
    void (async () => {
      const res = await fetch(`/api/reports/${selectedId}`, { cache: 'no-store', credentials: 'include' });
      if (!res.ok || cancelled) return;
      const json = (await res.json()) as {
        report?: {
          name?: string;
          domains?: unknown;
          config?: { fields?: unknown; departmentIds?: unknown };
        };
      };
      const rep = json.report;
      if (!rep || cancelled) return;
      if (typeof rep.name === 'string') setName(rep.name);
      const doms = Array.isArray(rep.domains) ? rep.domains.map(String).filter((d) => d === 'hr' || d === 'finance') : ['hr'];
      setDomains(doms.length ? doms : ['hr']);
      const cfg = rep.config;
      if (cfg && typeof cfg === 'object') {
        const f = Array.isArray(cfg.fields) ? cfg.fields.map(String).filter(Boolean) : DEFAULT_CONFIG.fields;
        setFields(f.length ? f : DEFAULT_CONFIG.fields);
        const rawDeps = Array.isArray(cfg.departmentIds) ? cfg.departmentIds.map(String).filter(Boolean) : [];
        setSelectedDepartmentIds(rawDeps.filter((id) => departmentIdSet.has(id)));
      }
      setActivePreset('custom-builder');
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId, departmentIdSet]);

  async function saveReport() {
    const payload = {
      name,
      domains,
      config: {
        ...DEFAULT_CONFIG,
        domains,
        fields,
        departmentIds: selectedDepartmentIds,
      },
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
    } finally {
      setRunning(false);
    }
  }

  async function exportSelected(format: 'csv' | 'pdf' | 'xlsx') {
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
      const ext = format === 'xlsx' ? 'xlsx' : format;
      anchor.download = `report-${selectedId}.${ext}`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(href);
    } finally {
      setExporting(null);
    }
  }

  const previewColumns = useMemo(() => (preview.length ? Object.keys(preview[0]) : []), [preview]);
  const numericChartFields = useMemo(
    () => previewColumns.filter((column) => preview.some((row) => Number.isFinite(Number(row[column])))),
    [preview, previewColumns]
  );

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

  const summaryText = useMemo(() => buildSummaryNarrative(name, totalRows, preview, chartRows), [name, totalRows, preview, chartRows]);

  const currentPreset = HR_REPORT_PRESETS.find((p) => p.id === activePreset)!;

  return (
    <div className="space-y-5">
      <div className="min-w-0 space-y-4">
          <section className="rounded-xl border border-[#e8e8e8] bg-white p-5 shadow-sm sm:p-6">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div>
                <h2 className="font-authSerif text-[20px] leading-snug tracking-[-0.02em] text-[#121212]">
                  {currentPreset.label}
                </h2>
                <p className="mt-1.5 max-w-3xl text-[13.5px] leading-relaxed text-[#6b6b6b]">{currentPreset.description}</p>
                {financeNotice ? (
                  <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-950">{financeNotice}</p>
                ) : null}
              </div>
              {currentPreset.relatedHref ? (
                <Link
                  href={currentPreset.relatedHref}
                  className="inline-flex shrink-0 items-center justify-center rounded-xl border border-[#d8d8d8] px-4 py-2.5 text-[13px] font-semibold text-[#121212] transition-colors hover:bg-[#fafafa]"
                >
                  {currentPreset.relatedLabel ?? 'Open related'}
                </Link>
              ) : null}
            </div>
          </section>

          <section className="rounded-xl border border-[#e8e8e8] bg-white p-5 shadow-sm sm:p-6">
              <h3 className="text-[12px] font-semibold uppercase tracking-widest text-[#9b9b9b]">Report builder</h3>
              <div className="mt-3 grid grid-cols-1 gap-5 xl:grid-cols-2 xl:items-start xl:gap-8">
                <div className="min-w-0 space-y-3">
                  <PresetsDropdown value={activePreset} onChange={applyPreset} />
                  <label className="block text-[12px] font-semibold text-[#6b6b6b]">
                    Report title
                    <input
                      className="mt-1 w-full rounded-xl border border-[#d8d8d8] px-4 py-3 text-[14px]"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </label>
                  <div>
                    <p className="text-[12px] font-semibold text-[#6b6b6b]">Data domains</p>
                    <div className="mt-2 flex flex-wrap gap-4 text-[13px]">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={domains.includes('hr')}
                          onChange={(e) =>
                            setDomains((d) =>
                              e.target.checked ? Array.from(new Set([...d, 'hr'])) : d.filter((x) => x !== 'hr')
                            )
                          }
                        />
                        HR
                      </label>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={domains.includes('finance')}
                          onChange={(e) =>
                            setDomains((d) =>
                              e.target.checked ? Array.from(new Set([...d, 'finance'])) : d.filter((x) => x !== 'finance')
                            )
                          }
                        />
                        Finance
                      </label>
                      {domains.includes('hr') && domains.includes('finance') && !canManage ? (
                        <span className="text-[12px] text-[#b42318]">Finance scope requires reports.manage</span>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 pt-0.5">
                    <button
                      type="button"
                      className="rounded-xl bg-[#121212] px-4 py-2.5 text-[13px] font-semibold text-white"
                      onClick={() => void saveReport()}
                    >
                      Save to library
                    </button>
                    <p className="w-full text-[12px] text-[#6b6b6b]">
                      Saved reports appear in Saved & exports below and can be scheduled from the API.
                    </p>
                  </div>
                </div>
                <div className="grid min-w-0 grid-cols-1 gap-5 md:grid-cols-2 md:gap-6">
                  <div>
                    <p className="text-[12px] font-semibold text-[#6b6b6b]">Columns (choose every field you need)</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="text-[12px] font-semibold text-[#121212] underline underline-offset-2"
                        onClick={() => setFields(filteredFieldOptions.map((f) => f.key))}
                      >
                        Select all
                      </button>
                      <button
                        type="button"
                        className="text-[12px] font-semibold text-[#6b6b6b] underline underline-offset-2"
                        onClick={() => setFields([])}
                      >
                        Clear
                      </button>
                    </div>
                    <div className="mt-2 max-h-64 overflow-auto rounded-xl border border-[#e8e8e8] p-3 text-[13px]">
                      {fieldsByCategory.map(({ category, fields: catFields }) => (
                        <div key={category} className="mb-4 last:mb-0">
                          <p className="sticky top-0 z-[1] mb-2 bg-white py-1 text-[11px] font-semibold uppercase tracking-wide text-[#9b9b9b]">
                            {category}
                          </p>
                          <div className="space-y-2">
                            {catFields.map((f) => (
                              <label
                                key={f.key}
                                className="flex cursor-pointer items-start gap-2.5 rounded-lg py-0.5 pr-1"
                                title={f.sourceTable ? `Database: ${f.sourceTable}` : undefined}
                              >
                                <input
                                  type="checkbox"
                                  className="mt-1 h-4 w-4 shrink-0 rounded border-[#d8d8d8]"
                                  checked={fields.includes(f.key)}
                                  onChange={(e) =>
                                    setFields((prev) =>
                                      e.target.checked ? Array.from(new Set([...prev, f.key])) : prev.filter((k) => k !== f.key)
                                    )
                                  }
                                />
                                <span className="min-w-0 leading-snug">
                                  <span className="text-[13px]">{f.label}</span>
                                  {f.sourceTable ? (
                                    <span className="mt-0.5 block font-mono text-[10px] text-[#a3a3a3]">{f.sourceTable}</span>
                                  ) : null}
                                </span>
                              </label>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-[12px] font-semibold text-[#6b6b6b]">Departments</p>
                    {departments.length ? (
                      <>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="text-[12px] font-semibold text-[#121212] underline underline-offset-2"
                            onClick={() => setSelectedDepartmentIds(departments.map((d) => d.id))}
                          >
                            Select all
                          </button>
                          <button
                            type="button"
                            className="text-[12px] font-semibold text-[#6b6b6b] underline underline-offset-2"
                            onClick={() => setSelectedDepartmentIds([])}
                          >
                            Clear
                          </button>
                        </div>
                        <div className="mt-2 max-h-64 overflow-auto rounded-xl border border-[#e8e8e8] p-3 text-[13px]">
                          {departments.map((d) => (
                            <label key={d.id} className="flex items-center gap-2 py-1.5">
                              <input
                                type="checkbox"
                                checked={selectedDepartmentIds.includes(d.id)}
                                onChange={() =>
                                  setSelectedDepartmentIds((prev) =>
                                    prev.includes(d.id) ? prev.filter((x) => x !== d.id) : [...prev, d.id]
                                  )
                                }
                              />
                              <span>{d.name}</span>
                            </label>
                          ))}
                        </div>
                      </>
                    ) : (
                      <p className="mt-2 text-[12px] text-[#6b6b6b]">No departments found for this organisation.</p>
                    )}
                  </div>
                </div>
              </div>
            </section>

          <SavedReportsPanel
            reports={reports}
            selectedId={selectedId}
            onSelect={setSelectedId}
            running={running}
            exporting={exporting}
            onRun={() => selectedId && void runSelected(selectedId)}
            onExport={exportSelected}
            checkedForDelete={checkedForDelete}
            onToggleCheckDelete={toggleCheckedForDelete}
            onDeleteSelected={deleteSelectedReports}
            deletingReports={deletingReports}
            deleteError={deleteReportsError}
          />

          <section className="rounded-xl border border-[#e8e8e8] bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h3 className="text-[12px] font-semibold uppercase tracking-widest text-[#9b9b9b]">Presentation</h3>
                <p className="mt-1 text-[12px] text-[#6b6b6b]">Switch between tabular data, visuals, or a narrative summary.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {(['table', 'chart', 'summary'] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setPresentation(mode)}
                    className={[
                      'rounded-full px-4 py-1.5 text-[12px] font-semibold capitalize',
                      presentation === mode ? 'bg-[#121212] text-white' : 'border border-[#e8e8e8] bg-white text-[#121212]',
                    ].join(' ')}
                  >
                    {mode === 'summary' ? 'Summary text' : mode}
                  </button>
                ))}
              </div>
            </div>

            {runError ? (
              <p className="mt-4 rounded-lg border border-[#fecaca] bg-[#fef2f2] px-3 py-2 text-[12px] text-[#991b1b]">{runError}</p>
            ) : null}
            {exportError ? (
              <p className="mt-4 rounded-lg border border-[#fecaca] bg-[#fef2f2] px-3 py-2 text-[12px] text-[#991b1b]">{exportError}</p>
            ) : null}
            {totalRows === 0 && !runError && runDiagnostics?.noDataReason ? (
              <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-950">
                {noDataHint(runDiagnostics.noDataReason)}
              </p>
            ) : null}
            {runInfo ? <p className="mt-4 text-[12px] text-[#166534]">{runInfo}</p> : null}
            {runDiagnostics ? (
              <p className="mt-2 text-[12px] text-[#6b6b6b]">
                {`Rows: ${totalRows} · Base: ${runDiagnostics.baseRowCount} · Filtered: ${runDiagnostics.filteredRowCount} · Duration: ${runDiagnostics.durationMs}ms`}
              </p>
            ) : null}

            {presentation === 'table' && preview.length ? (
              <div className="mt-6 max-h-96 overflow-auto rounded-xl border border-[#efefef]">
                <table className="min-w-full text-[12px]">
                  <thead className="sticky top-0 bg-[#fafafa]">
                    <tr>
                      {previewColumns.map((column) => (
                        <th key={column} className="border-b px-3 py-2 text-left font-semibold">
                          {column}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((row, idx) => (
                      <tr key={`${idx}-${String(row[previewColumns[0]] ?? idx)}`} className="border-b border-[#f1f1f1]">
                        {previewColumns.map((column) => (
                          <td key={column} className="px-3 py-2">
                            {String(row[column] ?? '')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}

            {presentation === 'table' && !preview.length ? (
              <p className="mt-6 text-[13px] text-[#6b6b6b]">Select a saved report and choose Run to populate the table.</p>
            ) : null}

            {presentation === 'chart' ? (
              <div className="mt-6 space-y-4">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-[12px] font-semibold text-[#6b6b6b]">Chart style</span>
                  {(['bars', 'donut'] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setChartStyle(s)}
                      className={[
                        'rounded-full px-3 py-1 text-[12px] font-semibold capitalize',
                        chartStyle === s ? 'bg-[#121212] text-white' : 'border border-[#e8e8e8]',
                      ].join(' ')}
                    >
                      {s}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap items-end gap-3">
                  <label className="text-[12px] font-semibold text-[#6b6b6b]">
                    Group by
                    <select
                      className="ml-2 rounded-xl border border-[#d8d8d8] px-3 py-2 text-[12px]"
                      value={chartDimension}
                      onChange={(e) => setChartDimension(e.target.value)}
                      disabled={!previewColumns.length}
                    >
                      {!previewColumns.length ? <option value="">Run a report first</option> : null}
                      {previewColumns.map((field) => (
                        <option key={field} value={field}>
                          {field}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-[12px] font-semibold text-[#6b6b6b]">
                    Metric
                    <select
                      className="ml-2 rounded-xl border border-[#d8d8d8] px-3 py-2 text-[12px]"
                      value={chartMetric}
                      onChange={(e) => setChartMetric(e.target.value)}
                    >
                      <option value="count">count</option>
                      {numericChartFields.map((field) => (
                        <option key={field} value={field}>{`sum(${field})`}</option>
                      ))}
                    </select>
                  </label>
                </div>
                {chartRows.length ? (
                  chartStyle === 'bars' ? (
                    <div className="space-y-3 rounded-xl border border-[#efefef] p-4">
                      {chartRows.map((row) => {
                        const maxValue = chartRows[0]?.value || 1;
                        const width = Math.max(4, Math.round((row.value / maxValue) * 100));
                        return (
                          <div key={row.label}>
                            <div className="mb-1 flex items-center justify-between text-[11px]">
                              <span className="truncate">{row.label}</span>
                              <span className="font-semibold tabular-nums">{row.value.toFixed(chartMetric === 'count' ? 0 : 2)}</span>
                            </div>
                            <div className="h-2.5 rounded-full bg-[#f1f1f1]">
                              <div className="h-2.5 rounded-full bg-gradient-to-r from-[#1e293b] to-[#6366f1]" style={{ width: `${width}%` }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <DonutChart rows={chartRows} metricLabel={chartMetric === 'count' ? 'Count' : chartMetric} />
                  )
                ) : (
                  <p className="text-[13px] text-[#6b6b6b]">Run a report to chart aggregated values.</p>
                )}
              </div>
            ) : null}

            {presentation === 'summary' ? (
              <div className="mt-6 rounded-xl border border-[#e8e8e8] bg-[#fafafa] p-5 text-[13.5px] leading-relaxed text-[#121212]">
                {preview.length ? (
                  <div className="whitespace-pre-wrap">{summaryText}</div>
                ) : (
                  <p className="text-[#6b6b6b]">Run a saved report to generate an executive summary from the first preview rows.</p>
                )}
              </div>
            ) : null}

            <details className="mt-6 rounded-xl border border-[#ededed] bg-[#fafafa] p-3">
              <summary className="cursor-pointer text-[12px] font-semibold text-[#6b6b6b]">Technical · Raw JSON</summary>
              <pre className="mt-3 max-h-64 overflow-auto rounded-lg bg-[#0b0b0b] p-3 text-[11px] text-[#e5e7eb]">
                {JSON.stringify(preview, null, 2)}
              </pre>
            </details>
          </section>
      </div>
    </div>
  );
}

function PresetsDropdown({
  value,
  onChange,
}: {
  value: HrReportPresetId;
  onChange: (id: HrReportPresetId) => void;
}) {
  return (
    <label className="block">
      <span className="text-[12px] font-semibold text-[#6b6b6b]">Pre-sets</span>
      <select
        className={`${PRESET_SELECT_CLASS} mt-2`}
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%236b6b6b' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='m6 8 4 4 4-4'/%3E%3C/svg%3E")`,
        }}
        value={value}
        onChange={(e) => onChange(e.target.value as HrReportPresetId)}
        aria-label="Pre-sets"
      >
        {PRESET_GROUPS.map((group) => (
          <optgroup key={group} label={group}>
            {HR_REPORT_PRESETS.filter((p) => p.group === group).map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </label>
  );
}

function buildSummaryNarrative(
  reportName: string,
  totalRows: number,
  preview: Record<string, unknown>[],
  chartRows: { label: string; value: number }[]
): string {
  const lines: string[] = [];
  lines.push(`Report “${reportName}” returned ${totalRows} row${totalRows === 1 ? '' : 's'} in scope.`);
  if (!preview.length) return lines.join('\n');
  lines.push(`Preview shows ${preview.length} row${preview.length === 1 ? '' : 's'} (cap may apply server-side).`);
  if (chartRows.length) {
    lines.push('');
    lines.push('Top groups in the current preview window:');
    chartRows.slice(0, 5).forEach((r, i) => {
      lines.push(`${i + 1}. ${r.label}: ${r.value.toFixed(chartRows[0].value >= 10 ? 0 : 2)}`);
    });
  }
  const first = preview[0];
  const keys = Object.keys(first);
  if (keys.length) {
    lines.push('');
    lines.push('Example record (first row):');
    keys.slice(0, 6).forEach((k) => {
      lines.push(`• ${k}: ${String(first[k] ?? '')}`);
    });
    if (keys.length > 6) lines.push(`• …plus ${keys.length - 6} more columns`);
  }
  return lines.join('\n');
}

function DonutChart({ rows, metricLabel }: { rows: { label: string; value: number }[]; metricLabel: string }) {
  const total = rows.reduce((s, r) => s + r.value, 0) || 1;
  let startPct = 0;
  const segments = rows.map((r, i) => {
    const pct = (r.value / total) * 100;
    const endPct = startPct + pct;
    const hue = (i * 47) % 360;
    const seg = { ...r, pct, startPct, endPct, color: `hsl(${hue} 65% 48%)` };
    startPct = endPct;
    return seg;
  });
  const gradient = segments.map((s) => `${s.color} ${s.startPct}% ${s.endPct}%`).join(', ');
  return (
    <div className="flex flex-col items-center gap-6 md:flex-row md:items-start">
      <div
        className="h-44 w-44 shrink-0 rounded-full border border-[#e8e8e8] shadow-inner"
        style={{ background: `conic-gradient(${gradient})` }}
        role="img"
        aria-label={`Donut chart for ${metricLabel}`}
      />
      <ul className="min-w-0 flex-1 space-y-2 text-[12px]">
        {segments.map((s) => (
          <li key={s.label} className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-2">
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.color }} />
              <span className="truncate">{s.label}</span>
            </span>
            <span className="shrink-0 tabular-nums font-semibold">{s.value.toFixed(total >= 10 ? 0 : 2)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SavedReportsPanel({
  reports,
  selectedId,
  onSelect,
  running,
  exporting,
  onRun,
  onExport,
  checkedForDelete,
  onToggleCheckDelete,
  onDeleteSelected,
  deletingReports,
  deleteError,
}: {
  reports: ReportRow[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  running: boolean;
  exporting: 'csv' | 'pdf' | 'xlsx' | null;
  onRun: () => void;
  onExport: (f: 'csv' | 'pdf' | 'xlsx') => void;
  checkedForDelete: string[];
  onToggleCheckDelete: (id: string) => void;
  onDeleteSelected: () => void;
  deletingReports: boolean;
  deleteError: string | null;
}) {
  const deleteCount = checkedForDelete.length;
  return (
    <section className="rounded-xl border border-[#e8e8e8] bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-[12px] font-semibold uppercase tracking-widest text-[#9b9b9b]">Saved & exports</h3>
          <p className="mt-1 text-[12px] text-[#6b6b6b]">
            CSV for spreadsheets, Excel for stakeholders, PDF for filing. Run generates preview rows for charts and summaries.
          </p>
          {reports.length ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={deleteCount === 0 || deletingReports}
                className="rounded-xl border border-[#b91c1c] bg-white px-3 py-2 text-[12px] font-semibold text-[#b91c1c] disabled:cursor-not-allowed disabled:border-[#e8e8e8] disabled:text-[#b5b5b5]"
                onClick={() => onDeleteSelected()}
              >
                {deletingReports ? 'Removing…' : `Delete selected${deleteCount ? ` (${deleteCount})` : ''}`}
              </button>
            </div>
          ) : null}
        </div>
        {selectedId ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-xl border border-[#d8d8d8] px-3 py-2 text-[12px] font-semibold"
              onClick={onRun}
            >
              {running ? 'Running…' : 'Run'}
            </button>
            <button
              type="button"
              className="rounded-xl border border-[#d8d8d8] px-3 py-2 text-[12px] font-semibold"
              onClick={() => onExport('csv')}
            >
              {exporting === 'csv' ? '…' : 'CSV'}
            </button>
            <button
              type="button"
              className="rounded-xl border border-[#d8d8d8] px-3 py-2 text-[12px] font-semibold"
              onClick={() => onExport('xlsx')}
            >
              {exporting === 'xlsx' ? '…' : 'Excel'}
            </button>
            <button
              type="button"
              className="rounded-xl bg-[#121212] px-3 py-2 text-[12px] font-semibold text-white"
              onClick={() => onExport('pdf')}
            >
              {exporting === 'pdf' ? '…' : 'PDF'}
            </button>
          </div>
        ) : null}
      </div>
      {deleteError ? (
        <p className="mt-3 rounded-lg border border-[#fecaca] bg-[#fef2f2] px-3 py-2 text-[12px] text-[#991b1b]">{deleteError}</p>
      ) : null}
      <div className="mt-4 space-y-2">
        {reports.map((r) => (
          <div key={r.id} className="flex items-stretch gap-2">
            <label className="flex shrink-0 cursor-pointer items-center px-1">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-[#d8d8d8] text-[#121212] focus:ring-[#121212]"
                checked={checkedForDelete.includes(r.id)}
                onChange={() => onToggleCheckDelete(r.id)}
                aria-label={`Select “${r.name}” for deletion`}
              />
            </label>
            <button
              type="button"
              className={`min-w-0 flex-1 rounded-xl border px-4 py-3 text-left transition-colors ${
                selectedId === r.id ? 'border-[#121212] bg-[#f7f7f7]' : 'border-[#e8e8e8] hover:border-[#cfcfcf]'
              }`}
              onClick={() => onSelect(r.id)}
            >
              <div className="text-[13px] font-semibold">{r.name}</div>
              <div className="text-[12px] text-[#6b6b6b]">
                {r.domains.join(', ')} · {r.visibility}
              </div>
            </button>
          </div>
        ))}
        {!reports.length ? <p className="text-[13px] text-[#6b6b6b]">No saved reports yet—configure fields above and Save to library.</p> : null}
      </div>
    </section>
  );
}
