'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ForceGraphMethods } from 'react-force-graph-2d';

export type GraphAction = {
  id: string;
  label: string;
  href: string;
};

export type GraphSectionNode = {
  id: string;
  label: string;
  description: string;
  href?: string;
  facts?: Array<{ label: string; value: string }>;
  bulletPoints?: string[];
  actions?: GraphAction[];
};

type Props = {
  title: string;
  subtitle: string;
  centerLabel: string;
  centerDescription: string;
  nodes: GraphSectionNode[];
  fullScreen?: boolean;
};

type CanvasNode = {
  id: string;
  label: string;
  isCenter: boolean;
};

type CanvasLink = { source: string; target: string };
type GraphNode = CanvasNode & { x?: number; y?: number };

const ForceGraph2D = dynamic(() => import('react-force-graph-2d'), { ssr: false });

function wrapLabel(label: string, maxChars = 16): string[] {
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
  if (lines.length === 0) return [label.slice(0, maxChars)];
  if (lines.length > 1 && lines[1].length > maxChars) lines[1] = `${lines[1].slice(0, maxChars - 1)}…`;
  return lines.slice(0, 2);
}

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

function cssVar(name: string, fallback: string) {
  if (typeof window === 'undefined') return fallback;
  const value = window.getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function safeColor(value: string, fallback: string) {
  const v = value.trim();
  if (!v || v === '#') return fallback;
  return v;
}

function PhysicsGraphCanvas({
  width,
  height,
  nodes,
  selectedId,
  onSelect,
  onClearSelection,
  colors,
}: {
  width: number;
  height: number;
  nodes: CanvasNode[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onClearSelection: () => void;
  colors: GraphColors;
}) {
  const fgRef = useRef<ForceGraphMethods<GraphNode, CanvasLink>>();
  const graphData = useMemo(() => {
    const center = nodes.find((n) => n.isCenter);
    const leaves = nodes.filter((n) => !n.isCenter);
    return {
      nodes,
      links: center ? leaves.map((n) => ({ source: center.id, target: n.id })) : [],
    };
  }, [nodes]);

  const nodeColor = (node: GraphNode) => {
    if (node.isCenter) return colors.nodeCenterFill;
    if (selectedId === node.id) return colors.nodeSelectedFill;
    return colors.nodeDefaultFill;
  };

  const labelColor = (_node: GraphNode) => colors.text;

  return (
    <ForceGraph2D
      ref={fgRef as never}
      width={width}
      height={height}
      graphData={graphData}
      cooldownTicks={140}
      warmupTicks={80}
      d3AlphaDecay={0.04}
      d3VelocityDecay={0.32}
      nodeRelSize={8}
      nodeCanvasObject={(nodeRaw, ctx, globalScale) => {
        const node = nodeRaw as GraphNode;
        const x = node.x ?? 0;
        const y = node.y ?? 0;
        const radius = node.isCenter ? 22 : 14;
        const labels = wrapLabel(node.label, 18);

        ctx.beginPath();
        ctx.arc(x, y, radius, 0, 2 * Math.PI, false);
        ctx.shadowColor = 'rgba(18, 18, 18, 0.1)';
        ctx.shadowBlur = 6;
        ctx.shadowOffsetY = 1;
        ctx.fillStyle = nodeColor(node);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.shadowOffsetY = 0;

        ctx.lineWidth = node.isCenter ? 0 : selectedId === node.id ? 2 : 1.1;
        ctx.strokeStyle = selectedId === node.id ? colors.nodeSelectedBorder : colors.nodeDefaultBorder;
        if (!node.isCenter) ctx.stroke();

        const fontSize = Math.max(10, 12 / globalScale);
        ctx.font = `${node.isCenter ? 600 : 500} ${fontSize}px Inter, ui-sans-serif, system-ui, sans-serif`;
        ctx.fillStyle = labelColor(node);
        ctx.strokeStyle = 'rgba(250,249,246,0.95)';
        ctx.lineWidth = Math.max(1.5, 2.5 / globalScale);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const labelY = y + radius + 12;
        labels.forEach((line, idx) => {
          const ly = labelY + idx * (fontSize + 1.5);
          ctx.strokeText(line, x, ly);
          ctx.fillText(line, x, ly);
        });
      }}
      linkColor={(link) => {
        const target = typeof link.target === 'string' ? link.target : link.target.id;
        return selectedId === target ? colors.nodeSelectedBorder : colors.link;
      }}
      linkWidth={(link) => {
        const target = typeof link.target === 'string' ? link.target : link.target.id;
        return selectedId === target ? 2 : 1.1;
      }}
      onNodeClick={(nodeRaw) => {
        const node = nodeRaw as GraphNode;
        if (!node.isCenter) onSelect(node.id);
      }}
      onBackgroundClick={onClearSelection}
      onEngineTick={() => {
        const chargeForce = fgRef.current?.d3Force('charge') as { strength: (n: number) => void } | undefined;
        chargeForce?.strength(-260);
        const linkForce = fgRef.current?.d3Force('link') as
          | { distance: (n: number) => void; strength: (n: number) => void }
          | undefined;
        linkForce?.distance(180);
        linkForce?.strength(0.8);
      }}
      onEngineStop={() => {
        fgRef.current?.zoomToFit(420, 22);
      }}
      linkDirectionalParticles={(link) => {
        const target = typeof link.target === 'string' ? link.target : link.target.id;
        return selectedId === target ? 1 : 0;
      }}
      linkDirectionalParticleWidth={1.8}
      linkDirectionalParticleColor={() => colors.nodeSelectedBorder}
      enableNodeDrag
      nodePointerAreaPaint={(nodeRaw, color, ctx) => {
        const node = nodeRaw as GraphNode;
        const x = node.x ?? 0;
        const y = node.y ?? 0;
        const r = node.isCenter ? 22 : 16;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, 2 * Math.PI, false);
        ctx.fill();
      }}
      backgroundColor={colors.pageBg}
    />
  );
}

export function GraphExperience({
  title,
  subtitle,
  centerLabel,
  centerDescription,
  nodes,
  fullScreen = false,
}: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 900, height: 640 });
  const [colors, setColors] = useState<GraphColors>(DEFAULT_COLORS);

  const selected = useMemo(
    () => nodes.find((node) => node.id === selectedId) ?? nodes[0] ?? null,
    [nodes, selectedId]
  );

  const graphNodes = useMemo<CanvasNode[]>(
    () => [{ id: 'center-node', label: centerLabel, isCenter: true }, ...nodes.map((n) => ({ id: n.id, label: n.label, isCenter: false }))],
    [centerLabel, nodes]
  );

  useEffect(() => {
    const syncBranding = () => {
      const scopeEl = canvasRef.current ?? document.documentElement;
      const styles = window.getComputedStyle(scopeEl);
      const brandPrimary = safeColor(
        styles.getPropertyValue('--org-brand-primary') || cssVar('--org-brand-primary', DEFAULT_COLORS.nodeCenterFill),
        DEFAULT_COLORS.nodeCenterFill
      );
      const brandBg = safeColor(
        styles.getPropertyValue('--org-brand-bg') || cssVar('--org-brand-bg', DEFAULT_COLORS.pageBg),
        DEFAULT_COLORS.pageBg
      );
      const brandSurface = safeColor(
        styles.getPropertyValue('--org-brand-surface') || cssVar('--org-brand-surface', DEFAULT_COLORS.nodeDefaultFill),
        DEFAULT_COLORS.nodeDefaultFill
      );
      const brandBorder = safeColor(
        styles.getPropertyValue('--org-brand-border') || cssVar('--org-brand-border', DEFAULT_COLORS.nodeDefaultBorder),
        DEFAULT_COLORS.nodeDefaultBorder
      );
      const brandText = safeColor(
        styles.getPropertyValue('--org-brand-text') || cssVar('--org-brand-text', DEFAULT_COLORS.text),
        DEFAULT_COLORS.text
      );
      const brandMuted = safeColor(
        styles.getPropertyValue('--org-brand-muted') || cssVar('--org-brand-muted', DEFAULT_COLORS.textSecondary),
        DEFAULT_COLORS.textSecondary
      );
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
      const rect = el.getBoundingClientRect();
      setCanvasSize({
        width: Math.max(320, Math.floor(rect.width)),
        height: Math.max(420, Math.floor(rect.height)),
      });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <section
      className={
        fullScreen
          ? 'flex min-h-[calc(100vh-60px)] flex-col p-4 sm:p-5'
          : 'mt-5 rounded-2xl border border-[#d8d8d8] bg-white p-5 sm:p-6'
      }
      style={fullScreen ? { background: 'var(--org-brand-bg)' } : undefined}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[19px] font-semibold tracking-tight" style={{ color: 'var(--org-brand-text)' }}>{title}</h2>
          <p className="mt-1 text-[12px]" style={{ color: 'var(--org-brand-muted)' }}>{subtitle}</p>
        </div>
      </div>

      <div className={fullScreen ? 'mt-3 grid flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_360px]' : 'mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]'}>
        <div
          ref={canvasRef}
          className={
            fullScreen
              ? 'h-[calc(100vh-142px)] overflow-hidden rounded-xl border'
              : 'h-[520px] overflow-hidden rounded-xl border'
          }
          style={{
            borderColor: 'var(--org-brand-border)',
            background: 'var(--org-brand-surface)',
          }}
        >
          <PhysicsGraphCanvas
            width={canvasSize.width}
            height={canvasSize.height}
            nodes={graphNodes}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onClearSelection={() => setSelectedId(null)}
            colors={colors}
          />
        </div>

        {selected ? (
          <aside
            className="rounded-xl border bg-white p-4"
            style={{ borderColor: 'var(--org-brand-border)', background: 'var(--org-brand-surface)' }}
          >
            <p className="text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--org-brand-muted)' }}>
              Profile core
            </p>
            <h3 className="mt-1 text-[15px] font-semibold" style={{ color: 'var(--org-brand-text)' }}>{centerLabel}</h3>
            <p className="mt-1 text-[12px] leading-relaxed" style={{ color: 'var(--org-brand-muted)' }}>{centerDescription}</p>
            <div
              className="mt-4 rounded-lg border p-3.5"
              style={{ borderColor: 'var(--org-brand-border)', background: 'var(--org-brand-bg)' }}
            >
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em]" style={{ color: 'var(--org-brand-muted)' }}>
                Selected node
              </p>
              <h4 className="mt-1 text-[14px] font-semibold" style={{ color: 'var(--org-brand-text)' }}>{selected.label}</h4>
              <p className="mt-1 text-[12px]" style={{ color: 'var(--org-brand-muted)' }}>{selected.description}</p>
              {(selected.facts ?? []).length > 0 ? (
                <dl className="mt-3 grid gap-2 text-[12px]">
                  {(selected.facts ?? []).map((fact) => (
                    <div
                      key={`${selected.id}-${fact.label}`}
                      className="rounded-md border bg-white px-2.5 py-2"
                      style={{ borderColor: 'var(--org-brand-border)', background: 'var(--org-brand-surface)' }}
                    >
                      <dt className="text-[10px] font-medium" style={{ color: 'var(--org-brand-muted)' }}>{fact.label}</dt>
                      <dd className="mt-0.5 text-[12px]" style={{ color: 'var(--org-brand-text)' }}>{fact.value}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
              {(selected.bulletPoints ?? []).length > 0 ? (
                <ul className="mt-3 list-disc space-y-1 pl-4 text-[12px]" style={{ color: 'var(--org-brand-muted)' }}>
                  {(selected.bulletPoints ?? []).map((item) => (
                    <li key={`${selected.id}-${item}`}>{item}</li>
                  ))}
                </ul>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                {selected.href ? (
                  <Link
                    href={selected.href}
                    className="rounded-lg px-3 py-1.5 text-[11px] font-medium text-white"
                    style={{ background: 'var(--org-brand-primary)' }}
                  >
                    Open section
                  </Link>
                ) : null}
                {(selected.actions ?? []).map((action) => (
                  <Link
                    key={action.id}
                    href={action.href}
                    className="rounded-lg border bg-white px-3 py-1.5 text-[11px] font-medium"
                    style={{ borderColor: 'var(--org-brand-border)', color: 'var(--org-brand-text)' }}
                  >
                    {action.label}
                  </Link>
                ))}
              </div>
            </div>
          </aside>
        ) : null}
      </div>
    </section>
  );
}
