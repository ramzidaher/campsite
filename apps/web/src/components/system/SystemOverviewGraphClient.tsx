'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import type { SystemGraphEdge, SystemGraphNode } from '@/lib/systemOverview/buildSystemOverviewGraph';
import styles from './SystemOverviewGraphClient.module.css';

type Pos = { x: number; y: number; tx: number; ty: number };

const TIER_COLOR: Record<SystemGraphNode['tier'], string> = {
  ops: '#38bdf8',
  people: '#f472b6',
  hr: '#34d399',
  config: '#fbbf24',
};

export function SystemOverviewGraphClient({
  title,
  subtitle,
  nodes,
  edges,
}: {
  title: string;
  subtitle: string;
  nodes: SystemGraphNode[];
  edges: SystemGraphEdge[];
}) {
  const router = useRouter();
  const sceneRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const nodeRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const positionsRef = useRef<Record<string, Pos>>({});
  const draggingRef = useRef<{ id: string; sx: number; sy: number; ox: number; oy: number } | null>(null);
  const panningRef = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);

  const [showEdges, setShowEdges] = useState(true);
  const [vpX, setVpX] = useState(0);
  const [vpY, setVpY] = useState(0);
  const [vpScale, setVpScale] = useState(1);
  const [tick, setTick] = useState(0);

  const bump = useCallback(() => setTick((n) => n + 1), []);

  const grouped = useMemo(() => {
    const modules = nodes.filter((n) => n.group === 'module');
    const entities = nodes.filter((n) => n.group === 'entity');
    const metrics = nodes.filter((n) => n.group === 'metric');
    return [modules, entities, metrics];
  }, [nodes]);

  useEffect(() => {
    const next: Record<string, Pos> = {};
    const gapX = 220;
    const gapY = 190;
    grouped.forEach((group, row) => {
      const startX = 120;
      group.forEach((node, idx) => {
        const x = startX + idx * gapX;
        const y = 120 + row * gapY;
        next[node.id] = { x, y, tx: x, ty: y };
      });
    });
    positionsRef.current = next;
    setVpX(0);
    setVpY(0);
    setVpScale(1);
    bump();
  }, [bump, grouped]);

  const drawBg = useCallback(() => {
    const scene = sceneRef.current;
    const canvas = canvasRef.current;
    if (!scene || !canvas) return;
    canvas.width = scene.offsetWidth;
    canvas.height = scene.offsetHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const gs = 24;
    ctx.strokeStyle = 'rgba(255,255,255,0.03)';
    ctx.lineWidth = 0.5;
    for (let x = 0; x < canvas.width; x += gs) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += gs) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }
  }, []);

  useEffect(() => {
    drawBg();
    const onResize = () => {
      drawBg();
      bump();
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [bump, drawBg]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (draggingRef.current) {
        const { id, sx, sy, ox, oy } = draggingRef.current;
        const p = positionsRef.current[id];
        if (!p) return;
        const scale = 1 / vpScale;
        p.x = ox + (e.clientX - sx) * scale;
        p.y = oy + (e.clientY - sy) * scale;
        p.tx = p.x;
        p.ty = p.y;
        bump();
      }
      if (panningRef.current) {
        const { sx, sy, ox, oy } = panningRef.current;
        setVpX(ox - (e.clientX - sx));
        setVpY(oy - (e.clientY - sy));
      }
    };
    const onUp = () => {
      draggingRef.current = null;
      panningRef.current = null;
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, [bump, vpScale]);

  const nodeCenter = (id: string) => {
    const p = positionsRef.current[id];
    const el = nodeRefs.current[id];
    if (!p) return { x: 0, y: 0 };
    return { x: p.x + (el?.offsetWidth ?? 170) / 2, y: p.y + (el?.offsetHeight ?? 90) / 2 };
  };

  const edgePaths = useMemo(() => {
    if (!showEdges) return [];
    return edges.map((e) => {
      const a = nodeCenter(e.from);
      const b = nodeCenter(e.to);
      const my = (a.y + b.y) / 2;
      const tier = nodes.find((n) => n.id === e.from)?.tier ?? 'ops';
      return {
        key: `${e.from}-${e.to}`,
        d: `M${a.x},${a.y} C${a.x},${my} ${b.x},${my} ${b.x},${b.y}`,
        color: TIER_COLOR[tier],
      };
    });
  }, [edges, nodes, showEdges, tick, vpX, vpY, vpScale]);

  const transform = `translate(${-vpX}px,${-vpY}px) scale(${vpScale})`;

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <div>
          <h1>{title}</h1>
          <p>{subtitle}</p>
        </div>
      </div>
      <div className={styles.toolbar}>
        <button type="button" onClick={() => { setVpX(0); setVpY(0); setVpScale(1); }}>Reset view</button>
        <button type="button" onClick={() => setShowEdges((v) => !v)}>{showEdges ? 'Hide connections' : 'Show connections'}</button>
      </div>
      <div
        ref={sceneRef}
        className={styles.scene}
        onMouseDown={(e) => {
          const t = e.target as HTMLElement;
          if (t.closest(`.${styles.node}`)) return;
          panningRef.current = { sx: e.clientX, sy: e.clientY, ox: vpX, oy: vpY };
        }}
        onWheel={(e) => {
          e.preventDefault();
          const delta = e.deltaY > 0 ? 0.9 : 1.1;
          setVpScale((s) => Math.max(0.35, Math.min(2.4, s * delta)));
        }}
      >
        <canvas ref={canvasRef} className={styles.bg} />
        <svg className={styles.edges} style={{ transform }}>
          {edgePaths.map((e) => (
            <path key={e.key} d={e.d} fill="none" stroke={e.color} strokeWidth="0.9" opacity="0.24" />
          ))}
        </svg>
        <div className={styles.nodesLayer} style={{ transform }}>
          {nodes.map((n) => {
            const pos = positionsRef.current[n.id];
            if (!pos) return null;
            return (
              <div
                key={n.id}
                ref={(el) => {
                  nodeRefs.current[n.id] = el;
                }}
                className={styles.node}
                style={{ left: pos.x, top: pos.y }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                  draggingRef.current = { id: n.id, sx: e.clientX, sy: e.clientY, ox: pos.x, oy: pos.y };
                }}
              >
                <div className={styles.pip} style={{ background: TIER_COLOR[n.tier] }} />
                <div className={styles.name}>{n.label}</div>
                <div className={styles.meta}>{n.meta ?? n.group}</div>
                <button
                  type="button"
                  className={styles.go}
                  onClick={() => {
                    if (n.href) router.push(n.href);
                  }}
                  disabled={!n.href}
                >
                  {n.href ? 'open ->' : 'no route'}
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

