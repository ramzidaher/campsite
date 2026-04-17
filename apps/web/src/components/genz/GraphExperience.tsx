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
  pageBg: '#f6f3f1',
  nodeCenterFill: '#a65843',
  nodeDefaultFill: '#ffffff',
  nodeDefaultBorder: 'rgba(35,31,32,0.18)',
  nodeSelectedFill: '#fff9f7',
  nodeSelectedBorder: '#a65843',
  link: 'rgba(35,31,32,0.18)',
  text: '#231f20',
  textInverse: '#FFFFFF',
  textSecondary: '#746a65',
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
        const radius = node.isCenter ? 56 : 36;
        const labels = wrapLabel(node.label, 18);
        const isSelected = selectedId === node.id;

        if (node.isCenter) {
          ctx.beginPath();
          ctx.arc(x, y, radius + 20, 0, 2 * Math.PI, false);
          ctx.fillStyle = 'rgba(166,88,67,0.10)';
          ctx.fill();
          ctx.beginPath();
          ctx.arc(x, y, radius + 34, 0, 2 * Math.PI, false);
          ctx.fillStyle = 'rgba(166,88,67,0.06)';
          ctx.fill();

          const grad = ctx.createRadialGradient(x - 12, y - 14, radius * 0.2, x, y, radius);
          grad.addColorStop(0, '#e78d7a');
          grad.addColorStop(1, colors.nodeCenterFill);
          ctx.beginPath();
          ctx.arc(x, y, radius, 0, 2 * Math.PI, false);
          ctx.fillStyle = grad;
          ctx.fill();

          ctx.beginPath();
          ctx.arc(x, y, radius - 16, 0, 2 * Math.PI, false);
          ctx.fillStyle = 'rgba(255,255,255,0.22)';
          ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,0.26)';
          ctx.lineWidth = 1.1;
          ctx.stroke();
        } else {
          if (isSelected) {
            ctx.beginPath();
            ctx.arc(x, y, radius + 10, 0, 2 * Math.PI, false);
            ctx.fillStyle = 'rgba(166,88,67,0.14)';
            ctx.fill();
          }
          ctx.beginPath();
          ctx.arc(x, y, radius, 0, 2 * Math.PI, false);
          const rg = ctx.createRadialGradient(x - 10, y - 10, radius * 0.2, x, y, radius);
          rg.addColorStop(0, '#ffffff');
          rg.addColorStop(1, '#f0e8e4');
          ctx.fillStyle = rg;
          ctx.fill();
          ctx.lineWidth = 4;
          ctx.strokeStyle = isSelected ? colors.nodeSelectedBorder : '#111111';
          ctx.stroke();
        }

        const fontSize = node.isCenter ? Math.max(11, 12 / globalScale) : Math.max(11, 12 / globalScale);
        ctx.font = `${node.isCenter ? 700 : 600} ${fontSize}px Inter, ui-sans-serif, system-ui, sans-serif`;
        ctx.fillStyle = node.isCenter ? '#ffffff' : colors.text;
        ctx.strokeStyle = 'rgba(246,245,242,0.95)';
        ctx.lineWidth = Math.max(1.2, 2.1 / globalScale);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const labelY = node.isCenter ? y : y + radius + 18;
        labels.forEach((line, idx) => {
          const ly = labelY + idx * (fontSize + 2);
          if (!node.isCenter) ctx.strokeText(line, x, ly);
          ctx.fillText(line, x, ly);
        });
      }}
      linkColor={(link) => {
        const target = linkTargetId(link);
        return selectedId === target ? colors.nodeSelectedBorder : colors.link;
      }}
      linkWidth={(link) => {
        const target = linkTargetId(link);
        return selectedId === target ? 3 : 1.5;
      }}
      linkLineDash={(link) => {
        const target = linkTargetId(link);
        return selectedId === target ? [] : [9, 14];
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
        chargeForce?.strength(-420);
        const linkForce = fgRef.current?.d3Force('link') as
          | { distance: (n: number) => void; strength: (n: number) => void }
          | undefined;
        linkForce?.distance(250);
        linkForce?.strength(0.74);
      }}
      onEngineStop={() => {
        if (hasAutoFitRef.current) return;
        hasAutoFitRef.current = true;
        fgRef.current?.zoomToFit(420, 44);
      }}
      linkDirectionalParticles={(link) => {
        const target = linkTargetId(link);
        return selectedId === target ? 1 : 0;
      }}
      linkDirectionalParticleWidth={1.4}
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
      autoPauseRedraw={false}
      backgroundColor="rgba(0,0,0,0)"
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
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const floatingPanelRef = useRef<HTMLDivElement | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 900, height: 640 });
  const [colors, setColors] = useState<GraphColors>(DEFAULT_COLORS);
  const [panelPos, setPanelPos] = useState<{ left: number; top: number; width: number; maxHeight: number }>({
    left: 12,
    top: 12,
    width: 430,
    maxHeight: 520,
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
    if (!selectedId) return;
    const width = Math.max(320, Math.min(430, canvasSize.width - 32));
    const maxHeight = Math.max(280, Math.min(Math.floor(canvasSize.height * 0.68), canvasSize.height - 40));
    const left = Math.max(16, Math.floor((canvasSize.width - width) / 2));
    const top = Math.max(16, Math.floor((canvasSize.height - maxHeight) / 2));
    setPanelPos({ left, top, width, maxHeight });
  }, [selectedId, canvasSize.width, canvasSize.height]);

  return (
    <section
      className={fullScreen ? 'flex min-h-[calc(100vh-60px)] flex-col p-3 sm:p-4' : 'mt-5 rounded-[24px] border border-black/10 bg-white/70 p-3 sm:p-4'}
      style={{
        background:
          'linear-gradient(rgba(35,31,32,0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(35,31,32,0.07) 1px, transparent 1px), linear-gradient(180deg, #f6f3f1 0%, #efe8e3 100%)',
        backgroundSize: '56px 56px, 56px 56px, 100% 100%',
      }}
    >
      <div className={fullScreen ? 'flex-1' : 'mt-1'}>
        <div
          ref={canvasRef}
          className={
            fullScreen
              ? `relative overflow-hidden ${borderless ? 'h-[calc(100vh-92px)] rounded-none border-0' : 'h-[calc(100vh-104px)] rounded-[32px] border'}`
              : 'relative h-[700px] overflow-hidden rounded-[30px] border'
          }
          style={{
            borderColor: borderless ? 'transparent' : 'rgba(35,31,32,0.08)',
            background: 'rgba(255,255,255,0.18)',
            boxShadow: '0 30px 80px rgba(35,31,32,0.08)',
            backdropFilter: 'blur(8px)',
          }}
        >
          <div className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(circle_at_center,rgba(166,88,67,0.08)_0%,rgba(166,88,67,0.02)_24%,transparent_48%)]" />
          {!hideHeader ? (
            <div className="absolute left-6 right-6 top-6 z-10 flex flex-wrap items-start justify-between gap-3">
              <div className="rounded-[20px] border border-black/10 bg-white/85 px-4 py-3 shadow-[0_12px_30px_rgba(35,31,32,0.08)] backdrop-blur-[14px]">
                <h2 className="text-[18px] font-semibold leading-tight" style={{ color: 'var(--org-brand-text)' }}>{title}</h2>
                <p className="mt-1 max-w-[560px] text-[13px]" style={{ color: 'var(--org-brand-muted)' }}>{subtitle}</p>
              </div>
              <div className="flex flex-wrap items-center gap-3 rounded-[20px] border border-black/10 bg-white/85 px-4 py-3 text-[13px] shadow-[0_12px_30px_rgba(35,31,32,0.08)] backdrop-blur-[14px]">
                <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-black" />Available section</span>
                <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: 'var(--org-brand-primary)' }} />Selected section</span>
                <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-black/35" />Connected to profile</span>
              </div>
            </div>
          ) : null}
          <PhysicsGraphCanvas
            width={canvasSize.width}
            height={canvasSize.height}
            nodes={graphNodes}
            selectedId={selectedId}
            onSelect={(id, _point) => {
              setSelectedId(id);
            }}
            onClearSelection={() => {
              setSelectedId(null);
            }}
            colors={colors}
          />
          {selected ? (
            <div
              ref={floatingPanelRef}
              className="absolute z-20 overflow-auto rounded-[26px] border bg-white/90 p-0 shadow-[0_24px_60px_rgba(35,31,32,0.10)] backdrop-blur-[20px]"
              style={{
                borderColor: 'rgba(35,31,32,0.1)',
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
                    <div className="flex items-start justify-between gap-4 border-b border-black/10 px-5 py-4">
                      <div>
                        <div
                          className="mb-2 inline-flex items-center rounded-full px-3 py-1 text-[12px] font-bold"
                          style={{ background: 'color-mix(in srgb, var(--org-brand-primary) 16%, white)', color: 'var(--org-brand-primary)' }}
                        >
                          Sensitive records
                        </div>
                        <h3 className="text-[28px] font-semibold leading-tight" style={{ color: 'var(--org-brand-text)' }}>{selected.label}</h3>
                        <p className="mt-1 text-[14px] leading-relaxed" style={{ color: 'var(--org-brand-muted)' }}>{selected.description}</p>
                      </div>
                      <button
                        type="button"
                        aria-label="Close node panel"
                        onClick={() => {
                          setSelectedId(null);
                        }}
                        className="rounded-md px-1.5 py-0.5 text-[20px] leading-none text-[#9a908b] hover:bg-[#f3f4f6]"
                      >
                        ×
                      </button>
                    </div>
                    <div className="grid gap-3 px-5 py-4">
                      {(selected.facts ?? []).length > 0 ? (
                        <dl className="grid grid-cols-2 gap-3 text-[12px]">
                          {(selected.facts ?? []).map((fact) => (
                            <div
                              key={`${selected.id}-${fact.label}`}
                              className="rounded-[18px] border px-3 py-3"
                              style={{ borderColor: 'rgba(35,31,32,0.10)', background: 'rgba(246,243,241,0.92)' }}
                            >
                              <dt className="text-[11px] font-medium" style={{ color: 'var(--org-brand-muted)' }}>{fact.label}</dt>
                              <dd className="mt-1 text-[22px] font-semibold leading-none" style={{ color: 'var(--org-brand-text)' }}>{fact.value}</dd>
                            </div>
                          ))}
                        </dl>
                      ) : null}
                      {(selected.bulletPoints ?? []).length > 0 ? (
                        <ul className="list-disc space-y-1.5 pl-5 text-[13px]" style={{ color: 'var(--org-brand-muted)' }}>
                          {(selected.bulletPoints ?? []).map((item) => (
                            <li key={`${selected.id}-${item}`}>{item}</li>
                          ))}
                        </ul>
                      ) : null}
                      <div className="mt-1 flex flex-wrap gap-2">
                        {showDefaultNodeHrefAction && selected.href ? (
                          <Link
                            href={selected.href}
                            className="rounded-[14px] px-4 py-2.5 text-[13px] font-semibold text-white"
                            style={{ background: 'var(--org-brand-primary)', boxShadow: '0 12px 24px rgba(166,88,67,0.22)' }}
                          >
                            Open section
                          </Link>
                        ) : null}
                        {(selected.actions ?? []).map((action) => (
                          <Link
                            key={action.id}
                            href={action.href}
                            className="rounded-[14px] border bg-white px-4 py-2.5 text-[13px] font-semibold"
                            style={{ borderColor: 'rgba(35,31,32,0.12)', color: 'var(--org-brand-text)' }}
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
