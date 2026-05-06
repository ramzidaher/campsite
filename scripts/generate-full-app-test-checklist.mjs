#!/usr/bin/env node
/**
 * Generates docs/FULL_APP_TEST_CHECKLIST.csv and docs/FULL_APP_TEST_CHECKLIST_GRANULAR.csv
 * Run from repo root: node scripts/generate-full-app-test-checklist.mjs
 */
import fs from 'fs';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');

function escapeCsv(s) {
  if (s == null) return '';
  const t = String(s);
  if (/[",\n\r]/.test(t)) return '"' + t.replace(/"/g, '""') + '"';
  return t;
}

function filePathToUrl(file) {
  let rel = file.replace(/^.*\/src\/app\//, '').replace(/\/page\.tsx$/, '');
  const segments = rel.split('/').filter(Boolean);
  const urlSegs = segments.filter((seg) => !/^\([^)]+\)$/.test(seg));
  if (urlSegs.length === 0) return '/';
  return '/' + urlSegs.join('/');
}

function extractPermissionKeys() {
  const permSrc = fs.readFileSync(path.join(root, 'packages/types/src/permissions.ts'), 'utf8');
  const block = permSrc.split('export const PERMISSION_KEYS = [')[1].split('] as const')[0];
  return [...block.matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

function extractFounderKeys() {
  const permSrc = fs.readFileSync(path.join(root, 'packages/types/src/permissions.ts'), 'utf8');
  const block = permSrc.split('export const FOUNDER_ONLY_PERMISSION_KEYS = [')[1].split('] as const')[0];
  return [...block.matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

const H = ['layer', 'module', 'id', 'description', 'path_or_key', 'permissions', 'platform', 'tested', 'pass_fail', 'notes'];

const rows = [];
function add(layer, module, id, description, pathKey, perms, platform) {
  rows.push([layer, module, id, description, pathKey, perms, platform, '', '', '']);
}

const PERMISSION_KEYS = extractPermissionKeys();
const FOUNDER_KEYS = extractFounderKeys();

PERMISSION_KEYS.forEach((k, i) => {
  const mod = k.split(/[._]/)[0];
  add('Permission', mod, `P-${String(i + 1).padStart(3, '0')}`, `has_permission + gated UI for ${k}`, k, k, 'web+mobile');
});
FOUNDER_KEYS.forEach((k, i) => {
  add('Permission', 'founder', `PF-${String(i + 1).padStart(2, '0')}`, `Founder-only: ${k}`, k, k, 'web');
});

const glob = execSync('find apps/web/src/app -name page.tsx -print | sort', { encoding: 'utf8', cwd: root })
  .trim()
  .split('\n')
  .filter(Boolean);

glob.forEach((file, i) => {
  const url = filePathToUrl(file);
  const mod = file.includes('/(public)/')
    ? 'Public'
    : file.includes('/(founders)/')
      ? 'Founders'
      : file.includes('/(auth)/')
        ? 'Auth'
        : file.includes('/legal/')
          ? 'Legal'
          : 'Main';
  add('Route', mod, `R-${String(i + 1).padStart(3, '0')}`, 'Load page; verify authz + critical flows', url, '(page-specific)', 'web');
});

const apiRoutes = [
  ['api/health', 'GET health check'],
  ['api/push-token', 'Register push token'],
  ['api/broadcasts/summarize', 'AI summarize broadcast'],
  ['api/resources/summarize', 'AI summarize resource'],
  ['api/resources/chat', 'Resource doc assistant chat'],
  ['api/unsplash/photos', 'Unsplash search'],
  ['api/unsplash/track-download', 'Unsplash track'],
  ['api/google/oauth/start', 'Google OAuth start'],
  ['api/google/oauth/callback', 'Google OAuth callback'],
  ['api/admin/roles', 'List/create roles'],
  ['api/admin/roles/[roleId]', 'Update role'],
  ['api/admin/custom-roles', 'Custom roles'],
  ['api/admin/custom-roles/[roleId]', 'Custom role by id'],
  ['api/admin/permissions/bootstrap', 'Seed permission catalog'],
  ['api/admin/invite-member', 'Invite member'],
  ['api/admin/resend-access-email', 'Resend access email'],
  ['api/admin/members/assign-role', 'Assign role'],
  ['api/admin/members/assignable-roles', 'Assignable roles'],
  ['api/admin/members/update-reports-to', 'Update reports-to'],
  ['api/admin/members/[userId]/permission-overrides', 'Permission overrides'],
  ['api/admin/job-applications/[id]/cv', 'Download CV'],
  ['api/admin/application-offers/[offerId]/pdf', 'Offer PDF'],
  ['api/admin/rota-sheets-import', 'Rota import'],
];

apiRoutes.forEach(([p, d], i) => {
  add('API', 'api', `A-${String(i + 1).padStart(3, '0')}`, d, p, 'varies (admin RPC)', 'web');
});

const mobile = [
  ['/', 'Home tab (index)'],
  ['/broadcasts', 'Broadcasts tab'],
  ['/calendar', 'Calendar tab'],
  ['/rota', 'Rota tab'],
  ['/discount', 'Discount tab'],
  ['/hr', 'HR tab (hub)'],
  ['/broadcast/[id]', 'Broadcast detail'],
  ['/broadcast-compose', 'Compose broadcast'],
  ['/broadcast-pending', 'Pending broadcasts screen'],
  ['/resources/index', 'Resources list (stack)'],
  ['/resources/[id]', 'Resource detail'],
  ['/discount-scan', 'Discount QR scan'],
  ['/pending', 'Account pending'],
  ['/pending-approvals', 'Pending approvals'],
  ['/settings', 'Settings'],
  ['/auth/callback', 'Auth callback'],
  ['/(auth)/login', 'Login'],
  ['/(auth)/forgot-password', 'Forgot password'],
  ['/(auth)/register', 'Register wizard'],
  ['/(auth)/register/done', 'Register done'],
  ['/one-on-one/[meetingId]', '1:1 detail'],
  ['/modal', 'Modal host'],
  ['/+not-found', '404'],
];

mobile.forEach(([p, d], i) => {
  add('Mobile', 'expo', `M-${String(i + 1).padStart(3, '0')}`, d, p, 'get_my_permissions RPC', 'mobile');
});

const cross = [
  ['CrossCutting', 'shell', 'X-001', 'Main sidebar: Dashboard', '/dashboard', 'authenticated', 'web'],
  ['CrossCutting', 'shell', 'X-002', 'Main sidebar: Settings footer', '/settings', 'authenticated', 'web'],
  ['CrossCutting', 'shell', 'X-003', 'Top bar: notification dropdown + badge counts', '(layout)', 'varies', 'web'],
  ['CrossCutting', 'shell', 'X-004', 'Top bar: member search (HR)', '(AppTopBar)', 'hr.view_records|hr.view_direct_reports', 'web'],
  ['CrossCutting', 'shell', 'X-005', 'Admin/Manager/HR nav accordions + localStorage', '(AppShell)', 'any', 'web'],
  ['CrossCutting', 'broadcasts', 'X-006', 'Broadcasts approvals (Sent for approval)', '/broadcasts?tab=submitted', 'broadcasts.approve', 'web'],
  ['CrossCutting', 'static', 'X-007', 'Static HTML: campsite_careers_portal.html', 'repo root', 'n/a', 'static'],
  ['CrossCutting', 'static', 'X-008', 'Static HTML: campsite_careers_register.html', 'repo root', 'n/a', 'static'],
  ['CrossCutting', 'static', 'X-009', 'Static HTML: campsite_job_application_portal.html', 'repo root', 'n/a', 'static'],
  ['CrossCutting', 'founders', 'X-010', 'Founder HQ: companies + drill-downs', '/founders', 'founder.platform.manage', 'web'],
  ['CrossCutting', 'founders', 'X-011', 'Founder HQ: legal policies editor', '/founders', 'founder.platform.manage', 'web'],
  ['CrossCutting', 'founders', 'X-012', 'Founder HQ: RBAC catalog', '/founders', 'founder.platform.manage', 'web'],
  ['CrossCutting', 'founders', 'X-013', 'Founder HQ: global pending approvals', '/founders', 'founder.platform.manage', 'web'],
  ['CrossCutting', 'founders', 'X-014', 'Founder HQ: broadcasts HQ', '/founders', 'founder.platform.manage', 'web'],
  ['CrossCutting', 'founders', 'X-015', 'Founder HQ: rota HQ', '/founders', 'founder.platform.manage', 'web'],
  ['CrossCutting', 'founders', 'X-016', 'Founder HQ: audit log', '/founders', 'founder.platform.manage', 'web'],
  ['CrossCutting', 'founders', 'X-017', 'Founder HQ: revenue / growth / analytics views', '/founders', 'founder.platform.manage', 'web'],
];

cross.forEach((r) => {
  rows.push([...r, '', '', '']);
});

const outMain = [H.join(',')];
for (const r of rows) {
  outMain.push(r.map(escapeCsv).join(','));
}

fs.writeFileSync(path.join(root, 'docs/FULL_APP_TEST_CHECKLIST.csv'), outMain.join('\n') + '\n', 'utf8');

// --- Granular sub-features (flows and UI clusters) ---
const G = ['layer', 'parent_route', 'id', 'feature', 'permissions', 'platform', 'tested', 'pass_fail', 'notes'];
const granular = [];

function g(parent, id, feature, perms, platform) {
  granular.push(['Granular', parent, id, feature, perms, platform, '', '', '']);
}

g('/dashboard', 'G-001', 'Dashboard: stat tiles + quick action cards navigate correctly', 'varies', 'web');
g('/broadcasts', 'G-002', 'Broadcasts: unread state + open detail', 'broadcasts.view', 'web');
g('/broadcasts', 'G-003', 'Broadcasts: compose draft + submit/approval path', 'broadcasts.compose', 'web');
g('/broadcasts', 'G-004', 'Broadcasts: pending approval tab + approve/deny', 'broadcasts.approve', 'web');
g('/broadcasts/[id]', 'G-005', 'Broadcast detail: body render + images + mark read', 'broadcasts.view', 'web');
g('/resources', 'G-006', 'Resources: list + open document', 'authenticated', 'web');
g('/resources/new', 'G-007', 'Resources: upload new document (manage)', 'resources.manage', 'web');
g('/resources/[id]', 'G-008', 'Resources: AI summarize/chat if enabled', 'resources.manage', 'web');
g('/calendar', 'G-009', 'Calendar: events load + navigation', 'authenticated', 'web');
g('/rota', 'G-010', 'Rota: view shifts + edit if permitted', 'rota.view', 'web');
g('/rota', 'G-011', 'Rota: swap/request + peer approval + final approval', 'rota.edit|rota.final_approve', 'web');
g('/discount', 'G-012', 'Discount: show QR + tier', 'discounts.view', 'web');
g('/discount/scan', 'G-013', 'Discount: scan/verify flow', 'discounts.verify_qr', 'web');
g('/leave', 'G-014', 'Leave: submit request', 'leave.submit', 'web');
g('/leave', 'G-015', 'Leave: approve direct reports', 'leave.approve_direct_reports', 'web');
g('/performance', 'G-016', 'Performance: list cycles + open review', 'performance.view_own|review_direct_reports', 'web');
g('/onboarding', 'G-017', 'Onboarding: complete tasks', 'onboarding.complete_own_tasks', 'web');
g('/one-on-ones', 'G-018', '1:1: list meetings + open detail', 'one_on_one.view_own', 'web');
g('/settings', 'G-019', 'Settings: profile + org prefs as shown', 'authenticated', 'web');
g('/settings/discount-tiers', 'G-020', 'Discount tiers CRUD', 'org.settings.manage|discounts', 'web');
g('/admin/users', 'G-021', 'Members: invite + role change + status', 'members.invite|members.edit_roles', 'web');
g('/admin/roles', 'G-022', 'Roles: edit permissions + presets', 'roles.manage', 'web');
g('/admin/pending', 'G-023', 'Pending: approve/reject member', 'approvals.members.review', 'web');
g('/admin/rota-import', 'G-024', 'Rota import upload', 'rota.manage', 'web');
g('/hr/applications', 'G-025', 'Applications: pipeline + stage move', 'applications.move_stage', 'web');
g('/hr/jobs', 'G-026', 'Jobs: create/edit/publish/archive', 'jobs.manage', 'web');
g('/hr/offer-templates', 'G-027', 'Offer templates: create + variables', 'offers.manage', 'web');
g('/hr/interviews', 'G-028', 'Interviews: slots + book + complete', 'interviews.manage', 'web');
g('/hr/records/[userId]', 'G-029', 'HR record: sensitive fields + edit', 'hr.manage_records', 'web');
g('/hr/wagesheets', 'G-030', 'Wagesheets: view/export', 'payroll.view', 'web');
g('/public/jobs', 'G-031', 'Careers: list jobs', 'public', 'web');
g('/public/jobs/[slug]/apply', 'G-032', 'Careers: submit application + CV', 'public', 'web');
g('/public/jobs/offer-sign/[token]', 'G-033', 'Candidate: e-sign offer', 'public token', 'web');
g('/profile', 'G-034', 'My profile: HR fields', 'hr.view_own', 'web');
g('/notifications/recruitment', 'G-035', 'Notification center: recruitment', 'recruitment.view', 'web');
g('/notifications/applications', 'G-036', 'Notification center: applications', 'applications.view', 'web');
g('/notifications/leave', 'G-037', 'Notification center: leave', 'leave.view_own', 'web');
g('/notifications/hr-metrics', 'G-038', 'Notification center: HR metrics', 'hr.view_records', 'web');
g('mobile/hr hub', 'G-039', 'HR tab: Time off sub-screen', 'leave.*', 'mobile');
g('mobile/hr hub', 'G-040', 'HR tab: Attendance sub-screen', 'leave.view_own', 'mobile');
g('mobile/hr hub', 'G-041', 'HR tab: Performance sub-screen', 'performance.view_own', 'mobile');
g('mobile/hr hub', 'G-042', 'HR tab: 1:1 list when permitted', 'one_on_one.view_own', 'mobile');
g('mobile/hr hub', 'G-043', 'HR tab: Onboarding sub-screen', 'onboarding.complete_own_tasks', 'mobile');
g('mobile/broadcasts', 'G-044', 'Broadcasts tab: feed + navigate to detail', 'broadcasts.view', 'mobile');
g('mobile/discount', 'G-045', 'Discount tab: QR + open scan', 'discounts.view', 'mobile');
g('/admin/departments', 'G-046', 'Departments: merge two depts (edit panel → merge)', 'departments.manage', 'web');
g('/admin/users', 'G-047', 'Member detail: permission overrides (reports-to scope only)', 'members.edit_roles', 'web');
g('/manager/system-overview', 'G-048', 'Manager system overview (scoped graph if permitted)', 'varies', 'web');
g('/hr/org-chart', 'G-049', 'Org chart: reports_to tree + masked manager if hidden', 'hr.view_records', 'web');
g('/hr/recruitment', 'G-050', 'Recruitment: request → approve → create job chain', 'recruitment.*|jobs.*', 'web');
g('/pending', 'G-051', 'User with pending status: limited shell until approved', 'unassigned', 'web');
g('/founders', 'G-052', 'Founder HQ: after add-platform-founder  orgs + RBAC + legal', 'founder.*', 'web');
g('seed/QA', 'G-053', 'Regression: approve seeded pending user (campsite-qa-pending)', 'approvals.members.review', 'web');
g('seed/QA', 'G-054', 'Isolation: Activities vs Events user cannot see other dept private lists', 'dept_scoped', 'web');
g('/admin/integrations', 'G-055', 'Integrations: Google OAuth connect if configured', 'integrations.manage', 'web');
g('/attendance', 'G-056', 'Attendance view (HR nav)', 'leave.view_own', 'web');
g('/hr/timesheets', 'G-057', 'Timesheet review (manager/HR)', 'leave.approve_direct_reports|leave.manage_org', 'web');
g('/admin/scan-logs', 'G-058', 'Discount activity / scan logs', 'members.view', 'web');
g('jest', 'G-059', 'Automated: npm test (turbo)  lib/authz + rules', 'n/a', 'ci');
g('manual', 'G-060', 'Read docs/QA_SEED_AND_SCENARIOS.md scenario tables end-to-end', 'n/a', 'web+mobile');

const outG = [G.join(',')];
for (const r of granular) {
  outG.push(r.map(escapeCsv).join(','));
}
fs.writeFileSync(path.join(root, 'docs/FULL_APP_TEST_CHECKLIST_GRANULAR.csv'), outG.join('\n') + '\n', 'utf8');

console.log('PERMISSION_KEYS:', PERMISSION_KEYS.length);
console.log('FOUNDER_KEYS:', FOUNDER_KEYS.length);
console.log('Routes:', glob.length);
console.log('Wrote docs/FULL_APP_TEST_CHECKLIST.csv lines', outMain.length);
console.log('Wrote docs/FULL_APP_TEST_CHECKLIST_GRANULAR.csv lines', outG.length);
