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
  't-board': '#a78bfa',
  't-csuite': '#38bdf8',
  't-slt': '#34d399',
  't-mid': '#fbbf24',
  't-senior': '#6ee7b7',
  't-core': '#f472b6',
  't-junior': '#94a3b8',
};

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

/** Sample hierarchy only — uses role *keys* like ceo, head_ops; avoids substring false-positives (e.g. coordinator vs coo). */
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

const SLT_PRIMARY_DEPT = 'Senior Leadership';

/** Lane order on each level: exec / SLT first, then A→Z, then Unassigned (matches QA seed dept name "Senior Leadership"). */
function compareDepartmentLanes(a: string, b: string): number {
  const rank = (n: string) => {
    if (n === 'Senior Leadership') return 0;
    if (n === 'Unassigned') return 2;
    return 1;
  };
  const ra = rank(a);
  const rb = rank(b);
  if (ra !== rb) return ra - rb;
  return a.localeCompare(b);
}

/** One horizontal exec band for SLT: CEO, Deputy CEO, then other SLT, then name. */
function compareSltPeers(a: OrgChartRow, b: OrgChartRow): number {
  const rank = (r: OrgChartRow): number => {
    const jt = (r.job_title ?? '').toLowerCase();
    if (/\bceo\b|chief executive/i.test(r.job_title ?? '')) return 0;
    if (/deputy\s+ceo/i.test(jt)) return 1;
    if (r.role === 'org_admin') return 2;
    return 3;
  };
  const d = rank(a) - rank(b);
  if (d !== 0) return d;
  return a.full_name.localeCompare(b.full_name);
}

/**
 * Tree depth alone puts deputies one row below the CEO. Pull every SLT primary-dept
 * member up to the shallowest tier any SLT occupies so the exec team shares one row.
 */
function computeDisplayLevels(
  rows: OrgChartRow[],
  treeLevelById: Map<string, number>,
): Map<string, number> {
  const out = new Map<string, number>();
  const sltIds = rows
    .filter((r) => primaryDepartment(r) === SLT_PRIMARY_DEPT)
    .map((r) => r.user_id);
  if (sltIds.length === 0) {
    rows.forEach((r) => out.set(r.user_id, treeLevelById.get(r.user_id) ?? 0));
    return out;
  }
  const minSlt = Math.min(...sltIds.map((id) => treeLevelById.get(id) ?? 0));
  for (const id of sltIds) out.set(id, minSlt);
  rows.forEach((r) => {
    if (!out.has(r.user_id)) out.set(r.user_id, treeLevelById.get(r.user_id) ?? 0);
  });
  return out;
}

const BEZIER_CIRCLE = 0.5522847498;

/**
 * Same topology as an org-chart tree (drop → bus → drop) but fully curved — no polyline elbows.
 */
function smoothTreeConnectorPath(fx: number, fy: number, tx: number, ty: number, yBus: number): string {
  const dx = tx - fx;
  const dy1 = yBus - fy;
  const dy2 = ty - yBus;
  const sx = dx === 0 ? 1 : Math.sign(dx);

  if (Math.abs(dx) < 10) {
    const my = (fy + ty) / 2;
    return `M${fx},${fy} C${fx},${my} ${tx},${my} ${tx},${ty}`;
  }

  const r = Math.min(
    20,
    Math.max(
      8,
      Math.min(Math.abs(dx) * 0.15, Math.abs(dy1) * 0.36, Math.abs(dy2) * 0.36, (ty - yBus) * 0.42),
    ),
  );
  const k = BEZIER_CIRCLE * r;

  const xStem = fx;
  const yStem = yBus - r;
  const xOnBusL = fx + sx * r;
  const xOnBusR = tx - sx * r;
  const yBelowBus = yBus + r;

  const stemEase = fy + Math.min(Math.max(dy1 * 0.58, 14), dy1 - r * 0.4);

  const hSpan = Math.abs(xOnBusR - xOnBusL);
  const hPull = Math.min(hSpan * 0.38, 48);

  return [
    `M${fx},${fy}`,
    `C${fx},${stemEase} ${fx},${yBus - r * 0.35} ${xStem},${yStem}`,
    `C${xStem},${yStem + k} ${xOnBusL - sx * k},${yBus} ${xOnBusL},${yBus}`,
    `C${xOnBusL + sx * hPull},${yBus} ${xOnBusR - sx * hPull},${yBus} ${xOnBusR},${yBus}`,
    `C${xOnBusR + sx * k},${yBus} ${tx},${yBelowBus - k} ${tx},${yBelowBus}`,
    `C${tx},${yBelowBus + Math.max(dy2 * 0.55, 10)} ${tx},${ty - Math.max(dy2 * 0.32, 6)} ${tx},${ty}`,
  ].join(' ');
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

function buildGraph(rows: OrgChartRow[]) {
  const byId = new Map(rows.map((r) => [r.user_id, r]));
  const children = new Map<string, string[]>();
  rows.forEach((r) => children.set(r.user_id, []));
  const edges: Array<[string, string]> = [];

  rows.forEach((r) => {
    if (r.reports_to_user_id && byId.has(r.reports_to_user_id)) {
      children.get(r.reports_to_user_id)?.push(r.user_id);
      edges.push([r.reports_to_user_id, r.user_id]);
    }
  });

  const roots = rows
    .filter((r) => !r.reports_to_user_id || !byId.has(r.reports_to_user_id))
    .sort((a, b) => a.full_name.localeCompare(b.full_name));

  const treeLevelById = new Map<string, number>();
  const q: string[] = roots.map((r) => r.user_id);
  roots.forEach((r) => treeLevelById.set(r.user_id, 0));
  while (q.length) {
    const id = q.shift();
    if (!id) continue;
    const lvl = treeLevelById.get(id) ?? 0;
    const kids = children.get(id) ?? [];
    kids.sort((a, b) => (byId.get(a)?.full_name ?? '').localeCompare(byId.get(b)?.full_name ?? ''));
    kids.forEach((k) => {
      if (!treeLevelById.has(k)) {
        treeLevelById.set(k, lvl + 1);
        q.push(k);
      }
    });
  }
  rows.forEach((r) => {
    if (!treeLevelById.has(r.user_id)) treeLevelById.set(r.user_id, 0);
  });

  const displayLevelById = computeDisplayLevels(rows, treeLevelById);

  const levels = new Map<number, OrgChartRow[]>();
  rows.forEach((r) => {
    const l = displayLevelById.get(r.user_id) ?? 0;
    const list = levels.get(l) ?? [];
    list.push(r);
    levels.set(l, list);
  });
  levels.forEach((list) => list.sort((a, b) => a.full_name.localeCompare(b.full_name)));

  return { edges, levels };
}

export function OrgChartClient({ rows }: { rows: OrgChartRow[] }) {
  const [useDemoData, setUseDemoData] = useState(() => rows.length === 0);
  const activeRows = useMemo(() => (useDemoData ? DEMO_ROWS : rows), [rows, useDemoData]);

  useEffect(() => {
    if (rows.length > 0 && useDemoData) setUseDemoData(false);
  }, [rows.length, useDemoData]);
  const graph = useMemo(() => buildGraph(activeRows), [activeRows]);
  const nodes = useMemo<NodeConfig[]>(() =>
    activeRows.map((r) => {
      const t = getVisualTier(r);
      return { id: r.user_id, label: r.full_name, tier: t.tier, tc: t.tc, row: r };
    }),
  [activeRows]);
  const nodeMap = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);
  const sceneRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const nodeRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const positionsRef = useRef<Record<string, Position>>({});
  const initialLayoutRef = useRef<Record<string, Position>>({});
  const draggingRef = useRef<{ id: string; sx: number; sy: number; ox: number; oy: number } | null>(null);
  const panningRef = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null);
  const settleFrameRef = useRef<number | null>(null);

  const [showEdges, setShowEdges] = useState(true);
  const [vpX, setVpX] = useState(0);
  const [vpY, setVpY] = useState(0);
  const [vpScale, setVpScale] = useState(1);
  const [grabbing, setGrabbing] = useState(false);
  const [renderTick, setRenderTick] = useState(0);
  const [modalNode, setModalNode] = useState<OrgChartRow | null>(null);

  const bump = useCallback(() => setRenderTick((n) => n + 1), []);

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
    const baseX = 100;
    const gapX = 210;
    const laneGap = 44;
    const baseY = 52;
    const gapY = 180;
    const next: Record<string, Position> = {};
    Array.from(graph.levels.entries())
      .sort((a, b) => a[0] - b[0])
      .forEach(([level, levelNodes]) => {
        const byDept = new Map<string, OrgChartRow[]>();
        for (const row of levelNodes) {
          const d = primaryDepartment(row);
          if (!byDept.has(d)) byDept.set(d, []);
          byDept.get(d)!.push(row);
        }
        const depts = [...byDept.keys()].sort(compareDepartmentLanes);
        let x = baseX;
        const levelY = baseY + level * gapY;
        for (const d of depts) {
          const group = byDept.get(d)!;
          if (d === SLT_PRIMARY_DEPT) group.sort(compareSltPeers);
          else group.sort((a, b) => a.full_name.localeCompare(b.full_name));
          for (const row of group) {
            next[row.user_id] = { x, y: levelY, tx: x, ty: levelY };
            x += gapX;
          }
          x += laneGap;
        }
      });
    positionsRef.current = next;
    initialLayoutRef.current = Object.fromEntries(
      Object.entries(next).map(([k, v]) => [k, { ...v }]),
    );
    setVpX(0);
    setVpY(0);
    setVpScale(1);
    drawBg();
    bump();
  }, [bump, drawBg, graph.levels]);

  /** Dept lane titles track the top-left of each (level × primary dept) cluster as cards move. */
  const laneHeaders = useMemo(() => {
    const headers: Array<{ key: string; label: string; x: number; y: number }> = [];
    Array.from(graph.levels.entries())
      .sort((a, b) => a[0] - b[0])
      .forEach(([level, levelNodes]) => {
        const byDept = new Map<string, OrgChartRow[]>();
        for (const row of levelNodes) {
          const d = primaryDepartment(row);
          if (!byDept.has(d)) byDept.set(d, []);
          byDept.get(d)!.push(row);
        }
        const depts = [...byDept.keys()].sort(compareDepartmentLanes);
        for (const d of depts) {
          const group = byDept.get(d)!;
          let minX = Infinity;
          let minY = Infinity;
          for (const row of group) {
            const pos = positionsRef.current[row.user_id];
            if (pos) {
              minX = Math.min(minX, pos.x);
              minY = Math.min(minY, pos.y);
            }
          }
          if (minX === Infinity) continue;
          headers.push({
            key: `lh-${level}-${d}`,
            label: d,
            x: minX,
            y: minY - 22,
          });
        }
      });
    return headers;
  }, [graph.levels, renderTick]);

  useEffect(() => {
    const onResize = () => {
      drawBg();
      bump();
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [bump, drawBg]);

  /** Top / bottom centre anchors so edges attach like graph tools (e.g. Obsidian). Reads live ref positions. */
  const nodeAnchors = useCallback((id: string) => {
    const el = nodeRefs.current[id];
    const p = positionsRef.current[id];
    if (!p) return null;
    const w = el?.offsetWidth ?? 140;
    const h = el?.offsetHeight ?? 56;
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
      const w = el?.offsetWidth ?? 140;
      const h = el?.offsetHeight ?? 56;
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
      const stroke = COLORS[nodeMap.get(parentId)?.tc ?? ''] ?? '#ffffff';
      const pCenterX = pr.x + pr.w / 2;
      const pCenterY = pr.y + pr.h / 2;

      const sameRowKids: string[] = [];
      const lowerKids: string[] = [];
      for (const kid of kids) {
        const kr = rect(kid);
        if (!kr) continue;
        if (Math.abs(kr.y - pr.y) < 12) sameRowKids.push(kid);
        else lowerKids.push(kid);
      }

      // Same-row reports: siblings meet at a shared side hub, then one trunk back to parent.
      if (sameRowKids.length) {
        const leftKids: string[] = [];
        const rightKids: string[] = [];
        for (const kid of sameRowKids) {
          const kr = rect(kid);
          if (!kr) continue;
          const kCenterX = kr.x + kr.w / 2;
          if (kCenterX < pCenterX) leftKids.push(kid);
          else rightKids.push(kid);
        }

        const buildSameRowSide = (side: 'left' | 'right', sideKids: string[]) => {
          if (!sideKids.length) return;
          const parentX = side === 'right' ? pr.x + pr.w : pr.x;
          const targetXs = sideKids
            .map((kid) => {
              const kr = rect(kid);
              if (!kr) return null;
              return side === 'right' ? kr.x : kr.x + kr.w;
            })
            .filter((x): x is number => x != null);
          if (!targetXs.length) return;

          const edgeMost = side === 'right' ? Math.min(...targetXs) : Math.max(...targetXs);
          const hubX = side === 'right'
            ? parentX + (edgeMost - parentX) * 0.5
            : parentX - (parentX - edgeMost) * 0.5;
          const hubY = pCenterY;

          paths.push({
            key: `${parentId}-same-${side}-trunk`,
            d: `M${parentX},${pCenterY} C${parentX + (side === 'right' ? 22 : -22)},${pCenterY} ${hubX - (side === 'right' ? 12 : -12)},${hubY} ${hubX},${hubY}`,
            stroke,
          });

          for (const kid of sideKids) {
            const kr = rect(kid);
            if (!kr) continue;
            const tx = side === 'right' ? kr.x : kr.x + kr.w;
            const ty = kr.y + kr.h / 2;
            const mx = (hubX + tx) / 2;
            paths.push({
              key: `${parentId}-${kid}-same-${side}`,
              d: `M${hubX},${hubY} C${mx},${hubY} ${mx},${ty} ${tx},${ty}`,
              stroke,
            });
          }
        };

        buildSameRowSide('left', leftKids);
        buildSameRowSide('right', rightKids);
      }

      // Standard tree links for lower levels.
      if (lowerKids.length) {
        const yBus = busYForParent(parentId, lowerKids);
        if (yBus != null) {
          const aa = nodeAnchors(parentId);
          if (aa) {
            for (const kid of lowerKids) {
              const ab = nodeAnchors(kid);
              if (!ab) continue;
              paths.push({
                key: `${parentId}-${kid}`,
                d: smoothTreeConnectorPath(aa.bottom.x, aa.bottom.y, ab.top.x, ab.top.y, yBus),
                stroke,
              });
            }
          }
        }
      }
    }

    return paths;
    // renderTick: paths must refresh every drag frame (refs alone don't invalidate memo).
  }, [graph.edges, nodeAnchors, nodeMap, showEdges, renderTick, vpX, vpY, vpScale]);

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
      p.x = ox + (t.clientX - sx) * scale;
      p.y = oy + (t.clientY - sy) * scale;
      p.tx = p.x;
      p.ty = p.y;
      bump();
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
    setVpX(0);
    setVpY(0);
    setVpScale(1);
    bump();
  };

  const startNodeDrag = (
    e: ReactMouseEvent<HTMLDivElement> | ReactTouchEvent<HTMLDivElement>,
    id: string,
  ) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'BUTTON') return;
    if ('touches' in e) {
      const t = e.touches[0];
      if (!t) return;
      e.preventDefault();
      draggingRef.current = { id, sx: t.clientX, sy: t.clientY, ox: positionsRef.current[id].x, oy: positionsRef.current[id].y };
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    draggingRef.current = { id, sx: e.clientX, sy: e.clientY, ox: positionsRef.current[id].x, oy: positionsRef.current[id].y };
  };

  const startPan = (e: ReactMouseEvent<HTMLDivElement>) => {
    const t = e.target as HTMLElement;
    if (t.closest(`.${styles.nd}`) || t.closest(`.${styles.ndBtn}`)) return;
    panningRef.current = { sx: e.clientX, sy: e.clientY, ox: vpX, oy: vpY };
    setGrabbing(true);
  };

  const onWheel = (e: ReactWheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setVpScale((s) => Math.max(0.3, Math.min(2, s * delta)));
  };

  const transform = `translate(${-vpX}px,${-vpY}px) scale(${vpScale})`;
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
        <button type="button" onClick={resetLayout}>Reset layout</button>
        {rows.length === 0 ? (
          <button type="button" onClick={() => setUseDemoData((v) => !v)}>
            {useDemoData ? 'Use empty canvas' : 'Load sample layout'}
          </button>
        ) : null}
        <button type="button" onClick={() => setShowEdges((v) => !v)}>
          {showEdges ? 'Hide connections' : 'Show connections'}
        </button>
        <span>
          {rows.length === 0 && useDemoData
            ? 'Sample hierarchy (no org data — set managers on All members to build your tree)'
            : 'Reporting lines by manager; Senior Leadership members share one top row (CEO → deputies); other departments on lower tiers. Drag to rearrange; pan/zoom on background.'}
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
        <canvas className={styles.bg} ref={canvasRef} />
        <svg className={styles.edges} style={{ transform }}>
          {edgePaths.map((edge) => (
            <path
              key={edge.key}
              d={edge.d}
              fill="none"
              stroke={edge.stroke}
              strokeWidth="0.9"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.28"
            />
          ))}
        </svg>
        <div className={styles.nodesLayer} style={{ transform }}>
          {laneHeaders.map((h) => (
            <div key={h.key} className={styles.laneHdr} style={{ left: h.x, top: h.y }}>
              {h.label}
            </div>
          ))}
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
            <h2>{modalNode?.full_name ?? ''}</h2>
            <div className={styles.mTier}>{modalNode?.job_title || modalNode?.role || 'Team member'}</div>
            <div>
              <div className={styles.pr}>
                <span className={styles.pk}>Role</span>
                <span className={`${styles.pv} ${styles.lim}`}>{modalNode?.role ?? '—'}</span>
              </div>
              <div className={styles.pr}>
                <span className={styles.pk}>Manager</span>
                <span className={`${styles.pv} ${styles.lim}`}>{modalNode?.reports_to_name ?? '—'}</span>
              </div>
              <div className={styles.pr}>
                <span className={styles.pk}>Departments</span>
                <span className={`${styles.pv} ${styles.lim}`}>
                  {modalNode?.department_names?.length ? modalNode.department_names.join(', ') : '—'}
                </span>
              </div>
              <div className={styles.pr}>
                <span className={styles.pk}>Location</span>
                <span className={`${styles.pv} ${styles.lim}`}>{modalNode?.work_location ?? '—'}</span>
              </div>
              <div className={styles.pr}>
                <span className={styles.pk}>Email</span>
                <span className={`${styles.pv} ${styles.lim}`}>{modalNode?.email ?? '—'}</span>
              </div>
            </div>
            <button type="button" className={styles.mc} onClick={() => setModalNode(null)}>Close</button>
          </div>
        </div>
      </div>
    </div>
  );
}
