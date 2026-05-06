'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  CSSProperties,
  MouseEvent as ReactMouseEvent,
  TouchEvent as ReactTouchEvent,
  WheelEvent as ReactWheelEvent,
} from 'react';
import styles from './OrgChartClient.module.css';

type OrgChartRow = {
  user_id: string;
  full_name: string;
  preferred_name?: string | null;
  display_name?: string | null;
  email: string | null;
  role: string;
  reports_to_user_id: string | null;
  reports_to_name: string | null;
  department_names: string[];
  job_title: string | null;
  work_location: string | null;
};

type Position = {
  x: number;
  y: number;
  tx: number;
  ty: number;
};

type NodeConfig = {
  id: string;
  label: string;
  tier: string;
  tc: string;
  row: OrgChartRow;
};

const COLORS: Record<string, string> = {
  't-board': '#7c3aed',
  't-csuite': '#0284c7',
  't-slt': '#059669',
  't-mid': '#d97706',
  't-senior': '#0d9488',
  't-core': '#be185d',
  't-junior': '#64748b',
};

const EDGE_STROKE = '#94a3b8';

/** Live directory: HR job title drives band + card subtitle; tenant `profiles.role` only when no HR row. */
function tenantRoleTier(role: string): { tier: string; tc: string } | null {
  const r = role.toLowerCase().trim();
  const map: Record<string, { tier: string; tc: string }> = {
    org_admin: { tier: 'Organisation admin', tc: 't-board' },
    manager: { tier: 'Manager', tc: 't-mid' },
    coordinator: { tier: 'Coordinator', tc: 't-core' },
    administrator: { tier: 'Administrator', tc: 't-core' },
    duty_manager: { tier: 'Duty manager', tc: 't-mid' },
    csa: { tier: 'Staff', tc: 't-core' },
    society_leader: { tier: 'Society leader', tc: 't-slt' },
    unassigned: { tier: 'Unassigned', tc: 't-junior' },
  };
  return map[r] ?? null;
}

function tenantRoleLabel(role: string): string | null {
  const t = tenantRoleTier(role);
  return t?.tier ?? null;
}

/** Bands from real job titles (seeded HR). */
function tierBandFromJobTitle(title: string): { tier: string; tc: string } {
  const t = title.toLowerCase();
  if (/\bceo\b|chief executive|deputy\s+ceo/i.test(title)) return { tier: 'Executive', tc: 't-csuite' };
  if (/\bcfo\b|\bcto\b|\bcoo\b|\bcmo\b|\bchro\b|\bcio\b/i.test(t)) return { tier: 'Executive', tc: 't-csuite' };
  if (/\bchief\b/i.test(t)) return { tier: 'Executive', tc: 't-csuite' };
  if (/\bhead of\b|\bdirector\b/i.test(t) && !/assistant\s+director/i.test(t)) {
    return { tier: 'Leadership', tc: 't-slt' };
  }
  if (/manager|supervisor/i.test(t)) return { tier: 'Management', tc: 't-mid' };
  if (/senior|principal/i.test(t)) return { tier: 'Senior', tc: 't-senior' };
  if (/intern|trainee|\bjunior\b/i.test(t)) return { tier: 'Early career', tc: 't-junior' };
  return { tier: 'Team', tc: 't-core' };
}

function getVisualTier(row: OrgChartRow): { tier: string; tc: string } {
  if (row.user_id.startsWith('demo-')) {
    return getTierDemoPreset(row.role);
  }
  const jt = row.job_title?.trim();
  if (jt) return tierBandFromJobTitle(jt);
  return tenantRoleTier(row.role) ?? { tier: 'Team', tc: 't-core' };
}

/** Sample hierarchy only  uses role *keys* like ceo, head_ops; avoids substring false-positives (e.g. coordinator vs coo). */
function getTierDemoPreset(role: string): { tier: string; tc: string } {
  const r = role.toLowerCase().trim();
  if (r.includes('board') || r.includes('chair')) return { tier: 'Board', tc: 't-board' };
  if (['ceo', 'cfo', 'cto', 'coo', 'cmo', 'chro'].includes(r)) return { tier: 'C-Suite', tc: 't-csuite' };
  if (r.includes('head') || (r.includes('lead') && r !== 'society_leader')) return { tier: 'Senior Leadership', tc: 't-slt' };
  if (r.includes('manager')) return { tier: 'Middle Management', tc: 't-mid' };
  if (r.includes('senior') || r.includes('principal')) return { tier: 'Senior Staff', tc: 't-senior' };
  if (r.includes('junior') || r.includes('intern') || r.includes('trainee') || r.includes('assistant')) {
    return { tier: 'Junior / Support', tc: 't-junior' };
  }
  return { tier: 'Core Staff', tc: 't-core' };
}

const DEMO_ROWS: OrgChartRow[] = [
  { user_id: 'demo-board', full_name: 'Board of Directors', email: null, role: 'board', reports_to_user_id: null, reports_to_name: null, department_names: ['Executive'], job_title: 'Board', work_location: 'office' },
  { user_id: 'demo-chair', full_name: 'Chairperson', email: null, role: 'chair', reports_to_user_id: null, reports_to_name: null, department_names: ['Executive'], job_title: 'Board', work_location: 'office' },
  { user_id: 'demo-ceo', full_name: 'Chief Executive Officer (CEO)', email: null, role: 'ceo', reports_to_user_id: 'demo-board', reports_to_name: 'Board of Directors', department_names: ['Executive'], job_title: 'C-Suite', work_location: 'office' },
  { user_id: 'demo-coo', full_name: 'Chief Operating Officer (COO)', email: null, role: 'coo', reports_to_user_id: 'demo-ceo', reports_to_name: 'Chief Executive Officer (CEO)', department_names: ['Operations'], job_title: 'C-Suite', work_location: 'office' },
  { user_id: 'demo-cfo', full_name: 'Chief Financial Officer (CFO)', email: null, role: 'cfo', reports_to_user_id: 'demo-ceo', reports_to_name: 'Chief Executive Officer (CEO)', department_names: ['Finance'], job_title: 'C-Suite', work_location: 'office' },
  { user_id: 'demo-cto', full_name: 'Chief Technology Officer (CTO)', email: null, role: 'cto', reports_to_user_id: 'demo-ceo', reports_to_name: 'Chief Executive Officer (CEO)', department_names: ['Technology'], job_title: 'C-Suite', work_location: 'office' },
  { user_id: 'demo-cmo', full_name: 'Chief Marketing Officer (CMO)', email: null, role: 'cmo', reports_to_user_id: 'demo-ceo', reports_to_name: 'Chief Executive Officer (CEO)', department_names: ['Marketing'], job_title: 'C-Suite', work_location: 'office' },
  { user_id: 'demo-chro', full_name: 'Chief Human Resources Officer (CHRO / HR Director)', email: null, role: 'chro', reports_to_user_id: 'demo-ceo', reports_to_name: 'Chief Executive Officer (CEO)', department_names: ['People'], job_title: 'C-Suite', work_location: 'office' },
  { user_id: 'demo-head-ops', full_name: 'Head of Operations', email: null, role: 'head_ops', reports_to_user_id: 'demo-coo', reports_to_name: 'Chief Operating Officer (COO)', department_names: ['Operations'], job_title: 'Senior Leadership', work_location: 'office' },
  { user_id: 'demo-head-fin', full_name: 'Head of Finance / Finance Manager', email: null, role: 'head_finance', reports_to_user_id: 'demo-cfo', reports_to_name: 'Chief Financial Officer (CFO)', department_names: ['Finance'], job_title: 'Senior Leadership', work_location: 'office' },
  { user_id: 'demo-head-hr', full_name: 'Head of HR / HR Manager', email: null, role: 'head_hr', reports_to_user_id: 'demo-chro', reports_to_name: 'Chief Human Resources Officer (CHRO / HR Director)', department_names: ['People'], job_title: 'Senior Leadership', work_location: 'office' },
  { user_id: 'demo-head-it', full_name: 'Head of IT / IT Manager', email: null, role: 'head_it', reports_to_user_id: 'demo-cto', reports_to_name: 'Chief Technology Officer (CTO)', department_names: ['Technology'], job_title: 'Senior Leadership', work_location: 'office' },
  { user_id: 'demo-head-sales', full_name: 'Head of Sales / Sales Director', email: null, role: 'head_sales', reports_to_user_id: 'demo-coo', reports_to_name: 'Chief Operating Officer (COO)', department_names: ['Sales'], job_title: 'Senior Leadership', work_location: 'office' },
  { user_id: 'demo-head-mkt', full_name: 'Head of Marketing', email: null, role: 'head_mkt', reports_to_user_id: 'demo-cmo', reports_to_name: 'Chief Marketing Officer (CMO)', department_names: ['Marketing'], job_title: 'Senior Leadership', work_location: 'office' },
  { user_id: 'demo-head-prod', full_name: 'Head of Product', email: null, role: 'head_prod', reports_to_user_id: 'demo-cto', reports_to_name: 'Chief Technology Officer (CTO)', department_names: ['Product'], job_title: 'Senior Leadership', work_location: 'office' },
  { user_id: 'demo-dept-mgr', full_name: 'Department Managers', email: null, role: 'dept_manager', reports_to_user_id: 'demo-head-ops', reports_to_name: 'Head of Operations', department_names: ['Operations'], job_title: 'Middle Management', work_location: 'office' },
  { user_id: 'demo-team-mgr', full_name: 'Team Managers', email: null, role: 'team_manager', reports_to_user_id: 'demo-head-sales', reports_to_name: 'Head of Sales / Sales Director', department_names: ['Sales'], job_title: 'Middle Management', work_location: 'office' },
  { user_id: 'demo-proj-mgr', full_name: 'Project Managers', email: null, role: 'project_manager', reports_to_user_id: 'demo-head-prod', reports_to_name: 'Head of Product', department_names: ['Product'], job_title: 'Middle Management', work_location: 'office' },
  { user_id: 'demo-ops-mgr', full_name: 'Operations Managers', email: null, role: 'ops_manager', reports_to_user_id: 'demo-head-ops', reports_to_name: 'Head of Operations', department_names: ['Operations'], job_title: 'Middle Management', work_location: 'office' },
  { user_id: 'demo-sen-dev', full_name: 'Senior Developers', email: null, role: 'senior_developer', reports_to_user_id: 'demo-team-mgr', reports_to_name: 'Team Managers', department_names: ['Technology'], job_title: 'Senior Staff', work_location: 'hybrid' },
  { user_id: 'demo-sen-anl', full_name: 'Senior Analysts', email: null, role: 'senior_analyst', reports_to_user_id: 'demo-dept-mgr', reports_to_name: 'Department Managers', department_names: ['Operations'], job_title: 'Senior Staff', work_location: 'office' },
  { user_id: 'demo-sen-acc', full_name: 'Senior Accountants', email: null, role: 'senior_accountant', reports_to_user_id: 'demo-head-fin', reports_to_name: 'Head of Finance / Finance Manager', department_names: ['Finance'], job_title: 'Senior Staff', work_location: 'office' },
  { user_id: 'demo-sen-eng', full_name: 'Senior Engineers', email: null, role: 'senior_engineer', reports_to_user_id: 'demo-team-mgr', reports_to_name: 'Team Managers', department_names: ['Technology'], job_title: 'Senior Staff', work_location: 'hybrid' },
  { user_id: 'demo-dev', full_name: 'Developers / Engineers', email: null, role: 'developer', reports_to_user_id: 'demo-sen-dev', reports_to_name: 'Senior Developers', department_names: ['Technology'], job_title: 'Core Staff', work_location: 'hybrid' },
  { user_id: 'demo-it-admin', full_name: 'IT Admins / DevOps Engineers', email: null, role: 'it_admin', reports_to_user_id: 'demo-head-it', reports_to_name: 'Head of IT / IT Manager', department_names: ['Technology'], job_title: 'Core Staff', work_location: 'hybrid' },
  { user_id: 'demo-hr-officer', full_name: 'HR Officers', email: null, role: 'hr_officer', reports_to_user_id: 'demo-head-hr', reports_to_name: 'Head of HR / HR Manager', department_names: ['People'], job_title: 'Core Staff', work_location: 'office' },
  { user_id: 'demo-mkt-exec', full_name: 'Marketing Executives', email: null, role: 'marketing_exec', reports_to_user_id: 'demo-head-mkt', reports_to_name: 'Head of Marketing', department_names: ['Marketing'], job_title: 'Core Staff', work_location: 'hybrid' },
  { user_id: 'demo-sales-exec', full_name: 'Sales Executives', email: null, role: 'sales_exec', reports_to_user_id: 'demo-head-sales', reports_to_name: 'Head of Sales / Sales Director', department_names: ['Sales'], job_title: 'Core Staff', work_location: 'office' },
  { user_id: 'demo-fin-officer', full_name: 'Finance Officers', email: null, role: 'finance_officer', reports_to_user_id: 'demo-head-fin', reports_to_name: 'Head of Finance / Finance Manager', department_names: ['Finance'], job_title: 'Core Staff', work_location: 'office' },
  { user_id: 'demo-coordinator', full_name: 'Coordinators', email: null, role: 'coordinator', reports_to_user_id: 'demo-ops-mgr', reports_to_name: 'Operations Managers', department_names: ['Operations'], job_title: 'Junior / Support', work_location: 'office' },
  { user_id: 'demo-assistant', full_name: 'Assistants', email: null, role: 'assistant', reports_to_user_id: 'demo-hr-officer', reports_to_name: 'HR Officers', department_names: ['People'], job_title: 'Junior / Support', work_location: 'office' },
  { user_id: 'demo-junior', full_name: 'Junior Staff', email: null, role: 'junior', reports_to_user_id: 'demo-dev', reports_to_name: 'Developers / Engineers', department_names: ['Technology'], job_title: 'Junior / Support', work_location: 'office' },
  { user_id: 'demo-intern', full_name: 'Interns / Trainees', email: null, role: 'intern', reports_to_user_id: 'demo-it-admin', reports_to_name: 'IT Admins / DevOps Engineers', department_names: ['Technology'], job_title: 'Junior / Support', work_location: 'office' },
];

function primaryDepartment(row: OrgChartRow): string {
  if (!row.department_names?.length) return 'Unassigned';
  return [...row.department_names].sort((a, b) => a.localeCompare(b))[0];
}

function rowName(row: OrgChartRow): string {
  return row.display_name ?? row.full_name;
}

function rowNameOrBlank(row: OrgChartRow | undefined): string {
  return row ? rowName(row) : '';
}

const CARD_W = 150;
const CARD_H = 74;

/** Tight overlap / same-row fallback (rare after tree-by-depth layout). */
function fallbackVerticalConnector(fx: number, fy: number, tx: number, ty: number): string {
  const my = ty <= fy + 6 ? (fy + ty) / 2 : Math.max(fy + 18, Math.min(ty - 18, fy + (ty - fy) * 0.45));
  return `M${fx},${fy} C${fx},${my} ${tx},${my} ${tx},${ty}`;
}

/** Classic org-chart orthogonal routing (vertical → horizontal bus → vertical). */
function orthoConnector(fx: number, fy: number, tx: number, ty: number, yBus: number): string {
  if (ty <= fy + 2) return fallbackVerticalConnector(fx, fy, tx, ty);
  const mid = Math.min(Math.max(yBus, fy + 6), ty - 6);
  if (Math.abs(fx - tx) < 2) return `M${fx},${fy} L${fx},${ty}`;
  return `M${fx},${fy} L${fx},${mid} L${tx},${mid} L${tx},${ty}`;
}

const TREE_MARGIN_TOP = 52;
const TREE_LEVEL_GAP = 148;
const SIBLING_SUBTREE_GAP = 28;
const ROOT_FOREST_GAP = 72;
/** Max direct leaf reports in one row before wrapping into a compact grid (reduces horizontal sprawl). */
const MAX_INLINE_LEAF_SIBLINGS = 6;
const LEAF_WRAP_MAX_COLS = 8;
const LEAF_WRAP_MAX_ROWS = 4;
const LEAF_WRAP_H_GAP = 22;
/** Horizontal anchor for pre–viewport centering; auto fit-to-view scales the real bounds. */
const TREE_LAYOUT_CENTER_X = 900;

type TreeXY = { x: number; y: number };

function computeCenteredTreeLayout(rows: OrgChartRow[]): Record<string, Position> {
  const byId = new Map(rows.map((r) => [r.user_id, r]));
  const childrenMap = new Map<string, string[]>();
  rows.forEach((r) => childrenMap.set(r.user_id, []));
  rows.forEach((r) => {
    if (r.reports_to_user_id && byId.has(r.reports_to_user_id)) {
      childrenMap.get(r.reports_to_user_id)?.push(r.user_id);
    }
  });
  childrenMap.forEach((list) => list.sort((a, b) => rowNameOrBlank(byId.get(a)).localeCompare(rowNameOrBlank(byId.get(b)))));

  const roots = rows
    .filter((r) => !r.reports_to_user_id || !byId.has(r.reports_to_user_id))
    .sort((a, b) => rowName(a).localeCompare(rowName(b)));

  function layoutSubtree(id: string, depth: number): { minX: number; maxX: number; positions: Record<string, TreeXY> } {
    const y = TREE_MARGIN_TOP + depth * TREE_LEVEL_GAP;
    const kids = [...(childrenMap.get(id) ?? [])].filter((k) => byId.has(k));

    if (!kids.length) {
      return { minX: 0, maxX: CARD_W, positions: { [id]: { x: 0, y } } };
    }

    const allDirectLeaves = kids.every((k) => (childrenMap.get(k) ?? []).length === 0);
    if (allDirectLeaves && kids.length > MAX_INLINE_LEAF_SIBLINGS) {
      const cols = Math.min(
        LEAF_WRAP_MAX_COLS,
        Math.max(1, Math.ceil(kids.length / LEAF_WRAP_MAX_ROWS)),
      );
      const cellW = CARD_W + LEAF_WRAP_H_GAP;
      const rowVertStep = Math.min(58, Math.floor(TREE_LEVEL_GAP * 0.42));
      const childDepthY = TREE_MARGIN_TOP + (depth + 1) * TREE_LEVEL_GAP;
      const merged: Record<string, TreeXY> = {};
      for (let i = 0; i < kids.length; i++) {
        const kid = kids[i]!;
        const row = Math.floor(i / cols);
        const col = i % cols;
        merged[kid] = { x: col * cellW, y: childDepthY + row * rowVertStep };
      }
      let spanMin = Infinity;
      let spanMax = -Infinity;
      for (const p of Object.values(merged)) {
        spanMin = Math.min(spanMin, p.x);
        spanMax = Math.max(spanMax, p.x + CARD_W);
      }
      const mid = (spanMin + spanMax) / 2;
      const parentX = mid - CARD_W / 2;
      merged[id] = { x: parentX, y };
      return {
        minX: Math.min(spanMin, parentX),
        maxX: Math.max(spanMax, parentX + CARD_W),
        positions: merged,
      };
    }

    const childLayouts = kids.map((k) => layoutSubtree(k, depth + 1));
    let cursor = 0;
    const merged: Record<string, TreeXY> = {};
    for (let i = 0; i < kids.length; i++) {
      const cl = childLayouts[i]!;
      const shift = cursor - cl.minX;
      for (const [nid, pos] of Object.entries(cl.positions)) {
        merged[nid] = { x: pos.x + shift, y: pos.y };
      }
      cursor = shift + cl.maxX + SIBLING_SUBTREE_GAP;
    }
    cursor -= SIBLING_SUBTREE_GAP;

    let spanMin = Infinity;
    let spanMax = -Infinity;
    for (const p of Object.values(merged)) {
      spanMin = Math.min(spanMin, p.x);
      spanMax = Math.max(spanMax, p.x + CARD_W);
    }
    const mid = (spanMin + spanMax) / 2;
    const parentX = mid - CARD_W / 2;
    merged[id] = { x: parentX, y };

    const finalMin = Math.min(spanMin, parentX);
    const finalMax = Math.max(spanMax, parentX + CARD_W);
    return { minX: finalMin, maxX: finalMax, positions: merged };
  }

  const all: Record<string, TreeXY> = {};
  let forestCursor = 0;
  let globalMinX = Infinity;
  let globalMaxX = -Infinity;

  for (const root of roots) {
    const sub = layoutSubtree(root.user_id, 0);
    const shift = forestCursor - sub.minX;
    for (const [nid, pos] of Object.entries(sub.positions)) {
      const x = pos.x + shift;
      all[nid] = { x, y: pos.y };
      globalMinX = Math.min(globalMinX, x);
      globalMaxX = Math.max(globalMaxX, x + CARD_W);
    }
    forestCursor = shift + sub.maxX + ROOT_FOREST_GAP;
  }
  forestCursor -= roots.length ? ROOT_FOREST_GAP : 0;

  const dx = Number.isFinite(globalMinX) && Number.isFinite(globalMaxX)
    ? TREE_LAYOUT_CENTER_X - (globalMinX + globalMaxX) / 2
    : 0;

  const next: Record<string, Position> = {};
  for (const [id, pos] of Object.entries(all)) {
    const x = pos.x + dx;
    const y = pos.y;
    next[id] = { x, y, tx: x, ty: y };
  }

  let orphanIdx = 0;
  for (const r of rows) {
    if (next[r.user_id]) continue;
    const x = TREE_LAYOUT_CENTER_X - CARD_W / 2 + orphanIdx * (CARD_W + SIBLING_SUBTREE_GAP);
    orphanIdx += 1;
    const y = TREE_MARGIN_TOP;
    next[r.user_id] = { x, y, tx: x, ty: y };
  }

  return next;
}

/** Stable accent per department name for card stripe (flat name ordering; no DB parent chain). */
function deptAccent(name: string): string {
  if (name === 'Unassigned') return 'rgba(148, 163, 184, 0.45)';
  let h = 2166136261;
  for (let i = 0; i < name.length; i++) {
    h ^= name.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const hue = (h >>> 0) % 360;
  return `hsl(${hue} 52% 58%)`;
}

function escXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function csvCell(value: string | null | undefined): string {
  const s = value ?? '';
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function buildGraph(rows: OrgChartRow[]) {
  const byId = new Map(rows.map((r) => [r.user_id, r]));
  const edges: Array<[string, string]> = [];
  rows.forEach((r) => {
    if (r.reports_to_user_id && byId.has(r.reports_to_user_id)) {
      edges.push([r.reports_to_user_id, r.user_id]);
    }
  });
  return { edges };
}

export function OrgChartClient({
  rows,
  chartTitle = 'Organisation Chart',
}: {
  rows: OrgChartRow[];
  chartTitle?: string;
}) {
  /**
   * When the server returns no directory rows, default to the built-in sample so the canvas is usable
   * (same as pre–empty-default behaviour). Turn off automatically when live rows arrive.
   */
  const [showFictionalSample, setShowFictionalSample] = useState(() => rows.length === 0);
  const activeRows = useMemo(
    () => (rows.length > 0 ? rows : showFictionalSample ? DEMO_ROWS : []),
    [rows, showFictionalSample],
  );
  const viewingFictionalSample = rows.length === 0 && showFictionalSample && activeRows.length > 0;

  useEffect(() => {
    if (rows.length > 0) setShowFictionalSample(false);
  }, [rows.length]);
  const graph = useMemo(() => buildGraph(activeRows), [activeRows]);
  const nodes = useMemo<NodeConfig[]>(() =>
    activeRows.map((r) => {
      const t = getVisualTier(r);
      return { id: r.user_id, label: rowName(r), tier: t.tier, tc: t.tc, row: r };
    }),
  [activeRows]);
  const sceneRef = useRef<HTMLDivElement | null>(null);
  const nodeRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const positionsRef = useRef<Record<string, Position>>({});
  const initialLayoutRef = useRef<Record<string, Position>>({});
  const draggingRef = useRef<{ id: string; sx: number; sy: number; ox: number; oy: number } | null>(null);
  const panningRef = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);
  const settleFrameRef = useRef<number | null>(null);
  const hasUserAdjustedViewRef = useRef(false);

  const [showEdges, setShowEdges] = useState(true);
  const [vpX, setVpX] = useState(0);
  const [vpY, setVpY] = useState(0);
  const [vpScale, setVpScale] = useState(1);
  const [grabbing, setGrabbing] = useState(false);
  const [renderTick, setRenderTick] = useState(0);
  const [modalNode, setModalNode] = useState<OrgChartRow | null>(null);

  const bump = useCallback(() => setRenderTick((n) => n + 1), []);

  const fitToView = useCallback((focusNodeId?: string) => {
    const scene = sceneRef.current;
    if (!scene) return;
    const ids = Object.keys(positionsRef.current);
    if (!ids.length) return;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const id of ids) {
      const p = positionsRef.current[id];
      if (!p) continue;
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x + CARD_W);
      maxY = Math.max(maxY, p.y + CARD_H);
    }
    if (!Number.isFinite(minX) || !Number.isFinite(minY)) return;
    const pad = 36;
    const contentW = Math.max(1, maxX - minX + pad * 2);
    const contentH = Math.max(1, maxY - minY + pad * 2);
    const sRaw = Math.min(scene.clientWidth / contentW, scene.clientHeight / contentH);
    const s = Math.max(0.06, Math.min(2.75, sRaw));
    let nextVpX = minX - pad;
    let nextVpY = minY - pad;

    if (focusNodeId) {
      const focus = positionsRef.current[focusNodeId];
      if (focus) {
        const focusCenterX = focus.x + CARD_W / 2;
        // Place the focus node near the upper part of the viewport on load.
        const focusTargetY = focus.y - 56;
        nextVpX = Math.max(minX - pad, focusCenterX - scene.clientWidth / (2 * s));
        nextVpY = Math.max(minY - pad, focusTargetY);
      }
    }

    setVpScale(s);
    setVpX(nextVpX);
    setVpY(nextVpY);
  }, []);

  const startFocusNodeId = useMemo(() => {
    const orgAdmin = activeRows.find((row) => row.role?.toLowerCase().trim() === 'org_admin');
    if (orgAdmin) return orgAdmin.user_id;
    const managerFallback = activeRows.find((row) => !row.reports_to_user_id);
    return managerFallback?.user_id;
  }, [activeRows]);

  const runInitialFit = useCallback(() => {
    // Fit a few times on first load so late layout/size changes do not leave the tree off to one side.
    const rafA = window.requestAnimationFrame(() => {
      fitToView(startFocusNodeId);
      const rafB = window.requestAnimationFrame(() => fitToView(startFocusNodeId));
      window.setTimeout(() => window.cancelAnimationFrame(rafB), 250);
    });
    const delayed = window.setTimeout(() => fitToView(startFocusNodeId), 140);

    return () => {
      window.cancelAnimationFrame(rafA);
      window.clearTimeout(delayed);
    };
  }, [fitToView, startFocusNodeId]);

  useEffect(() => {
    const next = computeCenteredTreeLayout(activeRows);
    positionsRef.current = next;
    initialLayoutRef.current = Object.fromEntries(
      Object.entries(next).map(([k, v]) => [k, { ...v }]),
    );
    bump();
    hasUserAdjustedViewRef.current = false;
    return runInitialFit();
  }, [bump, activeRows, runInitialFit]);

  useEffect(() => {
    const onResize = () => {
      bump();
      if (!hasUserAdjustedViewRef.current) {
        fitToView();
      }
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [bump, fitToView]);

  /** Top / bottom centre anchors so edges attach like graph tools (e.g. Obsidian). Reads live ref positions. */
  const nodeAnchors = useCallback((id: string) => {
    const el = nodeRefs.current[id];
    const p = positionsRef.current[id];
    if (!p) return null;
    const w = el?.offsetWidth ?? CARD_W;
    const h = Math.max(CARD_H, el?.offsetHeight ?? CARD_H);
    const cx = p.x + w / 2;
    return {
      top: { x: cx, y: p.y },
      bottom: { x: cx, y: p.y + h },
    };
  }, []);

  const edgePaths = useMemo(() => {
    if (!showEdges) return [];
    const rect = (id: string) => {
      const el = nodeRefs.current[id];
      const p = positionsRef.current[id];
      if (!p) return null;
      const w = el?.offsetWidth ?? CARD_W;
      const h = Math.max(CARD_H, el?.offsetHeight ?? CARD_H);
      return { x: p.x, y: p.y, w, h };
    };

    /** Parent -> children buckets so we can draw shared trunks/hubs. */
    const childrenByParent = new Map<string, string[]>();
    for (const [parent, child] of graph.edges) {
      if (!childrenByParent.has(parent)) childrenByParent.set(parent, []);
      childrenByParent.get(parent)!.push(child);
    }

    const busYForParent = (parentId: string, kids: string[]): number | null => {
      if (!kids?.length) return null;
      const pr = rect(parentId);
      if (!pr) return null;
      const parentBottom = pr.y + pr.h;
      let minChildTop = Infinity;
      for (const cid of kids) {
        const cr = rect(cid);
        if (cr) minChildTop = Math.min(minChildTop, cr.y);
      }
      const vDrop = 26;
      if (!Number.isFinite(minChildTop)) return parentBottom + vDrop;
      const minY = parentBottom + 10;
      const maxY = minChildTop - 12;
      if (maxY <= minY) return (parentBottom + minChildTop) / 2;
      return Math.max(minY, Math.min(parentBottom + vDrop, maxY));
    };

    const paths: Array<{ key: string; d: string; stroke: string }> = [];

    for (const [parentId, kids] of childrenByParent.entries()) {
      const pr = rect(parentId);
      if (!pr) continue;
      const stroke = EDGE_STROKE;
      const lowerKids: string[] = [];
      for (const kid of kids) {
        const kr = rect(kid);
        if (!kr) continue;
        lowerKids.push(kid);
      }

      if (lowerKids.length) {
        const yBus = busYForParent(parentId, lowerKids);
        const aa = nodeAnchors(parentId);
        if (aa && yBus != null) {
          for (const kid of lowerKids) {
            const ab = nodeAnchors(kid);
            if (!ab) continue;
            const fy = aa.bottom.y;
            const ty = ab.top.y;
            const d =
              ty <= fy + 4 || yBus <= fy + 2 || yBus >= ty - 2
                ? fallbackVerticalConnector(aa.bottom.x, fy, ab.top.x, ty)
                : orthoConnector(aa.bottom.x, fy, ab.top.x, ty, yBus);
            paths.push({
              key: `${parentId}-${kid}`,
              d,
              stroke,
            });
          }
        }
      }
    }

    return paths;
    // renderTick: paths must refresh every drag frame (refs alone don't invalidate memo).
  }, [graph.edges, nodeAnchors, showEdges, renderTick, vpX, vpY, vpScale]);

  const startSettle = useCallback(() => {
    if (settleFrameRef.current) window.cancelAnimationFrame(settleFrameRef.current);
    const step = () => {
      if (draggingRef.current) return;
      let settled = true;
      nodes.forEach((n) => {
        const p = positionsRef.current[n.id];
        if (!p) return;
        const dx = p.tx - p.x;
        const dy = p.ty - p.y;
        if (Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1) {
          settled = false;
          p.x += dx * 0.15;
          p.y += dy * 0.15;
        }
      });
      bump();
      if (!settled) {
        settleFrameRef.current = window.requestAnimationFrame(step);
      } else {
        settleFrameRef.current = null;
      }
    };
    settleFrameRef.current = window.requestAnimationFrame(step);
  }, [bump, nodes]);

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (draggingRef.current) {
        const { id, sx, sy, ox, oy } = draggingRef.current;
        const scale = 1 / vpScale;
        const p = positionsRef.current[id];
        if (p) {
          p.x = ox + (e.clientX - sx) * scale;
          p.y = oy + (e.clientY - sy) * scale;
          p.tx = p.x;
          p.ty = p.y;
          bump();
        }
      }
      if (panningRef.current) {
        const { sx, sy, ox, oy } = panningRef.current;
        setVpX(ox - (e.clientX - sx));
        setVpY(oy - (e.clientY - sy));
      }
    };
    const onMouseUp = () => {
      if (draggingRef.current) {
        draggingRef.current = null;
        startSettle();
      }
      if (panningRef.current) {
        panningRef.current = null;
        setGrabbing(false);
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!draggingRef.current) return;
      const t = e.touches[0];
      if (!t) return;
      const { id, sx, sy, ox, oy } = draggingRef.current;
      const scale = 1 / vpScale;
      const p = positionsRef.current[id];
      if (p) {
        p.x = ox + (t.clientX - sx) * scale;
        p.y = oy + (t.clientY - sy) * scale;
        p.tx = p.x;
        p.ty = p.y;
        bump();
      }
    };
    const onTouchEnd = () => {
      if (draggingRef.current) {
        draggingRef.current = null;
        startSettle();
      }
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
    };
  }, [bump, startSettle, vpScale]);

  useEffect(() => () => {
    if (settleFrameRef.current) window.cancelAnimationFrame(settleFrameRef.current);
  }, []);

  const startNodeDrag = (
    e: ReactMouseEvent<HTMLDivElement> | ReactTouchEvent<HTMLDivElement>,
    id: string,
  ) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'BUTTON') return;
    const pos = positionsRef.current[id];
    if (!pos) return;
    if ('touches' in e) {
      const t = e.touches[0];
      if (!t) return;
      e.preventDefault();
      draggingRef.current = { id, sx: t.clientX, sy: t.clientY, ox: pos.x, oy: pos.y };
      bump();
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    draggingRef.current = { id, sx: e.clientX, sy: e.clientY, ox: pos.x, oy: pos.y };
    bump();
  };

  const resetLayout = () => {
    const snap = initialLayoutRef.current;
    for (const id of Object.keys(snap)) {
      const p = positionsRef.current[id];
      const s = snap[id];
      if (p && s) {
        p.x = s.x;
        p.y = s.y;
        p.tx = s.tx;
        p.ty = s.ty;
      }
    }
    bump();
    requestAnimationFrame(() => requestAnimationFrame(() => fitToView()));
  };

  const startPan = (e: ReactMouseEvent<HTMLDivElement>) => {
    const t = e.target as HTMLElement;
    if (t.closest(`.${styles.nd}`) || t.closest(`.${styles.ndBtn}`)) return;
    hasUserAdjustedViewRef.current = true;
    panningRef.current = { sx: e.clientX, sy: e.clientY, ox: vpX, oy: vpY };
    setGrabbing(true);
  };

  const onWheel = (e: ReactWheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    hasUserAdjustedViewRef.current = true;
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setVpScale((s) => Math.max(0.06, Math.min(2.75, s * delta)));
  };

  const zoomIn = () => {
    hasUserAdjustedViewRef.current = true;
    setVpScale((s) => Math.min(2.75, s * 1.12));
  };
  const zoomOut = () => {
    hasUserAdjustedViewRef.current = true;
    setVpScale((s) => Math.max(0.06, s * 0.9));
  };
  const resetView = () => {
    hasUserAdjustedViewRef.current = true;
    setVpX(0);
    setVpY(0);
    setVpScale(1);
  };
  const buildFullChartSvg = useCallback((): { svg: string; vbW: number; vbH: number } | null => {
    const ids = Object.keys(positionsRef.current);
    if (!ids.length) return null;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const id of ids) {
      const p = positionsRef.current[id];
      if (!p) continue;
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x + CARD_W);
      maxY = Math.max(maxY, p.y + CARD_H);
    }
    if (!Number.isFinite(minX)) return null;
    const pad = 36;
    const titleBand = chartTitle.trim() ? 44 : 0;
    const vbX = Math.floor(minX - pad);
    const vbY = Math.floor(minY - pad - titleBand);
    const vbW = Math.ceil(maxX - minX + pad * 2);
    const vbH = Math.ceil(maxY - minY + pad * 2 + titleBand);
    const titleSvg = chartTitle.trim()
      ? `<text x="${vbX + 14}" y="${vbY + 28}" fill="#121212" font-size="15" font-weight="600">${escXml(chartTitle.trim())}</text>`
      : '';
    const edgesSvg = edgePaths
      .map(
        (e) =>
          `<path d="${escXml(e.d)}" fill="none" stroke="${escXml(e.stroke)}" stroke-width="1.1" stroke-linecap="square" stroke-linejoin="miter" stroke-miterlimit="8" opacity="0.72" />`,
      )
      .join('');
    const nodeRects = nodes
      .map((n) => {
        const p = positionsRef.current[n.id];
        if (!p) return '';
        const fill = n.tc === 't-board' ? 'rgba(124,58,237,0.1)' :
          n.tc === 't-csuite' ? 'rgba(2,132,199,0.1)' :
          n.tc === 't-slt' ? 'rgba(5,150,105,0.1)' :
          n.tc === 't-mid' ? 'rgba(217,119,6,0.12)' :
          n.tc === 't-senior' ? 'rgba(13,148,136,0.1)' :
          n.tc === 't-junior' ? 'rgba(100,116,139,0.12)' : 'rgba(190,24,93,0.08)';
        const depts = n.row.department_names?.length ? n.row.department_names.join(', ') : '';
        return `<g>
  <rect x="${p.x}" y="${p.y}" width="${CARD_W}" height="${CARD_H}" rx="12" fill="${fill}" stroke="#e8e8e8" />
  <text x="${p.x + 10}" y="${p.y + 22}" fill="#121212" font-size="10.5" font-weight="600">${escXml(n.label)}</text>
  <text x="${p.x + 10}" y="${p.y + 38}" fill="#6b6b6b" font-size="9">${escXml(n.row.job_title?.trim() || tenantRoleLabel(n.row.role) || n.tier)}</text>
  ${depts ? `<text x="${p.x + 10}" y="${p.y + 56}" fill="#9b9b9b" font-size="8">${escXml(depts.slice(0, 80))}${depts.length > 80 ? '…' : ''}</text>` : ''}
</g>`;
      })
      .join('');
    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vbX} ${vbY} ${vbW} ${vbH}" width="${vbW}" height="${vbH}">
  <rect x="${vbX}" y="${vbY}" width="${vbW}" height="${vbH}" fill="#faf9f6" />
  ${titleSvg}
  ${edgesSvg}
  ${nodeRects}
</svg>`;
    return { svg, vbW, vbH };
  }, [chartTitle, edgePaths, nodes]);

  const exportSvg = useCallback(() => {
    const built = buildFullChartSvg();
    if (!built) return;
    downloadBlob(new Blob([built.svg], { type: 'image/svg+xml;charset=utf-8' }), 'org-chart-export.svg');
  }, [buildFullChartSvg]);

  const exportPng = useCallback(() => {
    const built = buildFullChartSvg();
    if (!built) return;
    const { svg, vbW, vbH } = built;
    const scale = 2;
    const img = new Image();
    const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(svgBlob);
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.ceil(vbW * scale));
      canvas.height = Math.max(1, Math.ceil(vbH * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(url);
        return;
      }
      ctx.fillStyle = '#faf9f6';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => {
        URL.revokeObjectURL(url);
        if (blob) downloadBlob(blob, 'org-chart-export.png');
      }, 'image/png');
    };
    img.onerror = () => URL.revokeObjectURL(url);
    img.src = url;
  }, [buildFullChartSvg]);

  const exportJson = useCallback(() => {
    const payload = {
      title: chartTitle,
      exportedAt: new Date().toISOString(),
      people: activeRows.map((r) => ({
        user_id: r.user_id,
        full_name: r.full_name,
        preferred_name: r.preferred_name ?? null,
        display_name: rowName(r),
        email: r.email,
        role: r.role,
        job_title: r.job_title,
        reports_to_user_id: r.reports_to_user_id,
        reports_to_name: r.reports_to_name,
        department_names: r.department_names,
        work_location: r.work_location,
      })),
    };
    downloadBlob(
      new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' }),
      'org-chart-data.json',
    );
  }, [activeRows, chartTitle]);

  const exportCsv = useCallback(() => {
    const header = [
      'display_name',
      'full_name',
      'job_title',
      'role',
      'manager',
      'departments',
      'email',
      'work_location',
      'user_id',
    ];
    const lines = [
      header.join(','),
      ...activeRows.map((r) =>
        [
          csvCell(rowName(r)),
          csvCell(r.full_name),
          csvCell(r.job_title),
          csvCell(r.role),
          csvCell(r.reports_to_name),
          csvCell(r.department_names?.join('; ') ?? ''),
          csvCell(r.email),
          csvCell(r.work_location),
          csvCell(r.user_id),
        ].join(','),
      ),
    ];
    downloadBlob(new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' }), 'org-chart-data.csv');
  }, [activeRows]);

  // Apply pan in scene-space before zoom: screen = (world - vp) * scale.
  const transform = `scale(${vpScale}) translate(${-vpX}px,${-vpY}px)`;
  const tierLegend = useMemo(() => {
    const seen = new Set<string>();
    return nodes
      .filter((n) => {
        if (seen.has(n.tier)) return false;
        seen.add(n.tier);
        return true;
      })
      .map((n) => ({ tier: n.tier, color: COLORS[n.tc] ?? '#fff' }));
  }, [nodes]);

  return (
    <div className={styles.wrap}>
      <div className={styles.toolbar}>
        <span className={styles.dataSourceBadge} aria-live="polite">
          {rows.length > 0 ? (
            <>
              <strong>Live directory</strong>
              <span className={styles.dataSourceMeta}>{rows.length} active {rows.length === 1 ? 'member' : 'members'}</span>
            </>
          ) : viewingFictionalSample ? (
            <>
              <strong>Fictional sample</strong>
              <span className={styles.dataSourceMeta}>
                Directory returned 0 rows  preview only; set managers on All members and refresh for your org
              </span>
            </>
          ) : (
            <>
              <strong>Empty canvas</strong>
              <span className={styles.dataSourceMeta}>Preview sample is off  turn it on or load members above</span>
            </>
          )}
        </span>
        <button type="button" onClick={resetLayout}>Reset layout</button>
        {rows.length === 0 ? (
          <button type="button" onClick={() => setShowFictionalSample((v) => !v)}>
            {showFictionalSample ? 'Hide sample org' : 'Show sample org'}
          </button>
        ) : null}
        <button type="button" onClick={() => setShowEdges((v) => !v)}>
          {showEdges ? 'Hide connections' : 'Show connections'}
        </button>
        <button type="button" onClick={zoomOut} aria-label="Zoom out">-</button>
        <button type="button" onClick={zoomIn} aria-label="Zoom in">+</button>
        <button type="button" onClick={fitToView}>Fit</button>
        <button type="button" onClick={resetView}>Reset view</button>
        <span className={styles.exportGroup} aria-label="Export options">
          <span className={styles.exportLabel}>Export</span>
          <button type="button" onClick={exportSvg} title="Scalable vector  best for print and design tools">
            SVG
          </button>
          <button type="button" onClick={exportPng} title="Raster image  easy to share">
            PNG
          </button>
          <button type="button" onClick={exportJson} title="Full directory snapshot as structured data">
            JSON
          </button>
          <button type="button" onClick={exportCsv} title="Spreadsheet-friendly table">
            CSV
          </button>
        </span>
        <span>
          {rows.length > 0
            ? 'Names and roles come from your live directory (same source as All members). Drag cards to rearrange locally (not saved); pan and zoom on the background.'
            : viewingFictionalSample
              ? 'Hardcoded demo hierarchy  not your staff. If you expect real names here, the directory query returned no rows (check All members and refresh).'
              : 'Sample preview is hidden. Choose Show sample org for a demo layout, or add active members with managers and refresh.'}
        </span>
      </div>
      <div className={styles.legend}>
        {tierLegend.map((t) => (
          <div key={t.tier} className={styles.li}>
            <div className={styles.ld} style={{ background: t.color }} />
            {t.tier}
          </div>
        ))}
      </div>
      <div className={`${styles.scene} ${grabbing ? styles.grabbing : ''}`} ref={sceneRef} onMouseDown={startPan} onWheel={onWheel}>
        <svg className={styles.edges} style={{ transform }}>
          {edgePaths.map((edge) => (
            <path
              key={edge.key}
              d={edge.d}
              fill="none"
              stroke={edge.stroke}
              strokeWidth="1.15"
              strokeLinecap="square"
              strokeLinejoin="miter"
              strokeMiterlimit="8"
              opacity="0.72"
            />
          ))}
        </svg>
        <div className={styles.nodesLayer} style={{ transform }}>
          {nodes.map((n) => {
            const p = positionsRef.current[n.id];
            if (!p) return null;
            const dragging = draggingRef.current?.id === n.id;
            const dept = primaryDepartment(n.row);
            const accent = deptAccent(dept);
            return (
              <div
                key={n.id}
                ref={(el) => {
                  nodeRefs.current[n.id] = el;
                }}
                className={`${styles.nd} ${styles[n.tc]} ${dragging ? styles.dragging : ''}`}
                style={
                  {
                    left: `${p.x}px`,
                    top: `${p.y}px`,
                    ['--dept-accent' as string]: accent,
                  } as CSSProperties
                }
                title={dept !== 'Unassigned' ? dept : undefined}
                onMouseDown={(e) => startNodeDrag(e, n.id)}
                onTouchStart={(e) => startNodeDrag(e, n.id)}
              >
                <div className={styles.pip} />
                <div className={styles.ndName}>{n.label}</div>
                <div
                  className={[styles.ndTier, n.row.job_title?.trim() ? styles.ndTierJob : ''].join(' ').trim()}
                >
                  {n.row.job_title?.trim() || tenantRoleLabel(n.row.role) || n.tier}
                </div>
                {n.row.department_names?.length ? (
                  <div className={styles.ndDepts} title={n.row.department_names.join(', ')}>
                    {n.row.department_names.slice(0, 2).join(' · ')}
                    {n.row.department_names.length > 2 ? '…' : ''}
                  </div>
                ) : null}
                <button type="button" className={styles.ndBtn} onClick={(e) => { e.stopPropagation(); setModalNode(n.row); }}>
                  details &rsaquo;
                </button>
              </div>
            );
          })}
        </div>
        <div
          className={`${styles.modalWrap} ${modalNode ? styles.open : ''}`}
          onClick={(e) => {
            if (e.target === e.currentTarget) setModalNode(null);
          }}
        >
          <div className={styles.modal}>
            <h2>{modalNode ? rowName(modalNode) : ''}</h2>
            <div className={styles.mTier}>{modalNode?.job_title || modalNode?.role || 'Team member'}</div>
            <div>
              <div className={styles.pr}>
                <span className={styles.pk}>Role</span>
                <span className={`${styles.pv} ${styles.lim}`}>{modalNode?.role ?? ''}</span>
              </div>
              <div className={styles.pr}>
                <span className={styles.pk}>Manager</span>
                <span className={`${styles.pv} ${styles.lim}`}>{modalNode?.reports_to_name ?? ''}</span>
              </div>
              <div className={styles.pr}>
                <span className={styles.pk}>Departments</span>
                <span className={`${styles.pv} ${styles.lim}`}>
                  {modalNode?.department_names?.length ? modalNode.department_names.join(', ') : ''}
                </span>
              </div>
              <div className={styles.pr}>
                <span className={styles.pk}>Location</span>
                <span className={`${styles.pv} ${styles.lim}`}>{modalNode?.work_location ?? ''}</span>
              </div>
              <div className={styles.pr}>
                <span className={styles.pk}>Email</span>
                <span className={`${styles.pv} ${styles.lim}`}>{modalNode?.email ?? ''}</span>
              </div>
            </div>
            <button type="button" className={styles.mc} onClick={() => setModalNode(null)}>Close</button>
          </div>
        </div>
      </div>
    </div>
  );
}
