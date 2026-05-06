'use client';

import { useMemo } from 'react';

import type { SystemGraphEdge, SystemGraphNode } from '@/lib/systemOverview/buildSystemOverviewGraph';
import RadialOrbitalTimeline, { type TimelineItem } from '@/components/ui/radial-orbital-timeline';

function iconForNode(node: SystemGraphNode): TimelineItem['iconKey'] {
  if (node.group === 'metric') return 'sparkles';
  if (node.tier === 'people') return node.group === 'entity' ? 'users' : 'user';
  if (node.tier === 'ops') return node.label.toLowerCase().includes('rota') ? 'calendar' : 'briefcase';
  if (node.tier === 'config') return 'shield';
  if (node.label.toLowerCase().includes('interview')) return 'handshake';
  if (node.label.toLowerCase().includes('template')) return 'file';
  return 'briefcase';
}

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
  const timelineData = useMemo<TimelineItem[]>(() => {
    const idByNode = new Map<string, number>(nodes.map((node, idx) => [node.id, idx + 1]));
    const relatedByNode = new Map<string, Set<number>>();
    for (const edge of edges) {
      const from = idByNode.get(edge.from);
      const to = idByNode.get(edge.to);
      if (!from || !to) continue;
      if (!relatedByNode.has(edge.from)) relatedByNode.set(edge.from, new Set());
      if (!relatedByNode.has(edge.to)) relatedByNode.set(edge.to, new Set());
      relatedByNode.get(edge.from)!.add(to);
      relatedByNode.get(edge.to)!.add(from);
    }
    return nodes.map((node, index) => {
      const relatedIds = [...(relatedByNode.get(node.id) ?? new Set<number>())];
      return {
        id: index + 1,
        title: node.label,
        date: node.group.toUpperCase(),
        content: node.meta ?? `${node.tier} capability`,
        category: node.group,
        iconKey: iconForNode(node),
        relatedIds,
        status:
          node.group === 'module'
            ? ('completed' as const)
            : node.group === 'entity'
              ? ('in-progress' as const)
              : ('pending' as const),
        energy: node.group === 'module' ? 88 : node.group === 'entity' ? 70 : 54,
      };
    });
  }, [edges, nodes]);

  return (
    <div className="mx-auto max-w-7xl px-5 py-7 sm:px-[28px]">
      <div className="mb-4">
        <h1 className="font-authSerif text-[26px] leading-tight tracking-[-0.03em] text-[#121212]">{title}</h1>
        <p className="mt-1 text-[13px] text-[#6b6b6b]">{subtitle}</p>
      </div>
      <RadialOrbitalTimeline timelineData={timelineData} showEnergy={false} />
    </div>
  );
}

