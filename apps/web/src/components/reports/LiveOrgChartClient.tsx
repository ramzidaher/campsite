'use client';

import { EmployeeQuickViewModal } from '@/components/admin/hr/EmployeeQuickViewModal';
import { useUiModePreference } from '@/hooks/useUiModePreference';
import { getNodePulseClass, type OrgChartLiveNode } from '@/lib/reports/orgChart';
import { useEffect, useMemo, useState } from 'react';
import styles from './LiveOrgChartClient.module.css';

type PositionedNode = OrgChartLiveNode & { x: number; y: number };

const CARD_W = 196;
const CARD_H = 94;
const X_GAP = 42;
const Y_GAP = 120;
const PADDING = 24;

function buildLevels(nodes: OrgChartLiveNode[]) {
  const byId = new Map(nodes.map((n) => [n.user_id, n]));
  const children = new Map<string, string[]>();
  const indegree = new Map<string, number>();
  for (const n of nodes) {
    children.set(n.user_id, []);
    indegree.set(n.user_id, 0);
  }
  for (const n of nodes) {
    if (n.reports_to_user_id && byId.has(n.reports_to_user_id)) {
      children.get(n.reports_to_user_id)?.push(n.user_id);
      indegree.set(n.user_id, (indegree.get(n.user_id) ?? 0) + 1);
    }
  }

  const roots = nodes
    .filter((n) => (indegree.get(n.user_id) ?? 0) === 0)
    .sort((a, b) => a.display_name.localeCompare(b.display_name));
  const level = new Map<string, number>();
  const q = roots.map((r) => r.user_id);
  for (const root of roots) level.set(root.user_id, 0);
  while (q.length > 0) {
    const parent = q.shift();
    if (!parent) break;
    const pLevel = level.get(parent) ?? 0;
    const kids = (children.get(parent) ?? []).slice().sort((a, b) => {
      const aa = byId.get(a)?.display_name ?? '';
      const bb = byId.get(b)?.display_name ?? '';
      return aa.localeCompare(bb);
    });
    for (const child of kids) {
      if (!level.has(child)) {
        level.set(child, pLevel + 1);
        q.push(child);
      }
    }
  }
  for (const node of nodes) if (!level.has(node.user_id)) level.set(node.user_id, 0);
  return level;
}

function layoutNodes(nodes: OrgChartLiveNode[]): PositionedNode[] {
  const levelById = buildLevels(nodes);
  const perLevel = new Map<number, OrgChartLiveNode[]>();
  for (const node of nodes) {
    const l = levelById.get(node.user_id) ?? 0;
    const list = perLevel.get(l) ?? [];
    list.push(node);
    perLevel.set(l, list);
  }

  const out: PositionedNode[] = [];
  const levels = [...perLevel.keys()].sort((a, b) => a - b);
  for (const l of levels) {
    const list = (perLevel.get(l) ?? []).slice().sort((a, b) => a.display_name.localeCompare(b.display_name));
    for (let i = 0; i < list.length; i += 1) {
      out.push({
        ...list[i],
        x: PADDING + i * (CARD_W + X_GAP),
        y: PADDING + l * (CARD_H + Y_GAP),
      });
    }
  }
  return out;
}

export function LiveOrgChartClient({
  initialNodes,
  initialUiMode,
}: {
  initialNodes: OrgChartLiveNode[];
  initialUiMode: 'classic' | 'interactive';
}) {
  const [nodes, setNodes] = useState<OrgChartLiveNode[]>(initialNodes);
  const [selectedNode, setSelectedNode] = useState<OrgChartLiveNode | null>(null);
  const { uiMode } = useUiModePreference(initialUiMode);
  const interactive = uiMode === 'interactive';

  const positioned = useMemo(() => layoutNodes(nodes), [nodes]);
  const positionedById = useMemo(() => new Map(positioned.map((n) => [n.user_id, n])), [positioned]);
  const width = useMemo(() => {
    const maxX = positioned.reduce((acc, n) => Math.max(acc, n.x), 0);
    return Math.max(980, maxX + CARD_W + PADDING);
  }, [positioned]);
  const height = useMemo(() => {
    const maxY = positioned.reduce((acc, n) => Math.max(acc, n.y), 0);
    return Math.max(560, maxY + CARD_H + PADDING);
  }, [positioned]);

  useEffect(() => {
    if (!interactive) return;
    let cancelled = false;
    let authUnavailable = false;
    let refreshInFlight = false;
    let touchInFlight = false;

    const shouldPauseLiveCalls = (status: number) => status === 401 || status === 403;

    const refresh = async () => {
      if (cancelled || authUnavailable || refreshInFlight) return;
      refreshInFlight = true;
      try {
        const res = await fetch('/api/org-chart/live', { cache: 'no-store', credentials: 'include' });
        if (cancelled) return;
        if (!res.ok) {
          if (shouldPauseLiveCalls(res.status)) authUnavailable = true;
          return;
        }
        const json = (await res.json()) as { nodes?: OrgChartLiveNode[] };
        if (Array.isArray(json.nodes) && !cancelled) setNodes(json.nodes);
      } catch {
        return;
      } finally {
        refreshInFlight = false;
      }
    };

    const touch = async () => {
      if (cancelled || authUnavailable || touchInFlight) return;
      touchInFlight = true;
      await fetch('/api/presence/touch', {
        method: 'POST',
        credentials: 'include',
      })
        .then((res) => {
          if (shouldPauseLiveCalls(res.status)) authUnavailable = true;
        })
        .catch(() => undefined)
        .finally(() => {
          touchInFlight = false;
        });
    };

    void refresh();
    void touch();
    const refreshTimer = window.setInterval(() => void refresh(), 45000);
    const touchTimer = window.setInterval(() => {
      if (!document.hidden) void touch();
    }, 60000);

    const onVisible = () => {
      if (!document.hidden) {
        void touch();
        void refresh();
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      window.clearInterval(refreshTimer);
      window.clearInterval(touchTimer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [interactive]);

  return (
    <div className={`${styles.wrap} ${interactive ? styles.interactive : ''}`}>
      <div className={styles.toolbar}>
        <div className="text-[12px] text-[#6b6b6b]">
          {interactive ? 'Interactive mode ON: status pulses are live.' : 'Interactive mode OFF: static chart view.'}
        </div>
        <div className={styles.legend}>
          <span><i className={styles.dot} style={{ background: '#16a34a' }} />On shift</span>
          <span><i className={styles.dot} style={{ background: '#d97706' }} />Pending approvals</span>
          <span><i className={styles.dot} style={{ background: '#94a3b8' }} />Offline/inactive</span>
        </div>
      </div>
      <div className={styles.graph} style={{ width, height }}>
        <svg className={styles.edgeLayer} width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
          {positioned.map((node) => {
            if (!node.reports_to_user_id) return null;
            const parent = positionedById.get(node.reports_to_user_id);
            if (!parent) return null;
            const x1 = parent.x + CARD_W / 2;
            const y1 = parent.y + CARD_H;
            const x2 = node.x + CARD_W / 2;
            const y2 = node.y;
            const midY = y1 + (y2 - y1) / 2;
            return (
              <path
                key={`${parent.user_id}-${node.user_id}`}
                d={`M ${x1} ${y1} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2}`}
                fill="none"
                stroke="rgba(100,116,139,0.45)"
                strokeWidth="1.2"
              />
            );
          })}
        </svg>
        {positioned.map((node) => {
          const pulseClass = getNodePulseClass(node.live_status);
          const isOffline = node.live_status === 'offline';
          return (
            <button
              key={node.user_id}
              type="button"
              className={`${styles.node} ${styles.interactiveNode} ${interactive ? '' : ''} ${isOffline ? styles.offline : ''}`}
              style={{ left: node.x, top: node.y }}
              onClick={() => setSelectedNode(node)}
            >
              {interactive ? <span className={`${styles.pulse} ${styles[pulseClass]}`} /> : null}
              <div className={styles.name}>{node.display_name}</div>
              <div className={styles.meta}>{node.job_title?.trim() || node.role}</div>
              <div className={styles.dept}>
                {node.department_names?.length ? node.department_names.slice(0, 2).join(' · ') : 'Unassigned'}
              </div>
            </button>
          );
        })}
      </div>

      <EmployeeQuickViewModal
        open={Boolean(selectedNode)}
        onClose={() => setSelectedNode(null)}
        backLabel="Org chart"
        title={selectedNode?.display_name ?? ''}
        subtitle={selectedNode?.job_title ?? selectedNode?.role ?? ''}
      >
        {selectedNode ? (
          <div className="grid grid-cols-1 gap-3 text-[13px] text-[#242424] sm:grid-cols-2">
            <div><strong>Role:</strong> {selectedNode.role}</div>
            <div><strong>Manager:</strong> {selectedNode.reports_to_name ?? ''}</div>
            <div><strong>Department:</strong> {selectedNode.department_names?.join(', ') || ''}</div>
            <div><strong>Email:</strong> {selectedNode.email ?? ''}</div>
            <div><strong>Status:</strong> {selectedNode.live_status.replaceAll('_', ' ')}</div>
            <div><strong>Last seen:</strong> {selectedNode.last_seen_at ? new Date(selectedNode.last_seen_at).toLocaleString() : ''}</div>
          </div>
        ) : null}
      </EmployeeQuickViewModal>
    </div>
  );
}
