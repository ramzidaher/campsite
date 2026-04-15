'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import type { ReactNode } from 'react';
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
  showDefaultNodeHrefAction?: boolean;
  renderSidebar?: (selected: GraphSectionNode | null) => ReactNode | undefined;
  hideHeader?: boolean;
  borderless?: boolean;
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
  onSelect: (id: string, point: { x: number; y: number }) => void;
  onClearSelection: () => void;
  colors: GraphColors;
}) {
  const fgRef = useRef<ForceGraphMethods<GraphNode, CanvasLink> | undefined>(undefined);
  const hasAutoFitRef = useRef(false);
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
  const linkTargetId = (link: { target?: string | number | { id?: string | number } }) => {
    if (typeof link.target === 'string' || typeof link.target === 'number') return String(link.target);
    return link.target?.id != null ? String(link.target.id) : '';
  };

  useEffect(() => {
    hasAutoFitRef.current = false;
  }, [nodes]);

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
        const radius = node.isCenter ? 30 : 20;
        const labels = wrapLabel(node.label, 18);
        const isSelected = selectedId === node.id;

        if (node.isCenter) {
          ctx.beginPath();
          ctx.arc(x, y, radius + 14, 0, 2 * Math.PI, false);
          ctx.fillStyle = 'rgba(244, 84, 97, 0.14)';
          ctx.fill();
          ctx.beginPath();
          ctx.arc(x, y, radius + 7, 0, 2 * Math.PI, false);
          ctx.fillStyle = 'rgba(244, 84, 97, 0.2)';
          ctx.fill();
          ctx.beginPath();
          ctx.arc(x, y, radius, 0, 2 * Math.PI, false);
          ctx.fillStyle = '#f45461';
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.arc(x, y, radius, 0, 2 * Math.PI, false);
          ctx.shadowColor = 'rgba(15, 23, 42, 0.14)';
          ctx.shadowBlur = 16;
          ctx.shadowOffsetY = 4;
          ctx.fillStyle = isSelected ? '#fff7f8' : '#ffffff';
          ctx.fill();
          ctx.shadowBlur = 0;
          ctx.shadowOffsetY = 0;
          ctx.lineWidth = isSelected ? 2 : 1.5;
          ctx.strokeStyle = isSelected ? '#f45461' : '#d6d8de';
          ctx.stroke();
        }

        const fontSize = Math.max(10, 12 / globalScale);
        ctx.font = `${node.isCenter ? 700 : 500} ${fontSize}px Inter, ui-sans-serif, system-ui, sans-serif`;
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
        const target = linkTargetId(link);
        return selectedId === target ? colors.nodeSelectedBorder : colors.link;
      }}
      linkWidth={(link) => {
        const target = linkTargetId(link);
        return selectedId === target ? 2.2 : 0.9;
      }}
      onNodeClick={(nodeRaw, event) => {
        const node = nodeRaw as GraphNode;
        if (!node.isCenter) {
          const point = event
            ? { x: Number((event as MouseEvent).offsetX ?? width / 2), y: Number((event as MouseEvent).offsetY ?? height / 2) }
            : { x: width / 2, y: height / 2 };
          onSelect(node.id, point);
        }
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
        if (hasAutoFitRef.current) return;
        hasAutoFitRef.current = true;
        fgRef.current?.zoomToFit(420, 22);
      }}
      linkDirectionalParticles={(link) => {
        const target = linkTargetId(link);
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
  showDefaultNodeHrefAction = true,
  renderSidebar,
  hideHeader = false,
  borderless = false,
}: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedPoint, setSelectedPoint] = useState<{ x: number; y: number } | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const floatingPanelRef = useRef<HTMLDivElement | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 900, height: 640 });
  const [colors, setColors] = useState<GraphColors>(DEFAULT_COLORS);
  const [panelPos, setPanelPos] = useState<{ left: number; top: number; width: number; maxHeight: number }>({
    left: 12,
    top: 12,
    width: 360,
    maxHeight: 420,
  });

  const selected = useMemo(
    () => (selectedId ? nodes.find((node) => node.id === selectedId) ?? null : null),
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
      const width = Math.max(320, Math.floor(el.clientWidth));
      const height = Math.max(420, Math.floor(el.clientHeight));
      setCanvasSize({
        width,
        height,
      });
    };
    update();
    const onWindowResize = () => {
      window.requestAnimationFrame(update);
    };
    window.addEventListener('resize', onWindowResize);
    return () => window.removeEventListener('resize', onWindowResize);
  }, []);

  useEffect(() => {
    if (!selectedId || !selectedPoint) return;
    const panelEl = floatingPanelRef.current;
    const width = Math.max(260, Math.min(360, canvasSize.width - 24));
    const maxHeight = Math.max(240, Math.min(Math.floor(canvasSize.height * 0.72), canvasSize.height - 24));
    const measuredHeight = panelEl ? Math.ceil(panelEl.getBoundingClientRect().height) : maxHeight;
    const effectiveHeight = Math.min(measuredHeight, maxHeight);
    const left = Math.max(12, Math.min(selectedPoint.x + 14, canvasSize.width - width - 12));
    const top = Math.max(12, Math.min(selectedPoint.y - 10, canvasSize.height - effectiveHeight - 12));
    setPanelPos({ left, top, width, maxHeight });
  }, [selectedId, selectedPoint, canvasSize.width, canvasSize.height]);

  return (
    <section
      className={
        fullScreen
          ? 'flex min-h-[calc(100vh-60px)] flex-col p-4 sm:p-5'
          : 'mt-5 rounded-2xl border border-[#d8d8d8] bg-white p-5 sm:p-6'
      }
      style={fullScreen ? { background: 'var(--org-brand-bg)' } : undefined}
    >
      {!hideHeader ? (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-[19px] font-semibold tracking-tight" style={{ color: 'var(--org-brand-text)' }}>{title}</h2>
            <p className="mt-1 text-[12px]" style={{ color: 'var(--org-brand-muted)' }}>{subtitle}</p>
          </div>
        </div>
      ) : null}

      <div className={fullScreen ? `${hideHeader ? 'mt-0' : 'mt-3'} flex-1` : 'mt-4'}>
        <div
          ref={canvasRef}
          className={
            fullScreen
              ? `relative overflow-hidden ${borderless ? 'h-[calc(100vh-92px)] rounded-none border-0' : 'h-[calc(100vh-142px)] rounded-xl border'}`
              : 'relative h-[520px] overflow-hidden rounded-xl border'
          }
          style={{
            borderColor: borderless ? 'transparent' : 'var(--org-brand-border)',
            background: 'var(--org-brand-surface)',
          }}
        >
          <PhysicsGraphCanvas
            width={canvasSize.width}
            height={canvasSize.height}
            nodes={graphNodes}
            selectedId={selectedId}
            onSelect={(id, point) => {
              setSelectedId(id);
              setSelectedPoint(point);
            }}
            onClearSelection={() => {
              setSelectedId(null);
              setSelectedPoint(null);
            }}
            colors={colors}
          />
          {selected && selectedPoint ? (
            <div
              ref={floatingPanelRef}
              className="absolute z-20 overflow-auto rounded-2xl border bg-white p-4 shadow-[0_20px_50px_rgba(15,23,42,0.16)]"
              style={{
                borderColor: 'var(--org-brand-border)',
                background: 'var(--org-brand-surface)',
                left: `${panelPos.left}px`,
                top: `${panelPos.top}px`,
                width: `${panelPos.width}px`,
                maxHeight: `${panelPos.maxHeight}px`,
              }}
            >
              {(() => {
                const customSidebar = renderSidebar?.(selected);
                if (customSidebar !== undefined) return customSidebar;
                return (
                  <>
                    <div className="mb-2 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-[#e7e7e9] bg-white text-[14px]">📁</span>
                        <h3 className="text-[16px] font-semibold" style={{ color: 'var(--org-brand-text)' }}>{selected.label}</h3>
                      </div>
                      <button
                        type="button"
                        aria-label="Close node panel"
                        onClick={() => {
                          setSelectedId(null);
                          setSelectedPoint(null);
                        }}
                        className="rounded-md px-1.5 py-0.5 text-[16px] leading-none text-[#9aa0ac] hover:bg-[#f3f4f6]"
                      >
                        ×
                      </button>
                    </div>
                    <p className="text-[12px] leading-relaxed" style={{ color: 'var(--org-brand-muted)' }}>{selected.description}</p>
                    <div
                      className="mt-3 rounded-xl border p-3"
                      style={{ borderColor: 'var(--org-brand-border)', background: 'var(--org-brand-bg)' }}
                    >
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
                        {showDefaultNodeHrefAction && selected.href ? (
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
                  </>
                );
              })()}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
