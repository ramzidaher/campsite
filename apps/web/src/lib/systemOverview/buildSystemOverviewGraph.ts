import type { PermissionKey } from '@campsite/types';

import type { AdminOverviewModel } from '@/lib/admin/loadAdminOverview';
import type { DepartmentsDirectoryBundle } from '@/lib/departments/loadDepartmentsDirectory';

export type SystemGraphNode = {
  id: string;
  label: string;
  group: 'module' | 'entity' | 'metric';
  tier: 'ops' | 'people' | 'hr' | 'config';
  href?: string;
  meta?: string;
};

export type SystemGraphEdge = {
  from: string;
  to: string;
};

export type SystemOverviewGraph = {
  nodes: SystemGraphNode[];
  edges: SystemGraphEdge[];
};

function hasAny(p: readonly PermissionKey[], keys: PermissionKey[]): boolean {
  return keys.some((k) => p.includes(k));
}

export function buildSystemOverviewGraph(params: {
  permissions: PermissionKey[];
  bundle: DepartmentsDirectoryBundle;
  adminOverview?: AdminOverviewModel | null;
  isManagerScoped: boolean;
}): SystemOverviewGraph {
  const { permissions, bundle, adminOverview, isManagerScoped } = params;
  const p = permissions;

  const canMembers = hasAny(p, ['members.view']);
  const canApprovals = hasAny(p, ['approvals.members.review']);
  const canDepartments = hasAny(p, ['departments.view']);
  const canTeams = hasAny(p, ['teams.view']);
  const canBroadcasts = hasAny(p, ['broadcasts.view']);
  const canRota = hasAny(p, ['rota.view', 'rota.manage', 'rota.final_approve']);
  const canRecruitment = hasAny(p, ['recruitment.view', 'recruitment.manage', 'recruitment.approve_request', 'recruitment.create_request']);
  const canJobs = hasAny(p, ['jobs.view']);
  const canApplications = hasAny(p, ['applications.view']);
  const canOffers = hasAny(p, ['offers.view']);
  const canInterviews = hasAny(p, ['interviews.view', 'interviews.book_slot']);
  const canLeave = hasAny(p, ['leave.view_own', 'leave.approve_direct_reports', 'leave.manage_org']);
  const canHrRecords = hasAny(p, ['hr.view_records']);
  const canOnboarding = hasAny(p, ['onboarding.manage_runs', 'onboarding.manage_templates', 'onboarding.complete_own_tasks']);
  const canPerformance = hasAny(p, ['performance.view_own', 'performance.review_direct_reports', 'performance.manage_cycles', 'performance.view_reports']);
  const canDiscounts = hasAny(p, ['discounts.view']);
  const canSettings = hasAny(p, ['roles.view', 'members.edit_status']);

  const nodes: SystemGraphNode[] = [];
  const edges: SystemGraphEdge[] = [];

  const addNode = (node: SystemGraphNode) => {
    nodes.push(node);
    return node.id;
  };
  const connect = (from: string, to: string) => {
    if (nodes.some((n) => n.id === from) && nodes.some((n) => n.id === to)) edges.push({ from, to });
  };

  const membersNode = canMembers
    ? addNode({
        id: 'members',
        label: 'Members',
        group: 'module',
        tier: 'people',
        href: '/admin/users',
        meta: `${adminOverview?.totalMembers ?? bundle.staffOptions.length} active`,
      })
    : null;
  const approvalsNode = canApprovals
    ? addNode({ id: 'approvals', label: 'Approvals', group: 'module', tier: 'people', href: '/pending-approvals' })
    : null;
  const departmentsNode = canDepartments
    ? addNode({
        id: 'departments',
        label: 'Departments',
        group: 'module',
        tier: 'people',
        href: isManagerScoped ? '/manager/departments' : '/admin/departments',
        meta: `${bundle.departments.length} visible`,
      })
    : null;
  const teamsNode = canTeams
    ? addNode({
        id: 'teams',
        label: 'Teams',
        group: 'module',
        tier: 'people',
        href: isManagerScoped ? '/manager/teams' : '/admin/teams',
        meta: `${Object.values(bundle.teamsByDept).reduce((acc, list) => acc + list.length, 0)} teams`,
      })
    : null;
  const broadcastsNode = canBroadcasts
    ? addNode({ id: 'broadcasts', label: 'Broadcasts', group: 'module', tier: 'ops', href: '/broadcasts' })
    : null;
  const rotaNode = canRota
    ? addNode({ id: 'rota', label: 'Rota', group: 'module', tier: 'ops', href: '/rota' })
    : null;
  const recruitmentNode = canRecruitment
    ? addNode({
        id: 'recruitment',
        label: 'Recruitment',
        group: 'module',
        tier: 'hr',
        href: isManagerScoped ? '/manager/recruitment' : '/hr/recruitment',
      })
    : null;
  const jobsNode = canJobs ? addNode({ id: 'jobs', label: 'Jobs', group: 'entity', tier: 'hr', href: '/hr/jobs' }) : null;
  const applicationsNode = canApplications
    ? addNode({ id: 'applications', label: 'Applications', group: 'entity', tier: 'hr', href: '/hr/applications' })
    : null;
  const offersNode = canOffers
    ? addNode({ id: 'offers', label: 'Offer templates', group: 'entity', tier: 'hr', href: '/hr/offer-templates' })
    : null;
  const interviewsNode = canInterviews
    ? addNode({ id: 'interviews', label: 'Interviews', group: 'entity', tier: 'hr', href: '/hr/interviews' })
    : null;
  const leaveNode = canLeave ? addNode({ id: 'leave', label: 'Leave', group: 'module', tier: 'hr', href: '/leave' }) : null;
  const hrRecordsNode = canHrRecords
    ? addNode({ id: 'hr_records', label: 'HR records', group: 'module', tier: 'hr', href: '/hr/records' })
    : null;
  const onboardingNode = canOnboarding
    ? addNode({ id: 'onboarding', label: 'Onboarding', group: 'module', tier: 'hr', href: '/onboarding' })
    : null;
  const performanceNode = canPerformance
    ? addNode({ id: 'performance', label: 'Performance', group: 'module', tier: 'hr', href: '/performance' })
    : null;
  const discountsNode = canDiscounts
    ? addNode({ id: 'discounts', label: 'Discount rules', group: 'module', tier: 'ops', href: '/admin/discount' })
    : null;
  const settingsNode = canSettings
    ? addNode({ id: 'settings', label: 'Settings', group: 'module', tier: 'config', href: '/admin/settings' })
    : null;

  const deptEntityNode = canDepartments
    ? addNode({ id: 'entity_dept_count', label: 'Department structure', group: 'metric', tier: 'people', meta: `${bundle.departments.length} departments` })
    : null;
  const teamEntityNode = canTeams
    ? addNode({
        id: 'entity_team_count',
        label: 'Team network',
        group: 'metric',
        tier: 'people',
        meta: `${Object.values(bundle.teamMembersByTeamId).reduce((acc, list) => acc + list.length, 0)} team memberships`,
      })
    : null;

  if (membersNode && approvalsNode) connect(membersNode, approvalsNode);
  if (membersNode && departmentsNode) connect(membersNode, departmentsNode);
  if (departmentsNode && teamsNode) connect(departmentsNode, teamsNode);
  if (departmentsNode && deptEntityNode) connect(departmentsNode, deptEntityNode);
  if (teamsNode && teamEntityNode) connect(teamsNode, teamEntityNode);
  if (broadcastsNode && departmentsNode) connect(broadcastsNode, departmentsNode);
  if (rotaNode && departmentsNode) connect(rotaNode, departmentsNode);

  if (recruitmentNode && jobsNode) connect(recruitmentNode, jobsNode);
  if (jobsNode && applicationsNode) connect(jobsNode, applicationsNode);
  if (applicationsNode && interviewsNode) connect(applicationsNode, interviewsNode);
  if (applicationsNode && offersNode) connect(applicationsNode, offersNode);

  if (hrRecordsNode && onboardingNode) connect(hrRecordsNode, onboardingNode);
  if (hrRecordsNode && performanceNode) connect(hrRecordsNode, performanceNode);
  if (hrRecordsNode && leaveNode) connect(hrRecordsNode, leaveNode);
  if (membersNode && hrRecordsNode) connect(membersNode, hrRecordsNode);

  if (settingsNode && membersNode) connect(settingsNode, membersNode);
  if (settingsNode && departmentsNode) connect(settingsNode, departmentsNode);
  if (settingsNode && discountsNode) connect(settingsNode, discountsNode);

  return { nodes, edges };
}

