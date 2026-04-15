'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ForceGraphMethods } from 'react-force-graph-2d';
import type { HRDirectoryRow } from '@/components/admin/hr/HRDirectoryClient';

type DirectoryGraphNode = {
  id: string;
  label: string;
  role: string;
  jobTitle: string;
  email: string;
  managerId: string | null;
  managerName: string;
  departments: string[];
  location: string;
  contract: string;
  teamSize: number;
};

type DirectoryGraphLink = { source: string; target: string };

type GraphColors = {
  pageBg: string;
  nodeCenterFill: string;
  nodeDefaultFill: string;
  nodeDefaultBorder: string;
  nodeSelectedFill: string;
  nodeSelectedBorder: string;
  link: string;
  text: string;
  textInverse: string;
  textSecondary: string;
};

const DEFAULT_COLORS: GraphColors = {
  pageBg: '#faf9f6',
  nodeCenterFill: '#121212',
  nodeDefaultFill: '#ece9e2',
  nodeDefaultBorder: '#b6ada0',
  nodeSelectedFill: '#efe7ec',
  nodeSelectedBorder: '#7c4a66',
  link: '#d6d0c5',
  text: '#121212',
  textInverse: '#FFFFFF',
  textSecondary: '#6b6b6b',
};

const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), { ssr: false });

function safeColor(value: string, fallback: string) {
  const v = value.trim();
  if (!v || v === '#') return fallback;
  return v;
}

function contractLabel(contractType: string) {
  switch (contractType) {
    case 'full_time':
      return 'Full-time';
    case 'part_time':
      return 'Part-time';
    case 'contractor':
      return 'Contractor';
    case 'zero_hours':
      return 'Zero hours';
    default:
      return 'Unknown';
  }
}

function locationLabel(workLocation: string) {
  switch (workLocation) {
    case 'office':
      return 'Office';
    case 'remote':
      return 'Remote';
    case 'hybrid':
      return 'Hybrid';
    default:
      return 'Unknown';
  }
}

function displayName(row: HRDirectoryRow) {
  return row.display_name ?? row.preferred_name ?? row.full_name;
}

function wrapLabel(label: string, maxChars = 14): string[] {
  if (label.length <= maxChars) return [label];
  const words = label.split(' ');
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length <= maxChars) current = next;
    else {
      if (current) lines.push(current);
      current = word;
      if (lines.length === 1) break;
    }
  }
  if (current && lines.length < 2) lines.push(current);
  return lines.slice(0, 2);
}

export function EmployeeDirectoryGraph({ rows }: { rows: HRDirectoryRow[] }) {
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const fgRef = useRef<ForceGraphMethods<DirectoryGraphNode, DirectoryGraphLink> | undefined>(undefined);
  const [colors, setColors] = useState<GraphColors>(DEFAULT_COLORS);
  const [canvasSize, setCanvasSize] = useState({ width: 1200, height: 640 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedPoint, setSelectedPoint] = useState<{ x: number; y: number } | null>(null);

  const { nodes, links } = useMemo(() => {
    const peopleMap = new Map<string, HRDirectoryRow>();
    rows.forEach((row) => peopleMap.set(row.user_id, row));

    const teamSizeMap = new Map<string, number>();
    rows.forEach((row) => {
      if (!row.reports_to_user_id) return;
      teamSizeMap.set(row.reports_to_user_id, (teamSizeMap.get(row.reports_to_user_id) ?? 0) + 1);
    });

    const graphNodes: DirectoryGraphNode[] = rows.map((row) => ({
      id: row.user_id,
      label: displayName(row),
      role: row.role ? row.role.replace(/_/g, ' ') : 'Unknown',
      jobTitle: row.job_title ?? 'No job title',
      email: row.email ?? 'No email',
      managerId: row.reports_to_user_id,
      managerName: row.reports_to_name ?? 'No manager',
      departments: row.department_names,
      location: locationLabel(row.work_location ?? ''),
      contract: contractLabel(row.contract_type ?? ''),
      teamSize: teamSizeMap.get(row.user_id) ?? 0,
    }));

    const graphLinks: DirectoryGraphLink[] = rows
      .filter((row) => row.reports_to_user_id && peopleMap.has(row.reports_to_user_id))
      .map((row) => ({ source: row.reports_to_user_id as string, target: row.user_id }));

    return { nodes: graphNodes, links: graphLinks };
  }, [rows]);

  const selected = useMemo(
    () => nodes.find((node) => node.id === selectedId) ?? null,
    [nodes, selectedId]
  );

  useEffect(() => {
    const syncBranding = () => {
      const scopeEl = canvasRef.current ?? document.documentElement;
      const styles = window.getComputedStyle(scopeEl);
      const brandPrimary = safeColor(styles.getPropertyValue('--org-brand-primary'), DEFAULT_COLORS.nodeCenterFill);
      const brandBg = safeColor(styles.getPropertyValue('--org-brand-bg'), DEFAULT_COLORS.pageBg);
      const brandSurface = safeColor(styles.getPropertyValue('--org-brand-surface'), DEFAULT_COLORS.nodeDefaultFill);
      const brandBorder = safeColor(styles.getPropertyValue('--org-brand-border'), DEFAULT_COLORS.nodeDefaultBorder);
      const brandText = safeColor(styles.getPropertyValue('--org-brand-text'), DEFAULT_COLORS.text);
      const brandMuted = safeColor(styles.getPropertyValue('--org-brand-muted'), DEFAULT_COLORS.textSecondary);
      setColors({
        pageBg: brandBg,
        nodeCenterFill: brandPrimary,
        nodeDefaultFill: brandSurface,
        nodeDefaultBorder: brandBorder,
        nodeSelectedFill: brandSurface,
        nodeSelectedBorder: brandPrimary,
        link: brandBorder,
        text: brandText,
        textInverse: '#ffffff',
        textSecondary: brandMuted,
      });
    };
    syncBranding();
    const raf = window.requestAnimationFrame(syncBranding);
    window.addEventListener('campsite:shell-mode-change', syncBranding as EventListener);
    window.addEventListener('storage', syncBranding as EventListener);
    return () => {
      window.cancelAnimationFrame(raf);
      window.removeEventListener('campsite:shell-mode-change', syncBranding as EventListener);
      window.removeEventListener('storage', syncBranding as EventListener);
    };
  }, []);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const update = () => {
      const width = Math.max(320, Math.floor(el.clientWidth));
      const height = Math.max(460, Math.floor(el.clientHeight));
      setCanvasSize({
        width,
        height,
      });
    };
    update();
    const onWindowResize = () => window.requestAnimationFrame(update);
    window.addEventListener('resize', onWindowResize);
    return () => window.removeEventListener('resize', onWindowResize);
  }, []);

  return (
    <section
      className="flex min-h-[calc(100vh-60px)] flex-col p-4 sm:p-5"
      style={{ background: 'var(--org-brand-bg)' }}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[19px] font-semibold tracking-tight" style={{ color: 'var(--org-brand-text)' }}>
            Connected employee graph
          </h2>
          <p className="mt-1 text-[12px]" style={{ color: 'var(--org-brand-muted)' }}>
            Explore reporting lines and employee connections across the directory.
          </p>
        </div>
      </div>

      <div className="mt-3 flex-1">
      <div
        ref={canvasRef}
        className="relative h-[calc(100vh-142px)] overflow-hidden rounded-xl border"
        style={{ borderColor: 'var(--org-brand-border)', background: 'var(--org-brand-surface)' }}
      >
        <ForceGraph2D
          ref={fgRef as never}
          width={canvasSize.width}
          height={canvasSize.height}
          graphData={{ nodes, links }}
          backgroundColor={colors.pageBg}
          cooldownTicks={140}
          warmupTicks={70}
          d3AlphaDecay={0.035}
          d3VelocityDecay={0.3}
          onEngineTick={() => {
            const chargeForce = fgRef.current?.d3Force('charge') as { strength: (n: number) => void } | undefined;
            chargeForce?.strength(-180);
            const linkForce = fgRef.current?.d3Force('link') as
              | { distance: (n: number) => void; strength: (n: number) => void }
              | undefined;
            linkForce?.distance(95);
            linkForce?.strength(0.7);
          }}
          nodeCanvasObject={(nodeRaw, ctx, globalScale) => {
            const node = nodeRaw as DirectoryGraphNode & { x?: number; y?: number };
            const x = node.x ?? 0;
            const y = node.y ?? 0;
            const teamBump = Math.min(node.teamSize, 6);
            const radius = 14 + teamBump;
            const isSelected = selectedId === node.id;

            ctx.beginPath();
            ctx.arc(x, y, radius, 0, 2 * Math.PI, false);
            ctx.shadowColor = 'rgba(15, 23, 42, 0.14)';
            ctx.shadowBlur = 14;
            ctx.shadowOffsetY = 4;
            ctx.fillStyle = isSelected ? '#fff7f8' : '#ffffff';
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.shadowOffsetY = 0;
            ctx.lineWidth = isSelected ? 2 : 1.1;
            ctx.strokeStyle = isSelected ? '#f45461' : '#d6d8de';
            ctx.stroke();

            const lines = wrapLabel(node.label);
            const fontSize = Math.max(9, 11 / globalScale);
            ctx.font = `500 ${fontSize}px Inter, ui-sans-serif, system-ui, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.lineWidth = Math.max(1.5, 2.5 / globalScale);
            ctx.strokeStyle = 'rgba(250,249,246,0.95)';
            ctx.fillStyle = colors.text;
            const yStart = y + radius + 10;
            lines.forEach((line, idx) => {
              const lineY = yStart + idx * (fontSize + 1);
              ctx.strokeText(line, x, lineY);
              ctx.fillText(line, x, lineY);
            });
          }}
          linkColor={(link) => {
            const source = typeof link.source === 'string' ? link.source : link.source.id;
            const target = typeof link.target === 'string' ? link.target : link.target.id;
            return selectedId && (selectedId === source || selectedId === target) ? colors.nodeSelectedBorder : colors.link;
          }}
          linkWidth={(link) => {
            const source = typeof link.source === 'string' ? link.source : link.source.id;
            const target = typeof link.target === 'string' ? link.target : link.target.id;
            return selectedId && (selectedId === source || selectedId === target) ? 2.2 : 0.85;
          }}
          onNodeClick={(nodeRaw, event) => {
            const node = nodeRaw as DirectoryGraphNode;
            setSelectedId(node.id);
            setSelectedPoint(
              event
                ? { x: Number((event as MouseEvent).offsetX ?? canvasSize.width / 2), y: Number((event as MouseEvent).offsetY ?? canvasSize.height / 2) }
                : { x: canvasSize.width / 2, y: canvasSize.height / 2 }
            );
          }}
          onBackgroundClick={() => {
            setSelectedId(null);
            setSelectedPoint(null);
          }}
          enableNodeDrag
          nodePointerAreaPaint={(nodeRaw, color, ctx) => {
            const node = nodeRaw as DirectoryGraphNode & { x?: number; y?: number };
            const x = node.x ?? 0;
            const y = node.y ?? 0;
            const radius = 12 + Math.min(node.teamSize, 6);
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, 2 * Math.PI, false);
            ctx.fill();
          }}
        />
      </div>

      {selected && selectedPoint ? (
        <div
          className="absolute z-20 max-h-[70%] w-[min(92vw,360px)] overflow-auto rounded-2xl border bg-white p-4 shadow-[0_20px_50px_rgba(15,23,42,0.16)]"
          style={{
            borderColor: 'var(--org-brand-border)',
            background: 'var(--org-brand-surface)',
            left: `${Math.max(12, Math.min(selectedPoint.x + 14, canvasSize.width - 372))}px`,
            top: `${Math.max(12, Math.min(selectedPoint.y - 10, canvasSize.height - 420))}px`,
          }}
        >
          <p className="text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--org-brand-muted)' }}>
            Directory graph
          </p>
          <h3 className="mt-1 text-[15px] font-semibold" style={{ color: 'var(--org-brand-text)' }}>
            {selected.label}
          </h3>
          <p className="mt-1 text-[12px] leading-relaxed" style={{ color: 'var(--org-brand-muted)' }}>
            {selected.jobTitle}
          </p>

          <div
            className="mt-4 rounded-lg border p-3.5"
            style={{ borderColor: 'var(--org-brand-border)', background: 'var(--org-brand-bg)' }}
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--org-brand-muted)' }}>
              Selected node
            </p>
            <h4 className="mt-1 text-[14px] font-semibold" style={{ color: 'var(--org-brand-text)' }}>
              {selected.label}
            </h4>
            <p className="mt-1 text-[12px]" style={{ color: 'var(--org-brand-muted)' }}>
              {selected.jobTitle}
            </p>

            <dl className="mt-3 grid gap-2 text-[12px]">
            <div
              className="rounded-md border bg-white px-2.5 py-2"
              style={{ borderColor: 'var(--org-brand-border)', background: 'var(--org-brand-surface)' }}
            >
              <dt className="text-[10px] font-medium" style={{ color: 'var(--org-brand-muted)' }}>Email</dt>
              <dd className="mt-0.5 break-all" style={{ color: 'var(--org-brand-text)' }}>{selected.email}</dd>
            </div>
            <div
              className="rounded-md border bg-white px-2.5 py-2"
              style={{ borderColor: 'var(--org-brand-border)', background: 'var(--org-brand-surface)' }}
            >
              <dt className="text-[10px] font-medium" style={{ color: 'var(--org-brand-muted)' }}>Reports to</dt>
              <dd className="mt-0.5" style={{ color: 'var(--org-brand-text)' }}>{selected.managerName}</dd>
            </div>
            <div
              className="rounded-md border bg-white px-2.5 py-2"
              style={{ borderColor: 'var(--org-brand-border)', background: 'var(--org-brand-surface)' }}
            >
              <dt className="text-[10px] font-medium" style={{ color: 'var(--org-brand-muted)' }}>Direct reports</dt>
              <dd className="mt-0.5" style={{ color: 'var(--org-brand-text)' }}>{selected.teamSize}</dd>
            </div>
            <div
              className="rounded-md border bg-white px-2.5 py-2"
              style={{ borderColor: 'var(--org-brand-border)', background: 'var(--org-brand-surface)' }}
            >
              <dt className="text-[10px] font-medium" style={{ color: 'var(--org-brand-muted)' }}>Role and contract</dt>
              <dd className="mt-0.5 capitalize" style={{ color: 'var(--org-brand-text)' }}>
                {selected.role} · {selected.contract}
              </dd>
            </div>
            <div
              className="rounded-md border bg-white px-2.5 py-2"
              style={{ borderColor: 'var(--org-brand-border)', background: 'var(--org-brand-surface)' }}
            >
              <dt className="text-[10px] font-medium" style={{ color: 'var(--org-brand-muted)' }}>Location and departments</dt>
              <dd className="mt-0.5" style={{ color: 'var(--org-brand-text)' }}>
                {selected.location}
                {selected.departments.length ? ` · ${selected.departments.join(', ')}` : ''}
              </dd>
            </div>
            </dl>

          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href={`/hr/records/${selected.id}`}
              className="rounded-lg px-3 py-1.5 text-[11px] font-medium text-white"
              style={{ background: 'var(--org-brand-primary)' }}
            >
              Open employee record
            </Link>
          </div>
          </div>
        </div>
      ) : null}
      </div>
    </section>
  );
}
