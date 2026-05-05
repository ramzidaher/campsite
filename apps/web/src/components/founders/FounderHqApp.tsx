'use client';

import { FormSelect } from '@campsite/ui/web';
import { ArrowRight } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  deactivatePlatformOrg,
  deletePlatformOrgUser,
  permanentlyDeletePlatformOrg,
  publishPermissionCatalogVersion,
  setFounderProfileStatus,
  startSupportViewAsSession,
  updatePlatformOrgSettings,
  updateOrganisationGovernance,
  upsertPermissionDraftEntry,
  upsertRolePreset,
} from '@/app/(founders)/founders/platform-actions';
import {
  type FounderAuditEvent,
  type FounderBroadcast,
  type FounderMember,
  type FounderOrg,
  type FounderPermissionCatalogEntry,
  type FounderOrgProfile,
  type FounderRolePreset,
  type FounderRotaShift,
  parseFounderOrgProfiles,
} from '@/components/founders/founderTypes';
import { escapeHtml } from '@/components/founders/mockData';
import { relTime } from '@/lib/format/relTime';
import {
  isValidWorkspaceSlug,
  normalizeWorkspaceSlugInput,
  suggestSlugFromOrganisationName,
} from '@/lib/org/slug';
import { FounderLegalPoliciesPanel } from '@/components/founders/FounderLegalPoliciesPanel';
import type { PlatformLegalSettings } from '@/lib/legal/types';
import { createClient } from '@/lib/supabase/client';
import { tenantAdminDashboardUrl } from '@/lib/tenant/adminUrl';

export type FounderHqUser = {
  displayName: string;
  firstName: string;
  initials: string;
  avatarUrl: string | null;
  email: string;
};

const PAGE_LABELS: Record<string, string> = {
  overview: 'Company Overview',
  campsites: 'All Campsites',
  revenue: 'Revenue & Finance',
  growth: 'Growth & Analytics',
  members: 'All Members',
  'pending-global': 'Pending Approvals',
  'broadcasts-hq': 'Broadcasts HQ',
  'rota-hq': 'Rota Overview',
  'audit-hq': 'Audit Log',
  'rbac-hq': 'RBAC Catalog',
  'legal-hq': 'Legal policies',
  'settings-hq': 'Platform Settings',
};

type FounderPageKey = keyof typeof PAGE_LABELS;

function greeting(hour: number, firstName: string) {
  if (hour < 12) return `Good morning, ${firstName}`;
  if (hour < 17) return `Good afternoon, ${firstName}`;
  return `Good evening, ${firstName}`;
}

const ROLE_MAP: Record<string, string> = {
  org_admin: 'rb-admin',
  manager: 'rb-mgr',
  coordinator: 'rb-coord',
  administrator: 'rb-coord',
  duty_manager: 'rb-mgr',
  csa: 'rb-staff',
  society_leader: 'rb-coord',
  admin: 'rb-admin',
  mgr: 'rb-mgr',
  coord: 'rb-coord',
  staff: 'rb-staff',
};

const ROLE_LBL: Record<string, string> = {
  org_admin: 'Org admin',
  manager: 'Manager',
  coordinator: 'Coordinator',
  administrator: 'Administrator',
  duty_manager: 'Duty manager',
  csa: 'CSA',
  society_leader: 'Society leader',
  admin: 'Super Admin',
  mgr: 'Manager',
  coord: 'Coordinator',
  staff: 'Weekly Paid',
};

type OrgStatusFilter = 'all' | 'open' | 'closed';

function orgStatusFilter(o: FounderOrg, f: OrgStatusFilter): boolean {
  if (f === 'all') return true;
  if (f === 'open') return o.is_active;
  return !o.is_active;
}

function statusClsFromOrg(o: FounderOrg) {
  return o.is_active ? 'cs-open' : 'cs-closed';
}

function statusLabelFromOrg(o: FounderOrg) {
  return o.is_active ? '● Active' : '○ Inactive';
}

function memberInitials(name: string) {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (p.length === 0) return '?';
  if (p.length === 1) return p[0]!.slice(0, 2).toUpperCase();
  return (p[0]![0]! + p[p.length - 1]![0]!).toUpperCase();
}

function formatJoined(iso: string) {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return '-';
  }
}

function isoToDatetimeLocalValue(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function datetimeLocalToIso(local: string): string | null {
  if (!local.trim()) return null;
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function trialDaysRemaining(trialEndsAt: string | null | undefined): number | null {
  if (!trialEndsAt) return null;
  const end = new Date(trialEndsAt).getTime();
  if (Number.isNaN(end)) return null;
  return Math.ceil((end - Date.now()) / 86400000);
}

export function FounderHqApp({
  user,
  initialOrgs,
  initialAllMembers,
  initialCatalogDraft,
  initialRolePresets,
  initialAuditEvents,
  initialBroadcasts,
  initialRotaShifts,
  initialLegalSettings,
  loadError,
}: {
  user: FounderHqUser;
  initialOrgs: FounderOrg[];
  initialAllMembers: FounderMember[];
  initialCatalogDraft: FounderPermissionCatalogEntry[];
  initialRolePresets: FounderRolePreset[];
  initialAuditEvents: FounderAuditEvent[];
  initialBroadcasts: FounderBroadcast[];
  initialRotaShifts: FounderRotaShift[];
  initialLegalSettings: PlatformLegalSettings;
  loadError?: string;
}) {
  const router = useRouter();
  const [orgs, setOrgs] = useState<FounderOrg[]>(initialOrgs);
  const [allMembers, setAllMembers] = useState<FounderMember[]>(initialAllMembers);
  const [catalogDraft, setCatalogDraft] = useState<FounderPermissionCatalogEntry[]>(initialCatalogDraft);
  const [rolePresets, setRolePresets] = useState<FounderRolePreset[]>(initialRolePresets);
  const [auditEvents, setAuditEvents] = useState<FounderAuditEvent[]>(initialAuditEvents);
  const [broadcasts, setBroadcasts] = useState<FounderBroadcast[]>(initialBroadcasts);
  const [rotaShifts, setRotaShifts] = useState<FounderRotaShift[]>(initialRotaShifts);

  useEffect(() => {
    setOrgs(initialOrgs);
  }, [initialOrgs]);
  useEffect(() => {
    setAllMembers(initialAllMembers);
  }, [initialAllMembers]);
  useEffect(() => {
    setCatalogDraft(initialCatalogDraft);
  }, [initialCatalogDraft]);
  useEffect(() => {
    setRolePresets(initialRolePresets);
  }, [initialRolePresets]);
  useEffect(() => {
    setAuditEvents(initialAuditEvents);
  }, [initialAuditEvents]);
  useEffect(() => {
    setBroadcasts(initialBroadcasts);
  }, [initialBroadcasts]);
  useEffect(() => {
    setRotaShifts(initialRotaShifts);
  }, [initialRotaShifts]);

  const [activePage, setActivePage] = useState<FounderPageKey>('overview');
  const [csFilter, setCsFilter] = useState<OrgStatusFilter>('all');
  const [csQuery, setCsQuery] = useState('');
  const [modal, setModal] = useState<'campsite' | 'new-site' | 'broadcast' | null>(null);
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null);
  const [csTab, setCsTab] = useState<'members' | 'rota' | 'broadcasts' | 'settings'>('members');
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [flagSheets, setFlagSheets] = useState(true);
  const [flagBroadcast, setFlagBroadcast] = useState(true);
  const [flagBeta, setFlagBeta] = useState(false);
  const [memberQuery, setMemberQuery] = useState('');
  const [memberSite, setMemberSite] = useState<string>('all');
  const [memberRole, setMemberRole] = useState<string>('all');
  const [memberStatusTab, setMemberStatusTab] = useState<'all' | 'active' | 'pending' | 'inactive'>('all');
  const [newSite, setNewSite] = useState({ name: '', slug: '' });
  const [newSiteSlugTouched, setNewSiteSlugTouched] = useState(false);
  const [creatingOrg, setCreatingOrg] = useState(false);
  const [modalOrgMembers, setModalOrgMembers] = useState<FounderOrgProfile[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersLoadErr, setMembersLoadErr] = useState<string | null>(null);
  const [settingsDraft, setSettingsDraft] = useState({
    name: '',
    slug: '',
    logo_url: '',
    is_active: true,
  });
  const [permanentDeleteConfirm, setPermanentDeleteConfirm] = useState('');
  const [busySaveOrg, setBusySaveOrg] = useState(false);
  const [busyDeactivate, setBusyDeactivate] = useState(false);
  const [busyHardDelete, setBusyHardDelete] = useState(false);
  const [busyRemoveUserId, setBusyRemoveUserId] = useState<string | null>(null);
  const [busyProfileId, setBusyProfileId] = useState<string | null>(null);
  const [governanceActionOverlay, setGovernanceActionOverlay] = useState<{ orgId: string; label: string } | null>(null);
  const governanceOverlayTimer = useRef<number | null>(null);
  const firstOrgId = orgs[0]?.id ?? '';
  const [broadcastDraft, setBroadcastDraft] = useState({
    title: '',
    audience: 'all' as 'all' | 'site',
    siteId: firstOrgId,
    body: '',
  });
  const [catalogForm, setCatalogForm] = useState({
    key: '',
    label: '',
    description: '',
    category: 'other',
    is_founder_only: false,
  });
  const [publishNote, setPublishNote] = useState('');
  const [presetForm, setPresetForm] = useState({
    key: '',
    name: '',
    description: '',
    target_use_case: '',
    recommended_permission_keys: '',
  });
  const [auditOrgFilter, setAuditOrgFilter] = useState('all');
  const [auditEventFilter, setAuditEventFilter] = useState('all');
  const [supportToken, setSupportToken] = useState<string | null>(null);
  const [legalSettings, setLegalSettings] = useState<PlatformLegalSettings>(initialLegalSettings);

  useEffect(() => {
    if (broadcastDraft.siteId || !orgs[0]?.id) return;
    setBroadcastDraft((d) => ({ ...d, siteId: orgs[0]!.id }));
  }, [orgs, broadcastDraft.siteId]);

  const hour = new Date().getHours();
  const heroGreeting = `${greeting(hour, user.firstName)} ☀️`;

  const heroDate = useMemo(() => {
    return new Date().toLocaleDateString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
  }, []);

  const clearGovernanceActionOverlay = useCallback(() => {
    if (governanceOverlayTimer.current !== null) {
      window.clearTimeout(governanceOverlayTimer.current);
      governanceOverlayTimer.current = null;
    }
    setGovernanceActionOverlay(null);
  }, []);

  const showGovernanceActionOverlay = useCallback(
    (orgId: string, label: string, autoHideMs?: number) => {
      if (governanceOverlayTimer.current !== null) {
        window.clearTimeout(governanceOverlayTimer.current);
        governanceOverlayTimer.current = null;
      }
      setGovernanceActionOverlay({ orgId, label });
      if (!autoHideMs) return;
      governanceOverlayTimer.current = window.setTimeout(() => {
        setGovernanceActionOverlay((curr) =>
          curr && curr.orgId === orgId && curr.label === label ? null : curr
        );
        governanceOverlayTimer.current = null;
      }, autoHideMs);
    },
    []
  );

  useEffect(() => {
    return () => {
      if (governanceOverlayTimer.current !== null) {
        window.clearTimeout(governanceOverlayTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2800);
    return () => clearTimeout(t);
  }, [toast]);

  const navTo = useCallback((page: FounderPageKey) => {
    setActivePage(page);
  }, []);

  const totalMemberCount = allMembers.length;
  const activeOrgCount = useMemo(() => orgs.filter((o) => o.is_active).length, [orgs]);
  const totalBroadcasts = useMemo(() => orgs.reduce((s, o) => s + o.broadcast_count, 0), [orgs]);
  const inactiveOrgCount = useMemo(() => orgs.filter((o) => !o.is_active).length, [orgs]);
  const pendingMembers = useMemo(
    () => allMembers.filter((m) => m.status === 'pending'),
    [allMembers]
  );
  const pendingApprovalsCount = pendingMembers.length;
  const activeMembersCount = useMemo(
    () => allMembers.filter((m) => m.status === 'active').length,
    [allMembers]
  );

  const platformActivityLines = useMemo(() => {
    type Raw = { at: number; key: string; icon: string; html: string };
    const raw: Raw[] = [];
    for (const o of orgs) {
      const at = Date.parse(o.created_at);
      if (!Number.isNaN(at)) {
        raw.push({
          at,
          key: `org-${o.id}`,
          icon: '⛺',
          html: `Organisation <strong>${escapeHtml(o.name)}</strong> <span style="color:var(--text3)">(${escapeHtml(o.slug)})</span>`,
        });
      }
    }
    for (const m of allMembers) {
      const at = Date.parse(m.created_at);
      if (Number.isNaN(at)) continue;
      const st = m.status === 'pending' ? 'pending approval' : m.status;
      raw.push({
        at,
        key: `mem-${m.id}`,
        icon: m.status === 'pending' ? '⏳' : '👤',
        html: `<strong>${escapeHtml(m.full_name)}</strong> · ${escapeHtml(m.org_name)} <span style="color:var(--text3)">(${escapeHtml(st)})</span>`,
      });
    }
    return raw
      .sort((a, b) => b.at - a.at)
      .slice(0, 12)
      .map((r) => ({
        key: r.key,
        icon: r.icon,
        html: r.html,
        time: relTime(new Date(r.at).toISOString()),
      }));
  }, [orgs, allMembers]);

  const platformAlerts = useMemo(() => {
    type A = { kind: 'warn' | 'info' | 'success'; html: string };
    const out: A[] = [];
    for (const o of orgs.filter((x) => !x.is_active).slice(0, 3)) {
      out.push({
        kind: 'warn',
        html: `<strong>${escapeHtml(o.name)}</strong> is inactive - tenants cannot use this workspace.`,
      });
    }
    if (pendingApprovalsCount > 0) {
      out.push({
        kind: 'info',
        html: `${pendingApprovalsCount} profile${pendingApprovalsCount === 1 ? '' : 's'} with <strong>pending</strong> status across organisations.`,
      });
    }
    if (out.length === 0) {
      out.push({
        kind: 'success',
        html: 'No inactive organisations and no pending profiles in the snapshot.',
      });
    }
    return out;
  }, [orgs, pendingApprovalsCount]);

  const snapshotOrgBars = useMemo(() => {
    const sorted = [...orgs].sort((a, b) => b.user_count - a.user_count).slice(0, 6);
    const max = Math.max(1, sorted[0]?.user_count ?? 1);
    return sorted.map((o, i) => ({
      key: o.id,
      label: o.name,
      n: o.user_count,
      h: Math.max(8, Math.round((o.user_count / max) * 44)),
      highlight: i === 0 && sorted.length > 0,
    }));
  }, [orgs]);

  const growthSitesReal = useMemo(() => {
    const cutoff = Date.now() - 30 * 86400000;
    const map = new Map<string, number>();
    for (const m of allMembers) {
      const t = Date.parse(m.created_at);
      if (Number.isNaN(t) || t < cutoff) continue;
      map.set(m.org_id, (map.get(m.org_id) ?? 0) + 1);
    }
    return [...orgs]
      .filter((o) => o.is_active)
      .map((c) => ({ c, n: map.get(c.id) ?? 0 }))
      .sort((a, b) => b.n - a.n || b.c.user_count - a.c.user_count)
      .slice(0, 8);
  }, [orgs, allMembers]);

  const filteredOrgs = useMemo(() => {
    const q = csQuery.toLowerCase().trim();
    return orgs.filter((o) => {
      if (!orgStatusFilter(o, csFilter)) return false;
      if (!q) return true;
      return `${o.name} ${o.slug}`.toLowerCase().includes(q);
    });
  }, [orgs, csFilter, csQuery]);

  const topOrgs = useMemo(() => {
    return [...orgs]
      .filter((o) => o.is_active)
      .sort((a, b) => b.user_count - a.user_count)
      .slice(0, 5);
  }, [orgs]);

  const revenueSites = useMemo(() => {
    const sites = [...orgs].filter((o) => o.user_count > 0).sort((a, b) => b.user_count - a.user_count);
    const max = sites[0]?.user_count ?? 1;
    return { sites, max };
  }, [orgs]);

  // Real monthly member-registration trend for the last 6 months.
  const memberTrend = useMemo(() => {
    const now = new Date();
    const months: { label: string; count: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const label = d.toLocaleDateString('en-GB', { month: 'short' });
      const yr = d.getFullYear();
      const mo = d.getMonth();
      const count = allMembers.filter((m) => {
        const t = new Date(m.created_at);
        return t.getFullYear() === yr && t.getMonth() === mo;
      }).length;
      months.push({ label, count });
    }
    return months;
  }, [allMembers]);
  const memberTrendMax = Math.max(1, ...memberTrend.map((x) => x.count));

  // Real computed growth stats
  const growthStats = useMemo(() => {
    const now = new Date();
    const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
    const thisMonthMembers = allMembers.filter((m) => Date.parse(m.created_at) >= startOfThisMonth).length;
    const lastMonthMembers = allMembers.filter(
      (m) => Date.parse(m.created_at) >= startOfLastMonth && Date.parse(m.created_at) < startOfThisMonth,
    ).length;
    const momPct = lastMonthMembers > 0 ? ((thisMonthMembers - lastMonthMembers) / lastMonthMembers) * 100 : null;
    const startOfYear = new Date(now.getFullYear(), 0, 1).getTime();
    const newOrgsThisYear = orgs.filter((o) => Date.parse(o.created_at) >= startOfYear).length;
    const activeRate = totalMemberCount > 0 ? Math.round((activeMembersCount / totalMemberCount) * 100) : 0;
    return { thisMonthMembers, lastMonthMembers, momPct, newOrgsThisYear, activeRate };
  }, [allMembers, orgs, totalMemberCount, activeMembersCount]);

  // Subscription summary for revenue page
  const subscriptionSummary = useMemo(() => {
    const trialCount = orgs.filter((o) => o.subscription_status === 'trial').length;
    const activeCount = orgs.filter((o) => o.subscription_status === 'active').length;
    const limitedCount = orgs.filter((o) => o.subscription_status === 'limited').length;
    const suspendedCount = orgs.filter((o) => o.subscription_status === 'suspended').length;
    return { trialCount, activeCount, limitedCount, suspendedCount };
  }, [orgs]);

  const growthBarMax = useMemo(() => Math.max(1, ...growthSitesReal.map((x) => x.n), 1), [growthSitesReal]);

  const memberSiteOptions = useMemo(() => {
    const names = [...new Set(orgs.map((o) => o.name))].sort();
    return ['all', ...names];
  }, [orgs]);

  const filteredMembers = useMemo(() => {
    const q = memberQuery.toLowerCase().trim();
    return allMembers.filter((m) => {
      if (memberSite !== 'all' && m.org_name !== memberSite) return false;
      if (memberRole !== 'all' && m.role !== memberRole) return false;
      if (memberStatusTab !== 'all' && m.status !== memberStatusTab) return false;
      if (!q) return true;
      const em = m.email ?? '';
      return `${m.full_name} ${em} ${m.org_name}`.toLowerCase().includes(q);
    });
  }, [allMembers, memberQuery, memberSite, memberRole, memberStatusTab]);

  const currentOrg: FounderOrg | undefined = useMemo(
    () => orgs.find((x) => x.id === selectedOrgId),
    [orgs, selectedOrgId]
  );

  useEffect(() => {
    if (modal !== 'campsite' || !selectedOrgId) return;
    let cancelled = false;
    (async () => {
      setMembersLoading(true);
      setMembersLoadErr(null);
      const supabase = createClient();
      const { data, error } = await supabase.rpc('platform_org_profiles_list', { p_org_id: selectedOrgId });
      if (cancelled) return;
      setMembersLoading(false);
      if (error) {
        setMembersLoadErr(error.message);
        setModalOrgMembers([]);
        return;
      }
      setModalOrgMembers(parseFounderOrgProfiles(data));
    })();
    return () => {
      cancelled = true;
    };
  }, [modal, selectedOrgId]);

  const modalRota = useMemo(
    () => rotaShifts.filter((s) => s.org_id === selectedOrgId).slice(0, 20),
    [rotaShifts, selectedOrgId],
  );
  const modalBroadcasts = useMemo(
    () => broadcasts.filter((b) => b.org_id === selectedOrgId).slice(0, 10),
    [broadcasts, selectedOrgId],
  );

  const openOrgDetail = (id: string) => {
    const o = orgs.find((x) => x.id === id);
    if (o) {
      setSettingsDraft({
        name: o.name,
        slug: o.slug,
        logo_url: o.logo_url ?? '',
        is_active: o.is_active,
      });
      setPermanentDeleteConfirm('');
    }
    setSelectedOrgId(id);
    setCsTab('members');
    setModal('campsite');
  };

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  const openCampsiteAdmin = () => {
    const o = orgs.find((c) => c.id === selectedOrgId);
    setModal(null);
    if (!o) {
      showToast('Organisation not found');
      return;
    }
    window.location.href = tenantAdminDashboardUrl(o.slug);
  };

  async function saveOrgSettings() {
    if (!selectedOrgId) return;
    const slug = normalizeWorkspaceSlugInput(settingsDraft.slug);
    if (!isValidWorkspaceSlug(slug)) {
      showToast('Enter a valid subdomain slug (2-63 chars, lowercase letters, numbers, hyphens).');
      return;
    }
    setBusySaveOrg(true);
    const result = await updatePlatformOrgSettings({
      orgId: selectedOrgId,
      name: settingsDraft.name.trim(),
      slug,
      logoUrl: settingsDraft.logo_url.trim() ? settingsDraft.logo_url.trim() : null,
      isActive: settingsDraft.is_active,
    });
    setBusySaveOrg(false);
    if (!result.ok) {
      showToast(result.error);
      return;
    }
    setOrgs((prev) =>
      prev.map((o) =>
        o.id === selectedOrgId
          ? {
              ...o,
              name: settingsDraft.name.trim(),
              slug,
              logo_url: settingsDraft.logo_url.trim() ? settingsDraft.logo_url.trim() : null,
              is_active: settingsDraft.is_active,
            }
          : o
      )
    );
    showToast('Organisation saved');
    router.refresh();
  }

  async function handleDeactivateOrg() {
    if (!selectedOrgId) return;
    setBusyDeactivate(true);
    const r = await deactivatePlatformOrg(selectedOrgId);
    setBusyDeactivate(false);
    if (!r.ok) {
      showToast(r.error);
      return;
    }
    setSettingsDraft((s) => ({ ...s, is_active: false }));
    setOrgs((prev) => prev.map((o) => (o.id === selectedOrgId ? { ...o, is_active: false } : o)));
    showToast('Organisation deactivated');
    router.refresh();
  }

  async function handlePermanentDeleteOrg() {
    if (!selectedOrgId || !currentOrg) return;
    if (permanentDeleteConfirm.trim() !== currentOrg.name.trim()) {
      showToast('Type the organisation name exactly to confirm deletion.');
      return;
    }
    setBusyHardDelete(true);
    const r = await permanentlyDeletePlatformOrg(selectedOrgId);
    setBusyHardDelete(false);
    if (!r.ok) {
      showToast(r.error);
      return;
    }
    showToast('Organisation permanently deleted');
    setModal(null);
    setSelectedOrgId(null);
    setOrgs((prev) => prev.filter((o) => o.id !== selectedOrgId));
    setAllMembers((prev) => prev.filter((m) => m.org_id !== selectedOrgId));
    router.refresh();
  }

  async function handleRemoveMember(orgId: string, profileUserId: string) {
    setBusyRemoveUserId(profileUserId);
    const r = await deletePlatformOrgUser(orgId, profileUserId);
    setBusyRemoveUserId(null);
    if (!r.ok) {
      showToast(r.error);
      return;
    }
    showToast('User removed');
    setModalOrgMembers((prev) => prev.filter((m) => m.id !== profileUserId));
    setAllMembers((prev) => prev.filter((m) => m.id !== profileUserId));
    setOrgs((prev) =>
      prev.map((o) => (o.id === orgId ? { ...o, user_count: Math.max(0, o.user_count - 1) } : o))
    );
    router.refresh();
  }

  useEffect(() => {
    if (newSiteSlugTouched || !newSite.name.trim()) return;
    setNewSite((s) => ({ ...s, slug: suggestSlugFromOrganisationName(s.name) }));
  }, [newSite.name, newSiteSlugTouched]);

  async function handleApproveProfile(profileId: string) {
    setBusyProfileId(profileId);
    const r = await setFounderProfileStatus(profileId, 'active');
    setBusyProfileId(null);
    if (!r.ok) {
      showToast(r.error);
      return;
    }
    setAllMembers((prev) => prev.map((m) => (m.id === profileId ? { ...m, status: 'active' } : m)));
    showToast('Member approved');
    router.refresh();
  }

  async function handleRejectProfile(profileId: string) {
    setBusyProfileId(profileId);
    const r = await setFounderProfileStatus(profileId, 'inactive');
    setBusyProfileId(null);
    if (!r.ok) {
      showToast(r.error);
      return;
    }
    setAllMembers((prev) => prev.map((m) => (m.id === profileId ? { ...m, status: 'inactive' } : m)));
    showToast('Member rejected');
    router.refresh();
  }

  const submitBroadcast = () => {
    const title = broadcastDraft.title.trim();
    if (!title) {
      showToast('Add a broadcast title');
      return;
    }
    // Broadcasts require dept_id / cat_id which are org-specific.
    // Route the founder to the org admin dashboard to send through the proper flow.
    const targetOrgId = broadcastDraft.audience === 'site' ? broadcastDraft.siteId : (orgs[0]?.id ?? '');
    const targetOrg = orgs.find((c) => c.id === targetOrgId);
    if (targetOrg) {
      showToast(`Opening ${targetOrg.name} admin to send broadcast...`);
      window.open(tenantAdminDashboardUrl(targetOrg.slug), '_blank');
    } else {
      showToast('Select an organisation to send the broadcast from');
    }
    setBroadcastDraft({ title: '', audience: 'all', siteId: orgs[0]?.id ?? '', body: '' });
    setModal(null);
  };

  const createNewSite = async () => {
    if (!newSite.name.trim()) {
      showToast('Enter an organisation name');
      return;
    }
    const slug = normalizeWorkspaceSlugInput(newSite.slug || suggestSlugFromOrganisationName(newSite.name));
    if (!isValidWorkspaceSlug(slug)) {
      showToast('Enter a valid subdomain slug (2-63 chars).');
      return;
    }
    setCreatingOrg(true);
    const supabase = createClient();
    const { data: row, error } = await supabase
      .from('organisations')
      .insert({ name: newSite.name.trim(), slug, is_active: true })
      .select('id, name, slug, is_active, created_at, logo_url')
      .single();
    setCreatingOrg(false);
    if (error) {
      showToast(error.message);
      return;
    }
    if (row) {
      const added: FounderOrg = {
        id: row.id as string,
        name: row.name as string,
        slug: row.slug as string,
        is_active: Boolean(row.is_active),
        created_at: (row.created_at as string) ?? '',
        logo_url: (row.logo_url as string | null) ?? null,
        user_count: 0,
        broadcast_count: 0,
      };
      setOrgs((prev) => [...prev, added]);
    }
    showToast(`Organisation “${newSite.name.trim()}” created`);
    setNewSite({ name: '', slug: '' });
    setNewSiteSlugTouched(false);
    setModal(null);
    router.refresh();
  };

  const saveCatalogDraftEntry = async () => {
    if (!catalogForm.key.trim() || !catalogForm.label.trim()) {
      showToast('Permission key and label are required.');
      return;
    }
    setBusy(true);
    const result = await upsertPermissionDraftEntry({
      ...catalogForm,
      key: catalogForm.key.trim().toLowerCase(),
      label: catalogForm.label.trim(),
      description: catalogForm.description.trim(),
      category: catalogForm.category.trim().toLowerCase() || 'other',
      is_archived: false,
    });
    setBusy(false);
    if (!result.ok) {
      showToast(result.error);
      return;
    }
    showToast('Draft permission saved');
    setCatalogForm((curr) => ({ ...curr, key: '', label: '', description: '' }));
    router.refresh();
  };

  const publishCatalog = async () => {
    setBusy(true);
    const result = await publishPermissionCatalogVersion(publishNote.trim());
    setBusy(false);
    if (!result.ok) {
      showToast(result.error);
      return;
    }
    setPublishNote('');
    showToast(`Published catalog version ${result.data.versionNo}`);
    router.refresh();
  };

  const saveRolePreset = async () => {
    if (!presetForm.key.trim() || !presetForm.name.trim()) {
      showToast('Preset key and name are required.');
      return;
    }
    const keys = presetForm.recommended_permission_keys
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
    setBusy(true);
    const result = await upsertRolePreset({
      key: presetForm.key.trim().toLowerCase(),
      name: presetForm.name.trim(),
      description: presetForm.description.trim(),
      target_use_case: presetForm.target_use_case.trim(),
      recommended_permission_keys: keys,
      is_archived: false,
    });
    setBusy(false);
    if (!result.ok) {
      showToast(result.error);
      return;
    }
    showToast('Role preset saved');
    setPresetForm({ key: '', name: '', description: '', target_use_case: '', recommended_permission_keys: '' });
    router.refresh();
  };

  const saveGovernance = async (
    org: FounderOrg,
    forceLogout: boolean,
    opts?: { clearTrial?: boolean; actionLabel?: string }
  ) => {
    showGovernanceActionOverlay(org.id, opts?.actionLabel ?? (forceLogout ? 'Forcing logout...' : 'Saving...'));
    setBusy(true);
    const result = await updateOrganisationGovernance({
      orgId: org.id,
      planTier: org.plan_tier ?? 'starter',
      subscriptionStatus:
        (org.subscription_status as 'trial' | 'active' | 'limited' | 'suspended') ?? 'active',
      isLocked: Boolean(org.is_locked),
      maintenanceMode: Boolean(org.maintenance_mode),
      forceLogout,
      trialEndsAt: opts?.clearTrial ? null : org.subscription_trial_ends_at ?? null,
      clearTrial: opts?.clearTrial ?? false,
    });
    setBusy(false);
    clearGovernanceActionOverlay();
    if (!result.ok) {
      showToast(result.error);
      return;
    }
    showToast(forceLogout ? 'Force logout scheduled for org members' : 'Org governance saved');
    router.refresh();
  };

  const unlockOrganisation = async (org: FounderOrg) => {
    showGovernanceActionOverlay(org.id, 'Unlocking...');
    setBusy(true);
    const result = await updateOrganisationGovernance({
      orgId: org.id,
      planTier: org.plan_tier ?? 'starter',
      subscriptionStatus:
        (org.subscription_status as 'trial' | 'active' | 'limited' | 'suspended') ?? 'active',
      isLocked: false,
      maintenanceMode: false,
      forceLogout: false,
      trialEndsAt: org.subscription_trial_ends_at ?? null,
      clearTrial: false,
    });
    setBusy(false);
    clearGovernanceActionOverlay();
    if (!result.ok) {
      showToast(result.error);
      return;
    }
    setOrgs((prev) =>
      prev.map((p) => (p.id === org.id ? { ...p, is_locked: false, maintenance_mode: false } : p))
    );
    showToast('Organisation unlocked and maintenance disabled');
    router.refresh();
  };

  const startSupportSession = async (orgId: string, targetUserId: string) => {
    setBusy(true);
    const result = await startSupportViewAsSession({ orgId, targetUserId, minutes: 20 });
    setBusy(false);
    if (!result.ok) {
      showToast(result.error);
      return;
    }
    setSupportToken(result.data.token);
    showToast('Support session token generated');
    router.refresh();
  };

  const NavBtn = ({
    page,
    icon,
    label,
    badge,
    badgeClass,
  }: {
    page: FounderPageKey;
    icon: string;
    label: string;
    badge?: string;
    badgeClass?: string;
  }) => (
    <button
      type="button"
      className={`nav-item${activePage === page ? ' active' : ''}`}
      onClick={() => navTo(page)}
    >
      <span className="nav-icon">{icon}</span>
      {label}
      {badge !== undefined && <span className={`nav-badge ${badgeClass ?? ''}`}>{badge}</span>}
    </button>
  );

  const avatarInner = (size: 'sidebar' | 'top') => {
    if (user.avatarUrl) {
      return <img src={user.avatarUrl} alt="" width={size === 'sidebar' ? 34 : 30} height={size === 'sidebar' ? 34 : 30} />;
    }
    return user.initials;
  };

  return (
    <>
      <div className="founder-hq-body">
      <div className="sidebar">
        <div className="sidebar-brand">
          <div className="brand-icon">
            <img src="/Campsite%20Logo.svg" alt="" />
          </div>
          <div className="brand-text">Campsite</div>
          <div className="brand-badge">Founder</div>
        </div>

        <div className="sidebar-founder">
          <div className="founder-card">
            <div className="founder-av">{avatarInner('sidebar')}</div>
            <div>
              <div className="founder-name">{user.displayName}</div>
              <div className="founder-role">Platform founder</div>
            </div>
            <div className="founder-caret">⌄</div>
          </div>
        </div>

        <div className="nav-section">
          <div className="nav-label">Overview</div>
          <NavBtn page="overview" icon="◈" label="Company Overview" />
          <NavBtn page="campsites" icon="⛺" label="All Campsites" badge={String(orgs.length)} badgeClass="nb-gold" />
          <NavBtn page="revenue" icon="₤" label="Revenue & Finance" />
          <NavBtn page="growth" icon="↗" label="Growth & Analytics" />

          <div className="nav-label" style={{ marginTop: 4 }}>
            Operations
          </div>
          <NavBtn page="members" icon="◎" label="All Members" badge={String(totalMemberCount)} badgeClass="nb-muted" />
          <NavBtn
            page="pending-global"
            icon="⏳"
            label="Pending Approvals"
            badge={String(pendingApprovalsCount)}
            badgeClass="nb-red"
          />
          <NavBtn page="broadcasts-hq" icon="📡" label="Broadcasts HQ" />
          <NavBtn page="rota-hq" icon="📅" label="Rota Overview" />

          <div className="nav-label" style={{ marginTop: 4 }}>
            Platform
          </div>
          <NavBtn page="rbac-hq" icon="🛡️" label="RBAC Catalog" />
          <NavBtn page="legal-hq" icon="📜" label="Legal policies" />
          <NavBtn page="audit-hq" icon="🔎" label="Audit Log" />
          <NavBtn page="settings-hq" icon="⚙" label="Platform Settings" />
        </div>

        <div className="sidebar-spacer" />
        <div className="sidebar-bottom">
          <button type="button" className="sb-link" onClick={() => showToast('Documentation')}>
            📖 Documentation
          </button>
          <button type="button" className="sb-link" onClick={() => showToast('Support')}>
            💬 Support
          </button>
          <button type="button" className="sb-link" style={{ color: '#f87171' }} onClick={() => void handleSignOut()}>
            ⬡ Sign out
          </button>
        </div>
      </div>

      <div className="main">
        {loadError ? (
          <div
            role="alert"
            style={{
              margin: '0 0 12px 0',
              padding: '12px 16px',
              background: 'var(--surface2)',
              border: '1px solid #f87171',
              borderRadius: 8,
              fontSize: 13,
              color: 'var(--text)',
            }}
          >
            <strong>Could not load platform data:</strong> {loadError}
          </div>
        ) : null}
        <div className="topbar">
          <div className="topbar-breadcrumb">
            <button type="button" className="bc-home" onClick={() => navTo('overview')}>
              Founder HQ
            </button>
            <span className="bc-sep">/</span>
            <span className="bc-current">{PAGE_LABELS[activePage]}</span>
          </div>
          <div className="topbar-right">
            <div className="live-dot">Live</div>
            <button type="button" className="icon-btn" title="Notifications" onClick={() => showToast('Notifications')}>
              🔔
            </button>
            <button type="button" className="icon-btn" title="Export" onClick={() => showToast('📊 Exporting report...')}>
              ⬇
            </button>
            <button type="button" className="topbar-av" title="Profile">
              {avatarInner('top')}
            </button>
          </div>
        </div>

        {/* Overview */}
        <div className={`page${activePage === 'overview' ? ' active' : ''}`}>
          <div className="page-inner">
            <div className="overview-hero">
              <div className="overview-hero-top">
                <div>
                  <div className="hero-title">{heroGreeting}</div>
                  <div className="hero-sub">
                    Here&apos;s your live company pulse across {orgs.length} organisation{orgs.length === 1 ? '' : 's'}.
                  </div>
                </div>
                <div className="hero-time">
                  <div style={{ color: 'var(--text3)', fontSize: 11.5 }}>Today</div>
                  <div className="hero-date">{heroDate}</div>
                </div>
              </div>
              <div className="hero-metrics">
                <div className="hero-metric">
                  <div className="hm-val">{activeOrgCount}</div>
                  <div className="hm-lbl">Active orgs</div>
                </div>
                <div className="hero-metric">
                  <div className="hm-val">{totalMemberCount}</div>
                  <div className="hm-lbl">Total members</div>
                </div>
                <div className="hero-metric">
                  <div className="hm-val">{totalBroadcasts}</div>
                  <div className="hm-lbl">Broadcasts (all orgs)</div>
                </div>
                <div className="hero-metric">
                  <div className="hm-val">{activeMembersCount}</div>
                  <div className="hm-lbl">Active members</div>
                </div>
                <div className="hero-metric">
                  <div className="hm-val">{pendingApprovalsCount}</div>
                  <div className="hm-lbl">Pending profiles</div>
                </div>
              </div>
            </div>

            <div className="stats-row">
              <div className="stat-card">
                <div className="stat-label">
                  Organisations <span className="stat-icon">⛺</span>
                </div>
                <div className="stat-value">{orgs.length}</div>
                <div className="stat-sub">
                  <span className="up">{activeOrgCount} active</span>
                  {inactiveOrgCount > 0 ? ` · ${inactiveOrgCount} inactive` : ''}
                </div>
                <div className="stat-bar">
                  <div
                    className="stat-bar-fill fill-gold"
                    style={{
                      width: `${orgs.length ? Math.min(100, Math.round((activeOrgCount / orgs.length) * 100)) : 0}%`,
                    }}
                  />
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-label">
                  Total members <span className="stat-icon">👤</span>
                </div>
                <div className="stat-value">{totalMemberCount}</div>
                <div className="stat-sub">
                  {activeMembersCount} active · {pendingApprovalsCount} pending
                </div>
                <div className="stat-bar">
                  <div
                    className="stat-bar-fill fill-green"
                    style={{
                      width: `${totalMemberCount ? Math.min(100, Math.round((activeMembersCount / totalMemberCount) * 100)) : 0}%`,
                    }}
                  />
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-label">
                  Broadcasts (sent) <span className="stat-icon">📡</span>
                </div>
                <div className="stat-value">{totalBroadcasts}</div>
                <div className="stat-sub">Across all organisations</div>
                <div className="stat-bar">
                  <div
                    className="stat-bar-fill fill-blue"
                    style={{
                      width: `${Math.min(100, Math.max(8, totalBroadcasts > 0 ? Math.round((totalBroadcasts / (totalBroadcasts + 20)) * 100) : 6))}%`,
                    }}
                  />
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-label">
                  Pending approvals <span className="stat-icon">⏳</span>
                </div>
                <div className="stat-value">{pendingApprovalsCount}</div>
                <div className="stat-sub">Profiles with pending status</div>
                <div className="stat-bar">
                  <div
                    className="stat-bar-fill fill-purple"
                    style={{
                      width: `${Math.min(100, Math.max(6, pendingApprovalsCount > 0 ? Math.round((pendingApprovalsCount / Math.max(pendingApprovalsCount, 12)) * 100) : 6))}%`,
                    }}
                  />
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div className="card">
                  <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid var(--border)' }}>
                    <div className="section-head" style={{ margin: 0 }}>
                      <div className="section-title">Largest organisations (by members)</div>
                      <button type="button" className="btn btn-ghost btn-sm inline-flex items-center gap-1" onClick={() => navTo('campsites')}>
                        View all <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    </div>
                  </div>
                  <div className="card-pad" style={{ paddingTop: 14 }}>
                    {topOrgs.map((c, i) => {
                      const maxU = Math.max(1, topOrgs[0]?.user_count ?? 1);
                      return (
                      <div
                        key={c.id}
                        className="perf-row"
                        style={{ cursor: 'pointer' }}
                        onClick={() => openOrgDetail(c.id)}
                        onKeyDown={(e) => e.key === 'Enter' && openOrgDetail(c.id)}
                        role="button"
                        tabIndex={0}
                      >
                        <div
                          style={{
                            width: 18,
                            textAlign: 'center',
                            fontFamily: 'var(--serif)',
                            fontSize: 13,
                            color: 'var(--text3)',
                          }}
                        >
                          {i + 1}
                        </div>
                        <div className="perf-label">
                          {c.name}
                          <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 400 }}>{c.slug}</div>
                        </div>
                        <div className="perf-bar-wrap">
                          <div className="perf-bar" style={{ width: `${Math.round((c.user_count / maxU) * 100)}%` }} />
                        </div>
                        <div className="perf-val">{c.user_count}</div>
                      </div>
                    );})}
                  </div>
                </div>

                <div className="card">
                  <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid var(--border)' }}>
                    <div className="section-head" style={{ margin: 0 }}>
                      <div className="section-title">Recent activity</div>
                      <span style={{ fontSize: 11.5, color: 'var(--text3)' }}>From live org &amp; profile data</span>
                    </div>
                  </div>
                  <div className="card-pad" style={{ paddingTop: 6, paddingBottom: 6 }}>
                    {platformActivityLines.length === 0 ? (
                      <div style={{ fontSize: 13, color: 'var(--text2)', padding: '10px 0' }}>
                        No organisations or members yet - activity will appear here as you onboard tenants.
                      </div>
                    ) : (
                      platformActivityLines.map((a) => (
                        <div key={a.key} className="activity-item">
                          <div className="activity-icon">{a.icon}</div>
                          <div>
                            <div className="activity-text" dangerouslySetInnerHTML={{ __html: a.html }} />
                            <div className="activity-time">{a.time}</div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <div className="section-head">
                    <div className="section-title">Alerts</div>
                    <span style={{ fontSize: 11.5, color: 'var(--text3)' }}>{platformAlerts.length} from data</span>
                  </div>
                  {platformAlerts.map((a, i) => (
                    <div
                      key={i}
                      className={a.kind === 'warn' ? 'alert alert-warn' : a.kind === 'info' ? 'alert alert-info' : 'alert alert-success'}
                    >
                      {a.kind === 'warn' ? '⚠️' : a.kind === 'info' ? 'ℹ️' : '✓'}{' '}
                      <span dangerouslySetInnerHTML={{ __html: a.html }} />
                    </div>
                  ))}
                </div>

                <div className="card card-pad">
                  <div className="section-head" style={{ marginBottom: 10 }}>
                    <div className="section-title">Members by organisation</div>
                    <span style={{ fontSize: 11.5, color: 'var(--text3)' }}>Top {snapshotOrgBars.length} by headcount</span>
                  </div>
                  <div style={{ fontFamily: 'var(--serif)', fontSize: 26, color: 'var(--accent)' }}>{totalMemberCount}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--text2)', marginTop: 2 }}>Total members on the platform</div>
                  <div className="mini-chart">
                    {snapshotOrgBars.length === 0 ? (
                      <div style={{ fontSize: 12, color: 'var(--text3)', paddingTop: 8 }}>No organisations yet</div>
                    ) : (
                      snapshotOrgBars.map((b) => (
                        <div
                          key={b.key}
                          className={`bar${b.highlight ? ' highlight' : ''}`}
                          style={{ height: b.h }}
                          title={`${b.label}: ${b.n} members`}
                        />
                      ))
                    )}
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: 9,
                      color: 'var(--text3)',
                      marginTop: 5,
                      gap: 4,
                      flexWrap: 'wrap',
                    }}
                  >
                    {snapshotOrgBars.map((b) => (
                      <span key={b.key} style={{ maxWidth: 72, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={b.label}>
                        {b.label}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="card card-pad">
                  <div className="section-title" style={{ marginBottom: 12 }}>
                    Quick Actions
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                    <button type="button" className="btn btn-ghost btn-sm" style={{ justifyContent: 'flex-start' }} onClick={() => navTo('pending-global')}>
                      ⏳ &nbsp;Review {pendingApprovalsCount} pending approval{pendingApprovalsCount === 1 ? '' : 's'}
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm" style={{ justifyContent: 'flex-start' }} onClick={() => setModal('new-site')}>
                      ⛺ &nbsp;Add new campsite
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm" style={{ justifyContent: 'flex-start' }} onClick={() => navTo('revenue')}>
                      📊 &nbsp;View revenue report
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm" style={{ justifyContent: 'flex-start' }} onClick={() => navTo('broadcasts-hq')}>
                      📡 &nbsp;Send company broadcast
                    </button>
                    <button type="button" className="btn btn-ghost btn-sm" style={{ justifyContent: 'flex-start' }} onClick={() => navTo('audit-hq')}>
                      🔎 &nbsp;View audit trail
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Campsites */}
        <div className={`page${activePage === 'campsites' ? ' active' : ''}`}>
          <div className="page-inner">
            <div className="section-head" style={{ marginBottom: 20 }}>
              <div>
                <div className="page-title">All organisations</div>
                <div className="page-sub">
                  {orgs.length} tenant{orgs.length === 1 ? '' : 's'} - click to manage members and settings
                </div>
              </div>
              <button type="button" className="btn btn-primary" onClick={() => setModal('new-site')}>
                + Add organisation
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
              <div className="search-bar" style={{ width: 240 }}>
                <span style={{ color: 'var(--text3)', fontSize: 12 }}>🔍</span>
                <input type="text" placeholder="Search..." value={csQuery} onChange={(e) => setCsQuery(e.target.value)} />
              </div>
              {(['all', 'open', 'closed'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  className={`filter-pill${csFilter === f ? ' active' : ''}`}
                  onClick={() => setCsFilter(f)}
                >
                  {f === 'closed' ? 'Inactive' : f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
              <div style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text3)' }}>Sorted by name</div>
            </div>

            <div className="campsite-grid">
              {[...filteredOrgs].sort((a, b) => a.name.localeCompare(b.name)).map((c) => (
                <div
                  key={c.id}
                  className="campsite-card"
                  onClick={() => openOrgDetail(c.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === 'Enter' && openOrgDetail(c.id)}
                >
                  <div className="campsite-header">
                    <div>
                      <div className="campsite-name">{c.name}</div>
                      <div className="campsite-location">📍 {c.slug}</div>
                    </div>
                    <span className={`campsite-status ${statusClsFromOrg(c)}`}>{statusLabelFromOrg(c)}</span>
                  </div>
                  <div className="campsite-body">
                    <div className="campsite-metrics">
                      <div className="cm-item">
                        <div className="cm-val">{c.user_count}</div>
                        <div className="cm-lbl">Members</div>
                      </div>
                      <div className="cm-item">
                        <div className="cm-val">{c.broadcast_count}</div>
                        <div className="cm-lbl">Broadcasts</div>
                      </div>
                      <div className="cm-item">
                        <div className="cm-val"> - </div>
                        <div className="cm-lbl">Bookings</div>
                      </div>
                      <div className="cm-item">
                        <div className="cm-val"> - </div>
                        <div className="cm-lbl">Revenue</div>
                      </div>
                    </div>
                  </div>
                  <div className="campsite-footer">
                    <div className="campsite-mgr">
                      <div className="cm-av">{c.slug.slice(0, 2).toUpperCase()}</div>
                      {c.slug}.localhost
                    </div>
                    <span className="campsite-arrow">→</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Revenue */}
        <div className={`page${activePage === 'revenue' ? ' active' : ''}`}>
          <div className="page-inner">
            <div className="page-title">Revenue & Finance</div>
            <div className="page-sub">
              Subscription status and billing controls across {orgs.length} organisation{orgs.length === 1 ? '' : 's'}
            </div>

            <div className="stats-row" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
              <div className="stat-card">
                <div className="stat-label">
                  Active subscriptions <span className="stat-icon">✅</span>
                </div>
                <div className="stat-value">{subscriptionSummary.activeCount}</div>
                <div className="stat-sub">
                  <span className="up">{orgs.length > 0 ? Math.round((subscriptionSummary.activeCount / orgs.length) * 100) : 0}%</span> of all orgs
                </div>
                <div className="stat-bar">
                  <div className="stat-bar-fill fill-green" style={{ width: `${orgs.length > 0 ? Math.round((subscriptionSummary.activeCount / orgs.length) * 100) : 0}%` }} />
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-label">
                  On trial <span className="stat-icon">⏱</span>
                </div>
                <div className="stat-value">{subscriptionSummary.trialCount}</div>
                <div className="stat-sub">14-day free trial period</div>
                <div className="stat-bar">
                  <div className="stat-bar-fill fill-gold" style={{ width: `${orgs.length > 0 ? Math.min(100, Math.round((subscriptionSummary.trialCount / orgs.length) * 100)) : 0}%` }} />
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-label">
                  Limited / Suspended <span className="stat-icon">⚠️</span>
                </div>
                <div className="stat-value">{subscriptionSummary.limitedCount + subscriptionSummary.suspendedCount}</div>
                <div className="stat-sub">{subscriptionSummary.limitedCount} limited · {subscriptionSummary.suspendedCount} suspended</div>
                <div className="stat-bar">
                  <div className="stat-bar-fill fill-purple" style={{ width: `${orgs.length > 0 ? Math.min(100, Math.round(((subscriptionSummary.limitedCount + subscriptionSummary.suspendedCount) / orgs.length) * 100)) : 0}%` }} />
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-label">
                  New members this month <span className="stat-icon">👤</span>
                </div>
                <div className="stat-value">{growthStats.thisMonthMembers}</div>
                <div className="stat-sub">
                  {growthStats.momPct !== null
                    ? growthStats.momPct >= 0
                      ? <span className="up">↑ {Math.abs(Math.round(growthStats.momPct))}% vs last month</span>
                      : <span>↓ {Math.abs(Math.round(growthStats.momPct))}% vs last month</span>
                    : <span>First month of data</span>}
                </div>
                <div className="stat-bar">
                  <div className="stat-bar-fill fill-blue" style={{ width: `${Math.min(100, Math.max(6, growthStats.thisMonthMembers > 0 ? 60 : 6))}%` }} />
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div className="card">
                <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid var(--border)' }}>
                  <div className="section-title">Members by organisation</div>
                </div>
                <div className="card-pad" style={{ paddingTop: 14 }}>
                  {revenueSites.sites.length === 0 ? (
                    <div style={{ fontSize: 13, color: 'var(--text2)' }}>No organisations with members yet.</div>
                  ) : revenueSites.sites.map((c) => (
                    <div key={c.id} className="perf-row">
                      <div className="perf-label">
                        {c.name}
                        <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 400 }}>{c.slug}</div>
                      </div>
                      <div className="perf-bar-wrap" style={{ width: 120 }}>
                        <div className="perf-bar" style={{ width: `${Math.round((c.user_count / revenueSites.max) * 100)}%` }} />
                      </div>
                      <div className="perf-val">{c.user_count}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="card">
                <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid var(--border)' }}>
                  <div className="section-title">New member registrations (last 6 months)</div>
                </div>
                <div className="card-pad">
                  <div style={{ height: 160, display: 'flex', alignItems: 'flex-end', gap: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, width: '100%', height: '100%' }}>
                      {memberTrend.map((m, i) => (
                        <div
                          key={i}
                          style={{
                            flex: 1,
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: 4,
                            height: '100%',
                          }}
                        >
                          <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', width: '100%' }}>
                            <div
                              style={{
                                width: '100%',
                                height: `${Math.max(4, Math.round((m.count / memberTrendMax) * 100))}%`,
                                borderRadius: '4px 4px 0 0',
                                background:
                                  i === 5 ? 'linear-gradient(180deg, var(--gold2), var(--gold))' : 'var(--surface3)',
                                transition: 'background var(--t)',
                              }}
                              title={`${m.count} new member${m.count === 1 ? '' : 's'}`}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: 10,
                      color: 'var(--text3)',
                      marginTop: 8,
                    }}
                  >
                    {memberTrend.map((m, i) => (
                      <span key={i} style={{ color: i === 5 ? 'var(--gold2)' : undefined, fontWeight: i === 5 ? 600 : undefined }}>
                        {m.label}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div className="card card-pad" style={{ marginTop: 16 }}>
              <div className="section-title" style={{ marginBottom: 10 }}>
                Billing, security, and support controls
              </div>
              <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 12, maxWidth: 720 }}>
                Changes to plan, subscription, trial date, lock, or maintenance apply after you click{' '}
                <strong>Save</strong> for that row. <strong>Clear trial</strong> and <strong>Force logout</strong> apply
                immediately.
              </p>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Organisation</th>
                      <th>Plan</th>
                      <th>Subscription</th>
                      <th>Trial</th>
                      <th>Security</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orgs.map((org) => {
                      const firstMemberId = allMembers.find((m) => m.org_id === org.id)?.id;
                      const governanceOverlayActive = governanceActionOverlay?.orgId === org.id;
                      const daysLeft = trialDaysRemaining(org.subscription_trial_ends_at);
                      const trialLabel =
                        org.subscription_trial_ends_at == null
                          ? '—'
                          : daysLeft === null
                            ? '—'
                            : daysLeft < 0
                              ? `Ended ${Math.abs(daysLeft)}d ago`
                              : `${daysLeft}d left`;
                      return (
                        <tr key={org.id}>
                          <td>{org.name}</td>
                          <td>{org.plan_tier ?? 'starter'}</td>
                          <td>
                            <FormSelect
                              tone="subtle"
                              controlSize="sm"
                              wrapperClassName="max-w-[140px]"
                              value={org.subscription_status ?? 'active'}
                              disabled={busy}
                              onChange={(e) => {
                                const v = e.target.value;
                                setOrgs((prev) =>
                                  prev.map((p) => {
                                    if (p.id !== org.id) return p;
                                    if (v === 'trial' && !p.subscription_trial_ends_at) {
                                      const end = new Date();
                                      end.setDate(end.getDate() + 14);
                                      return {
                                        ...p,
                                        subscription_status: v,
                                        subscription_trial_started_at:
                                          p.subscription_trial_started_at ?? new Date().toISOString(),
                                        subscription_trial_ends_at: end.toISOString(),
                                      };
                                    }
                                    return { ...p, subscription_status: v };
                                  })
                                );
                              }}
                              aria-label={`Subscription for ${org.name}`}
                            >
                              <option value="trial">trial</option>
                              <option value="active">active</option>
                              <option value="limited">limited</option>
                              <option value="suspended">suspended</option>
                            </FormSelect>
                          </td>
                          <td>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 200 }}>
                              <span style={{ fontSize: 12, color: 'var(--text2)' }}>{trialLabel}</span>
                              <input
                                type="datetime-local"
                                className="btn btn-ghost btn-sm"
                                style={{ width: '100%', fontSize: 12 }}
                                value={isoToDatetimeLocalValue(org.subscription_trial_ends_at)}
                                disabled={busy}
                                onChange={(e) => {
                                  const iso = datetimeLocalToIso(e.target.value);
                                  setOrgs((prev) =>
                                    prev.map((p) =>
                                      p.id === org.id
                                        ? {
                                            ...p,
                                            subscription_trial_ends_at: iso,
                                            subscription_trial_started_at:
                                              iso && !p.subscription_trial_started_at
                                                ? new Date().toISOString()
                                                : p.subscription_trial_started_at ?? null,
                                          }
                                        : p
                                    )
                                  );
                                }}
                                aria-label={`Trial ends for ${org.name}`}
                              />
                              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                <button
                                  type="button"
                                  className="btn btn-ghost btn-sm"
                                  disabled={busy}
                                  onClick={() =>
                                    setOrgs((prev) =>
                                      prev.map((p) => {
                                        if (p.id !== org.id) return p;
                                        const end = new Date();
                                        end.setDate(end.getDate() + 14);
                                        return {
                                          ...p,
                                          subscription_status: 'trial',
                                          subscription_trial_started_at: p.subscription_trial_started_at ?? new Date().toISOString(),
                                          subscription_trial_ends_at: end.toISOString(),
                                        };
                                      })
                                    )
                                  }
                                >
                                  +14 days
                                </button>
                                <button
                                  type="button"
                                  className="btn btn-ghost btn-sm"
                                  disabled={busy}
                                  onClick={() =>
                                    void saveGovernance(org, false, {
                                      clearTrial: true,
                                      actionLabel: 'Clearing trial...',
                                    })
                                  }
                                >
                                  Clear trial
                                </button>
                              </div>
                            </div>
                          </td>
                          <td>
                            {org.is_locked ? 'Locked' : 'Unlocked'} · {org.maintenance_mode ? 'Maintenance' : 'Live'}
                          </td>
                          <td>
                            <div className="governance-actions-wrap">
                              {governanceOverlayActive ? (
                                <div className="governance-actions-overlay" role="status" aria-live="polite">
                                  <span>{governanceActionOverlay.label}</span>
                                </div>
                              ) : null}
                              <div
                                className={`governance-actions${governanceOverlayActive ? ' is-obscured' : ''}`}
                                style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}
                              >
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                disabled={busy}
                                onClick={() => {
                                  showGovernanceActionOverlay(
                                    org.id,
                                    org.is_locked ? 'Unlocking draft...' : 'Locking draft...',
                                    1000
                                  );
                                  setOrgs((prev) =>
                                    prev.map((p) => (p.id === org.id ? { ...p, is_locked: !p.is_locked } : p))
                                  );
                                }}
                              >
                                Toggle lock
                              </button>
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                disabled={busy}
                                onClick={() => {
                                  showGovernanceActionOverlay(
                                    org.id,
                                    org.maintenance_mode ? 'Maintenance off (draft)...' : 'Maintenance on (draft)...',
                                    1000
                                  );
                                  setOrgs((prev) =>
                                    prev.map((p) =>
                                      p.id === org.id ? { ...p, maintenance_mode: !p.maintenance_mode } : p
                                    )
                                  );
                                }}
                              >
                                Toggle maintenance
                              </button>
                              <button
                                type="button"
                                className="btn btn-success btn-sm"
                                disabled={busy || (!org.is_locked && !org.maintenance_mode)}
                                onClick={() => void unlockOrganisation(org)}
                              >
                                Unlock now
                              </button>
                              <button
                                type="button"
                                className="btn btn-primary btn-sm"
                                disabled={busy}
                                onClick={() =>
                                  void saveGovernance(org, false, {
                                    actionLabel: 'Saving governance...',
                                  })
                                }
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                className="btn btn-danger btn-sm"
                                disabled={busy}
                                onClick={() =>
                                  void saveGovernance(org, true, {
                                    actionLabel: 'Forcing logout...',
                                  })
                                }
                              >
                                Force logout
                              </button>
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                disabled={busy || !firstMemberId}
                                onClick={() => {
                                  if (firstMemberId) void startSupportSession(org.id, firstMemberId);
                                }}
                              >
                                View as org admin
                              </button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {supportToken ? (
                <p style={{ marginTop: 12, fontSize: 12, color: 'var(--text2)' }}>
                  Latest support token: <code>{supportToken}</code>
                </p>
              ) : null}
            </div>
          </div>
        </div>

        {/* Growth */}
        <div className={`page${activePage === 'growth' ? ' active' : ''}`}>
          <div className="page-inner">
            <div className="page-title">Growth & Analytics</div>
            <div className="page-sub">Platform-wide member growth and organisation expansion</div>

            <div className="stats-row">
              <div className="stat-card">
                <div className="stat-label">
                  Member Growth (MoM) <span className="stat-icon">↗</span>
                </div>
                <div className="stat-value">
                  {growthStats.momPct !== null
                    ? `${growthStats.momPct >= 0 ? '+' : ''}${growthStats.momPct.toFixed(1)}%`
                    : '—'}
                </div>
                <div className="stat-sub">
                  {growthStats.lastMonthMembers > 0
                    ? <><span className={growthStats.momPct !== null && growthStats.momPct >= 0 ? 'up' : ''}>{growthStats.thisMonthMembers} this month</span> vs {growthStats.lastMonthMembers} last month</>
                    : 'Not enough data yet'}
                </div>
                <div className="stat-bar">
                  <div className="stat-bar-fill fill-green" style={{ width: `${Math.min(100, Math.max(6, growthStats.momPct !== null ? Math.abs(growthStats.momPct) : 6))}%` }} />
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-label">
                  Active member rate <span className="stat-icon">✅</span>
                </div>
                <div className="stat-value">{growthStats.activeRate}%</div>
                <div className="stat-sub">
                  <span className="up">{activeMembersCount} active</span> of {totalMemberCount} total
                </div>
                <div className="stat-bar">
                  <div className="stat-bar-fill fill-blue" style={{ width: `${growthStats.activeRate}%` }} />
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-label">
                  New orgs this year <span className="stat-icon">⛺</span>
                </div>
                <div className="stat-value">{growthStats.newOrgsThisYear}</div>
                <div className="stat-sub">
                  {orgs.length} total organisations on platform
                </div>
                <div className="stat-bar">
                  <div className="stat-bar-fill fill-gold" style={{ width: `${orgs.length > 0 ? Math.min(100, Math.round((growthStats.newOrgsThisYear / orgs.length) * 100)) : 0}%` }} />
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-label">
                  Total broadcasts sent <span className="stat-icon">📡</span>
                </div>
                <div className="stat-value">{broadcasts.filter((b) => b.status === 'sent').length}</div>
                <div className="stat-sub">
                  Across all organisations
                </div>
                <div className="stat-bar">
                  <div className="stat-bar-fill fill-purple" style={{ width: `${Math.min(100, Math.max(6, broadcasts.length > 0 ? 60 : 6))}%` }} />
                </div>
              </div>
            </div>

            <div className="card card-pad">
              <div className="section-title" style={{ marginBottom: 16 }}>
                New members (last 30 days)
              </div>
              {growthSitesReal.length === 0 ? (
                <div style={{ fontSize: 13, color: 'var(--text2)' }}>No new profiles created in the last 30 days.</div>
              ) : (
                growthSitesReal.map(({ c, n }) => (
                  <div key={c.id} className="perf-row">
                    <div className="perf-label">
                      {c.name}
                      <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 400 }}>{c.slug}</div>
                    </div>
                    <div className="perf-bar-wrap" style={{ width: 180 }}>
                      <div className="perf-bar" style={{ width: `${Math.round((n / growthBarMax) * 100)}%` }} />
                    </div>
                    <div className="perf-val">{n}</div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Members */}
        <div className={`page${activePage === 'members' ? ' active' : ''}`}>
          <div className="page-inner">
            <div className="page-title">All Members</div>
            <div className="page-sub">
              {totalMemberCount} member{totalMemberCount === 1 ? '' : 's'} across {orgs.length} organisation
              {orgs.length === 1 ? '' : 's'} - global view
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
              <div className="search-bar" style={{ width: 240 }}>
                <span style={{ color: 'var(--text3)', fontSize: 12 }}>🔍</span>
                <input
                  type="text"
                  placeholder="Search name, email or site..."
                  value={memberQuery}
                  onChange={(e) => setMemberQuery(e.target.value)}
                />
              </div>
              <FormSelect
                tone="subtle"
                wrapperClassName="!w-auto shrink-0"
                value={memberSite}
                onChange={(e) => setMemberSite(e.target.value)}
              >
                {memberSiteOptions.map((s) => (
                  <option key={s} value={s}>
                    {s === 'all' ? 'All organisations' : s}
                  </option>
                ))}
              </FormSelect>
              <FormSelect
                tone="subtle"
                wrapperClassName="!w-auto shrink-0"
                value={memberRole}
                onChange={(e) => setMemberRole(e.target.value)}
              >
                <option value="all">All roles</option>
                <option value="org_admin">Org admin</option>
                <option value="manager">Manager</option>
                <option value="coordinator">Coordinator</option>
                <option value="administrator">Administrator</option>
                <option value="duty_manager">Duty manager</option>
                <option value="csa">CSA</option>
                <option value="society_leader">Society leader</option>
              </FormSelect>
              {(['all', 'active', 'pending', 'inactive'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  className={`filter-pill${memberStatusTab === tab ? ' active' : ''}`}
                  onClick={() => setMemberStatusTab(tab)}
                >
                  {tab.charAt(0).toUpperCase() + tab.slice(1)}
                </button>
              ))}
            </div>

            <div className="card">
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Member</th>
                      <th>Organisation</th>
                      <th>Role</th>
                      <th>Status</th>
                      <th>Joined</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMembers.length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ color: 'var(--text2)', padding: '20px 14px' }}>
                          No members match these filters.
                        </td>
                      </tr>
                    ) : (
                      filteredMembers.map((m) => (
                        <tr key={m.id}>
                          <td>
                            <div className="td-name">
                              <div className="td-av">{memberInitials(m.full_name)}</div>
                              <div>
                                <div style={{ fontWeight: 500, color: 'var(--text)' }}>{m.full_name}</div>
                                <div style={{ fontSize: 11, color: 'var(--text3)' }}>{m.email ?? '-'}</div>
                              </div>
                            </div>
                          </td>
                          <td style={{ color: 'var(--text2)' }}>{m.org_name}</td>
                          <td>
                            <span className={`rb ${ROLE_MAP[m.role] ?? 'rb-staff'}`}>{ROLE_LBL[m.role] ?? m.role}</span>
                          </td>
                          <td>
                            <span className={`sb sb-${m.status}`}>
                              <span className="sb-dot" />
                              {m.status.charAt(0).toUpperCase() + m.status.slice(1)}
                            </span>
                          </td>
                          <td style={{ color: 'var(--text3)' }}>{formatJoined(m.created_at)}</td>
                          <td>
                            <button
                              type="button"
                              className="btn btn-danger btn-sm"
                              disabled={busyRemoveUserId === m.id}
                              onClick={() => void handleRemoveMember(m.org_id, m.id)}
                            >
                              {busyRemoveUserId === m.id ? '...' : 'Remove'}
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        {/* Pending */}
        <div className={`page${activePage === 'pending-global' ? ' active' : ''}`}>
          <div className="page-inner">
            <div className="page-title">Pending Approvals</div>
            <div className="page-sub">
              {pendingApprovalsCount === 0
                ? 'No members awaiting approval'
                : `${pendingApprovalsCount} profile${pendingApprovalsCount === 1 ? '' : 's'} with pending status across all organisations`}
            </div>
            <div className="card">
              <div className="table-wrap">
                {pendingApprovalsCount === 0 ? (
                  <div className="card-pad" style={{ color: 'var(--text2)', fontSize: 13 }}>
                    You&apos;re all caught up - new requests will appear here when registrations use pending approval.
                  </div>
                ) : (
                  <table>
                    <thead>
                      <tr>
                        <th>Member</th>
                        <th>Organisation</th>
                        <th>Role</th>
                        <th>Submitted</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendingMembers.map((p) => (
                        <tr key={p.id}>
                          <td>
                            <div className="td-name">
                              <div className="td-av">{memberInitials(p.full_name)}</div>
                              <div>
                                <div style={{ fontWeight: 500, color: 'var(--text)' }}>{p.full_name}</div>
                                <div style={{ fontSize: 11, color: 'var(--text3)' }}>{p.email ?? '-'}</div>
                              </div>
                            </div>
                          </td>
                          <td style={{ color: 'var(--text2)' }}>{p.org_name}</td>
                          <td style={{ color: 'var(--text2)' }}>{ROLE_LBL[p.role] ?? p.role}</td>
                          <td style={{ color: 'var(--text3)' }}>{relTime(p.created_at)}</td>
                          <td>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                              <button
                                type="button"
                                className="btn btn-primary btn-sm"
                                disabled={busyProfileId === p.id}
                                onClick={() => void handleApproveProfile(p.id)}
                              >
                                {busyProfileId === p.id ? '...' : '✓ Approve'}
                              </button>
                              <button
                                type="button"
                                className="btn btn-danger btn-sm"
                                disabled={busyProfileId === p.id}
                                onClick={() => void handleRejectProfile(p.id)}
                              >
                                {busyProfileId === p.id ? '...' : '✕ Reject'}
                              </button>
                              <a
                                className="btn btn-ghost btn-sm"
                                href={tenantAdminDashboardUrl(p.org_slug)}
                                style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
                              >
                                View org →
                              </a>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Broadcasts */}
        <div className={`page${activePage === 'broadcasts-hq' ? ' active' : ''}`}>
          <div className="page-inner">
            <div className="section-head" style={{ marginBottom: 20 }}>
              <div>
                <div className="page-title">Broadcasts HQ</div>
                <div className="page-sub">
                  {broadcasts.length} broadcast{broadcasts.length === 1 ? '' : 's'} across {orgs.length} organisation{orgs.length === 1 ? '' : 's'}
                </div>
              </div>
              <button type="button" className="btn btn-primary" onClick={() => setModal('broadcast')}>
                + New Broadcast
              </button>
            </div>
            <div className="card card-pad">
              <div className="section-title" style={{ marginBottom: 14 }}>
                All broadcasts
              </div>
              {broadcasts.length === 0 ? (
                <div style={{ fontSize: 13, color: 'var(--text2)' }}>
                  No broadcasts found. Broadcasts sent from tenant org dashboards will appear here.
                </div>
              ) : (
                broadcasts.map((b) => (
                  <div key={b.id} className="activity-item">
                    <div className="activity-icon">📡</div>
                    <div style={{ flex: 1 }}>
                      <div className="activity-text">
                        <strong>{b.title}</strong>
                        {b.status !== 'sent' && (
                          <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text3)', fontStyle: 'italic' }}>
                            {b.status}
                          </span>
                        )}
                      </div>
                      <div className="activity-time">
                        {b.sender_name ?? 'Unknown'} · {b.org_name} · {relTime(b.sent_at ?? b.created_at)}
                      </div>
                    </div>
                    <a
                      className="btn btn-ghost btn-sm"
                      href={tenantAdminDashboardUrl(b.org_slug)}
                      style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}
                    >
                      View org →
                    </a>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Rota */}
        <div className={`page${activePage === 'rota-hq' ? ' active' : ''}`}>
          <div className="page-inner">
            <div className="page-title">Rota Overview</div>
            <div className="page-sub">
              {rotaShifts.length > 0
                ? `${rotaShifts.length} upcoming shift${rotaShifts.length === 1 ? '' : 's'} across all organisations (next 30 days)`
                : 'No upcoming shifts scheduled in the next 30 days'}
            </div>
            <div className="card">
              <div className="table-wrap">
                {rotaShifts.length === 0 ? (
                  <div className="card-pad" style={{ color: 'var(--text2)', fontSize: 13 }}>
                    No rota shifts found. Shifts added by org admins will appear here.
                  </div>
                ) : (
                  <table>
                    <thead>
                      <tr>
                        <th>Staff Member</th>
                        <th>Organisation</th>
                        <th>Date</th>
                        <th>Time</th>
                        <th>Role</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rotaShifts.map((s) => {
                        const start = new Date(s.start_time);
                        const end = new Date(s.end_time);
                        const dateStr = start.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
                        const pad = (n: number) => String(n).padStart(2, '0');
                        const timeStr = `${pad(start.getHours())}:${pad(start.getMinutes())}–${pad(end.getHours())}:${pad(end.getMinutes())}`;
                        return (
                          <tr key={s.id}>
                            <td style={{ color: 'var(--text)' }}>{s.staff_name ?? 'Unassigned'}</td>
                            <td style={{ color: 'var(--text2)' }}>{s.org_name}</td>
                            <td style={{ color: 'var(--text2)' }}>{dateStr}</td>
                            <td style={{ color: 'var(--text2)' }}>{timeStr}</td>
                            <td style={{ color: 'var(--text3)' }}>{s.role_label ?? '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* RBAC HQ */}
        <div className={`page${activePage === 'rbac-hq' ? ' active' : ''}`}>
          <div className="page-inner">
            <div className="page-title">RBAC Catalog & Presets</div>
            <div className="page-sub">Edit draft permissions, publish new versions, and manage cloneable role templates.</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div className="card card-pad">
                <div className="section-title" style={{ marginBottom: 12 }}>
                  Draft permission entry
                </div>
                <div className="field">
                  <label>Permission key</label>
                  <input
                    type="text"
                    placeholder="e.g. jobs.manage_budget"
                    value={catalogForm.key}
                    onChange={(e) => setCatalogForm((s) => ({ ...s, key: e.target.value }))}
                  />
                </div>
                <div className="field">
                  <label>Label</label>
                  <input
                    type="text"
                    value={catalogForm.label}
                    onChange={(e) => setCatalogForm((s) => ({ ...s, label: e.target.value }))}
                  />
                </div>
                <div className="field">
                  <label>Description</label>
                  <textarea
                    rows={3}
                    value={catalogForm.description}
                    onChange={(e) => setCatalogForm((s) => ({ ...s, description: e.target.value }))}
                  />
                </div>
                <div className="field">
                  <label>Category</label>
                  <input
                    type="text"
                    value={catalogForm.category}
                    onChange={(e) => setCatalogForm((s) => ({ ...s, category: e.target.value }))}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <span style={{ fontSize: 12, color: 'var(--text2)' }}>Founder-only permission</span>
                  <button
                    type="button"
                    className={`toggle${catalogForm.is_founder_only ? ' on' : ''}`}
                    onClick={() => setCatalogForm((s) => ({ ...s, is_founder_only: !s.is_founder_only }))}
                    aria-label="Toggle founder only"
                  />
                </div>
                <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void saveCatalogDraftEntry()}>
                  Save draft entry
                </button>
              </div>
              <div className="card card-pad">
                <div className="section-title" style={{ marginBottom: 12 }}>
                  Publish draft
                </div>
                <div className="field">
                  <label>Publish note</label>
                  <textarea
                    rows={3}
                    placeholder="Explain what changed in this version"
                    value={publishNote}
                    onChange={(e) => setPublishNote(e.target.value)}
                  />
                </div>
                <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void publishCatalog()}>
                  Publish catalog version
                </button>
                <div className="section-title" style={{ margin: '20px 0 12px' }}>
                  Active role presets
                </div>
                <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                  {rolePresets.length === 0 ? (
                    <p style={{ fontSize: 12, color: 'var(--text2)' }}>No role presets yet.</p>
                  ) : (
                    rolePresets.map((preset) => (
                      <div key={preset.id} className="activity-item">
                        <div className="activity-icon">🧩</div>
                        <div>
                          <div className="activity-text">
                            <strong>{preset.name}</strong> ({preset.key})
                          </div>
                          <div className="activity-time">
                            v{preset.source_version_no} · {preset.recommended_permission_keys.length} permissions
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
            <div className="card card-pad" style={{ marginTop: 16 }}>
              <div className="section-title" style={{ marginBottom: 12 }}>
                Create or update role preset
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div className="field">
                  <label>Preset key</label>
                  <input
                    type="text"
                    value={presetForm.key}
                    onChange={(e) => setPresetForm((s) => ({ ...s, key: e.target.value }))}
                  />
                </div>
                <div className="field">
                  <label>Name</label>
                  <input
                    type="text"
                    value={presetForm.name}
                    onChange={(e) => setPresetForm((s) => ({ ...s, name: e.target.value }))}
                  />
                </div>
                <div className="field">
                  <label>Description</label>
                  <input
                    type="text"
                    value={presetForm.description}
                    onChange={(e) => setPresetForm((s) => ({ ...s, description: e.target.value }))}
                  />
                </div>
                <div className="field">
                  <label>Target use case</label>
                  <input
                    type="text"
                    value={presetForm.target_use_case}
                    onChange={(e) => setPresetForm((s) => ({ ...s, target_use_case: e.target.value }))}
                  />
                </div>
              </div>
              <div className="field">
                <label>Recommended permissions (comma separated keys)</label>
                <textarea
                  rows={2}
                  value={presetForm.recommended_permission_keys}
                  onChange={(e) => setPresetForm((s) => ({ ...s, recommended_permission_keys: e.target.value }))}
                />
              </div>
              <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void saveRolePreset()}>
                Save role preset
              </button>
            </div>
            <div className="card card-pad" style={{ marginTop: 16 }}>
              <div className="section-title" style={{ marginBottom: 12 }}>
                Draft catalog preview ({catalogDraft.length})
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Key</th>
                      <th>Label</th>
                      <th>Category</th>
                      <th>Founder-only</th>
                    </tr>
                  </thead>
                  <tbody>
                    {catalogDraft.map((entry) => (
                      <tr key={entry.key}>
                        <td style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{entry.key}</td>
                        <td>{entry.label}</td>
                        <td>{entry.category}</td>
                        <td>{entry.is_founder_only ? 'Yes' : 'No'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

        {/* Audit */}
        <div className={`page${activePage === 'audit-hq' ? ' active' : ''}`}>
          <div className="page-inner">
            <div className="page-title">Platform Audit Log</div>
            <div className="page-sub">Cross-org timeline for catalog, presets, support, and governance events.</div>
            <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
              <FormSelect
                tone="subtle"
                wrapperClassName="!w-auto shrink-0"
                value={auditOrgFilter}
                onChange={(e) => setAuditOrgFilter(e.target.value)}
              >
                <option value="all">All organisations</option>
                {orgs.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </FormSelect>
              <FormSelect
                tone="subtle"
                wrapperClassName="!w-auto shrink-0"
                value={auditEventFilter}
                onChange={(e) => setAuditEventFilter(e.target.value)}
              >
                <option value="all">All event types</option>
                {[...new Set(auditEvents.map((a) => a.event_type))].map((eventType) => (
                  <option key={eventType} value={eventType}>
                    {eventType}
                  </option>
                ))}
              </FormSelect>
            </div>
            <div className="card card-pad">
              <div className="section-title" style={{ marginBottom: 14 }}>
                Recent events
              </div>
              {auditEvents.filter((event) => {
                if (auditOrgFilter !== 'all' && event.org_id !== auditOrgFilter) return false;
                if (auditEventFilter !== 'all' && event.event_type !== auditEventFilter) return false;
                return true;
              }).length === 0 ? (
                <div style={{ fontSize: 13, color: 'var(--text2)' }}>No events to show yet.</div>
              ) : (
                auditEvents
                  .filter((event) => {
                    if (auditOrgFilter !== 'all' && event.org_id !== auditOrgFilter) return false;
                    if (auditEventFilter !== 'all' && event.event_type !== auditEventFilter) return false;
                    return true;
                  })
                  .map((event) => (
                  <div key={`audit-${event.id}`} className="activity-item">
                    <div className="activity-icon">🔎</div>
                    <div>
                      <div className="activity-text">
                        <strong>{event.event_type}</strong> · {event.entity_type} · {event.entity_id}
                      </div>
                      <div className="activity-time">
                        {event.org_id ? `org: ${event.org_id}` : 'global'} · {relTime(event.created_at)}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Legal policies */}
        <div className={`page${activePage === 'legal-hq' ? ' active' : ''}`}>
          <div className="page-inner">
            <FounderLegalPoliciesPanel initial={legalSettings} onSaved={setLegalSettings} />
          </div>
        </div>

        {/* Settings */}
        <div className={`page${activePage === 'settings-hq' ? ' active' : ''}`}>
          <div className="page-inner">
            <div className="page-title">Platform Settings</div>
            <div className="page-sub">Global configuration for the entire Campsite platform</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div className="card card-pad">
                <div className="section-title" style={{ marginBottom: 16 }}>
                  Feature Flags
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 0', borderBottom: '1px solid var(--border)' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>Google Sheets Rota Sync</div>
                      <div style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 2 }}>Auto-sync shifts from linked spreadsheets</div>
                    </div>
                    <button type="button" className={`toggle${flagSheets ? ' on' : ''}`} onClick={() => setFlagSheets((v) => !v)} aria-label="Toggle Sheets sync" />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 0', borderBottom: '1px solid var(--border)' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>Multi-site broadcasts</div>
                      <div style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 2 }}>Allow cross-site mass messaging</div>
                    </div>
                    <button type="button" className={`toggle${flagBroadcast ? ' on' : ''}`} onClick={() => setFlagBroadcast((v) => !v)} aria-label="Toggle broadcasts" />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '13px 0' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>Beta Features</div>
                      <div style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 2 }}>Enable unreleased functionality</div>
                    </div>
                    <button type="button" className={`toggle${flagBeta ? ' on' : ''}`} onClick={() => setFlagBeta((v) => !v)} aria-label="Toggle beta" />
                  </div>
                </div>
              </div>
              <div className="card card-pad">
                <div className="section-title" style={{ marginBottom: 16 }}>
                  Billing & Plan
                </div>
                <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.5, marginBottom: 12 }}>
                  Organisation trials (14 days for new workspaces), subscription status, and trial end dates are managed in{' '}
                  <strong>Revenue &amp; Finance</strong> → Billing table. Payment providers can be wired later.
                </p>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  style={{ width: '100%', justifyContent: 'center' }}
                  onClick={() => navTo('revenue')}
                >
                  Open Revenue &amp; Finance →
                </button>
              </div>
            </div>
            <div className="card card-pad" style={{ marginTop: 16 }}>
              <div className="section-title" style={{ marginBottom: 12 }}>
                Legal &amp; compliance
              </div>
              <p style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.55, marginBottom: 12 }}>
                Policies and bundle version are stored in the database and edited under{' '}
                <strong>Legal policies</strong> in the sidebar. Current bundle:{' '}
                <code style={{ fontSize: 11.5, color: 'var(--text)' }}>{legalSettings.bundle_version}</code>
                {' · '}
                {legalSettings.effective_label}
              </p>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => navTo('legal-hq')}>
                Open Legal policies →
              </button>
            </div>
          </div>
        </div>
      </div>
      </div>

      {/* Organisation modal */}
      <div
        className={`overlay${modal === 'campsite' ? ' open' : ''}`}
        id="modal-campsite"
        role="presentation"
        onClick={(e) => e.target === e.currentTarget && setModal(null)}
      >
        {currentOrg && (
          <div className="modal modal-lg">
            <div className="modal-header">
              <div>
                <div className="modal-title">{currentOrg.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>📍 {currentOrg.slug}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button type="button" className="btn btn-primary btn-sm" onClick={openCampsiteAdmin}>
                  Open org admin →
                </button>
                <button type="button" className="modal-close" onClick={() => setModal(null)}>
                  ✕
                </button>
              </div>
            </div>
            <div className="modal-body">
              <div className="detail-grid">
                <div className="detail-stat">
                  <div className="ds-val">{currentOrg.user_count}</div>
                  <div className="ds-lbl">Members</div>
                </div>
                <div className="detail-stat">
                  <div className="ds-val">{currentOrg.broadcast_count}</div>
                  <div className="ds-lbl">Broadcasts</div>
                </div>
                <div className="detail-stat">
                  <div className="ds-val"> - </div>
                  <div className="ds-lbl">Revenue</div>
                  <div className="ds-trend" style={{ color: 'var(--text3)' }}>
                    Not tracked here
                  </div>
                </div>
                <div className="detail-stat">
                  <div className="ds-val">{currentOrg.is_active ? 'Active' : 'Inactive'}</div>
                  <div className="ds-lbl">Status</div>
                  <div className="ds-trend" style={{ color: 'var(--text3)' }}>
                    Created {formatJoined(currentOrg.created_at)}
                  </div>
                </div>
              </div>
              <div className="tab-bar">
                <button type="button" className={`tab${csTab === 'members' ? ' active' : ''}`} onClick={() => setCsTab('members')}>
                  Members
                </button>
                <button type="button" className={`tab${csTab === 'rota' ? ' active' : ''}`} onClick={() => setCsTab('rota')}>
                  Rota
                </button>
                <button type="button" className={`tab${csTab === 'broadcasts' ? ' active' : ''}`} onClick={() => setCsTab('broadcasts')}>
                  Broadcasts
                </button>
                <button type="button" className={`tab${csTab === 'settings' ? ' active' : ''}`} onClick={() => setCsTab('settings')}>
                  Settings
                </button>
              </div>
              <div style={{ display: csTab === 'members' ? 'block' : 'none' }}>
                {membersLoading ? (
                  <p style={{ fontSize: 13, color: 'var(--text2)', padding: '12px 0' }}>Loading members...</p>
                ) : membersLoadErr ? (
                  <p style={{ fontSize: 13, color: '#b91c1c', padding: '12px 0' }}>{membersLoadErr}</p>
                ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10.5, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Member</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10.5, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Role</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10.5, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Status</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10.5, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {modalOrgMembers.map((m) => (
                      <tr key={m.id} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '10px 12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div
                              style={{
                                width: 26,
                                height: 26,
                                borderRadius: '50%',
                                background: 'var(--surface3)',
                                border: '1px solid var(--border2)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: 9,
                                fontWeight: 600,
                                color: 'var(--text3)',
                              }}
                            >
                              {memberInitials(m.full_name)}
                            </div>
                            <div>
                              <div style={{ fontSize: 12.5, color: 'var(--text)' }}>{m.full_name}</div>
                              <div style={{ fontSize: 10, color: 'var(--text3)' }}>{m.email ?? '-'}</div>
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <span className={`rb ${ROLE_MAP[m.role] ?? 'rb-staff'}`} style={{ fontSize: 10.5 }}>
                            {ROLE_LBL[m.role] ?? m.role}
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <span className={`sb sb-${m.status}`} style={{ fontSize: 10.5 }}>
                            <span className="sb-dot" />
                            {m.status.charAt(0).toUpperCase() + m.status.slice(1)}
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            disabled={busyRemoveUserId === m.id}
                            onClick={() => void handleRemoveMember(currentOrg.id, m.id)}
                          >
                            {busyRemoveUserId === m.id ? '...' : 'Remove'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                )}
              </div>
              <div style={{ display: csTab === 'rota' ? 'block' : 'none' }}>
                {modalRota.length === 0 ? (
                  <p style={{ fontSize: 13, color: 'var(--text2)', padding: '12px 0' }}>
                    No upcoming shifts for this organisation in the next 30 days.
                  </p>
                ) : (
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)' }}>
                        <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10.5, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase' }}>Staff</th>
                        <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10.5, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase' }}>Date</th>
                        <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10.5, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase' }}>Time</th>
                        <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10.5, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase' }}>Role</th>
                      </tr>
                    </thead>
                    <tbody>
                      {modalRota.map((s) => {
                        const start = new Date(s.start_time);
                        const end = new Date(s.end_time);
                        const dateStr = start.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
                        const pad = (n: number) => String(n).padStart(2, '0');
                        const timeStr = `${pad(start.getHours())}:${pad(start.getMinutes())}–${pad(end.getHours())}:${pad(end.getMinutes())}`;
                        return (
                          <tr key={s.id} style={{ borderBottom: '1px solid var(--border)' }}>
                            <td style={{ padding: '10px 12px', color: 'var(--text)' }}>{s.staff_name ?? 'Unassigned'}</td>
                            <td style={{ padding: '10px 12px', color: 'var(--text2)' }}>{dateStr}</td>
                            <td style={{ padding: '10px 12px', color: 'var(--text2)' }}>{timeStr}</td>
                            <td style={{ padding: '10px 12px', color: 'var(--text3)' }}>{s.role_label ?? '—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
              <div style={{ display: csTab === 'broadcasts' ? 'block' : 'none' }}>
                {modalBroadcasts.length === 0 ? (
                  <p style={{ fontSize: 13, color: 'var(--text2)', padding: '12px 0' }}>
                    No broadcasts found for this organisation.
                  </p>
                ) : (
                  modalBroadcasts.map((b) => (
                    <div key={b.id} className="activity-item">
                      <div className="activity-icon">📡</div>
                      <div>
                        <div className="activity-text">
                          <strong>{b.title}</strong>
                          {b.status !== 'sent' && (
                            <span style={{ marginLeft: 8, fontSize: 10, color: 'var(--text3)', fontStyle: 'italic' }}>{b.status}</span>
                          )}
                        </div>
                        <div className="activity-time">
                          {b.sender_name ?? 'Unknown'} · {relTime(b.sent_at ?? b.created_at)}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div style={{ display: csTab === 'settings' ? 'block' : 'none' }}>
                <p style={{ fontSize: 12, color: '#b45309', marginBottom: 14 }}>
                  Changing the subdomain slug breaks existing links and bookmarks for this tenant.
                </p>
                <div className="field">
                  <label>Organisation name</label>
                  <input
                    type="text"
                    value={settingsDraft.name}
                    onChange={(e) => setSettingsDraft((s) => ({ ...s, name: e.target.value }))}
                  />
                </div>
                <div className="field">
                  <label>Subdomain slug</label>
                  <input
                    type="text"
                    value={settingsDraft.slug}
                    onChange={(e) => {
                      setSettingsDraft((s) => ({ ...s, slug: e.target.value }));
                    }}
                  />
                </div>
                <div className="field">
                  <label>Logo URL (optional)</label>
                  <input
                    type="url"
                    placeholder="https://..."
                    value={settingsDraft.logo_url}
                    onChange={(e) => setSettingsDraft((s) => ({ ...s, logo_url: e.target.value }))}
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0', borderTop: '1px solid var(--border)', marginTop: 8 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>Organisation active</div>
                    <div style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 2 }}>Inactive tenants cannot sign in on their subdomain</div>
                  </div>
                  <button
                    type="button"
                    className={`toggle${settingsDraft.is_active ? ' on' : ''}`}
                    onClick={() => setSettingsDraft((s) => ({ ...s, is_active: !s.is_active }))}
                    aria-label="Toggle active"
                  />
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
                  <button type="button" className="btn btn-primary" disabled={busySaveOrg} onClick={() => void saveOrgSettings()}>
                    {busySaveOrg ? 'Saving...' : 'Save changes'}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    disabled={busyDeactivate || !currentOrg.is_active}
                    onClick={() => void handleDeactivateOrg()}
                  >
                    {busyDeactivate ? '...' : 'Deactivate organisation'}
                  </button>
                </div>
                <div style={{ marginTop: 28, paddingTop: 20, borderTop: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#b91c1c', marginBottom: 8 }}>Danger zone</div>
                  <p style={{ fontSize: 12, color: 'var(--text2)', marginBottom: 10 }}>
                    Deletes all member accounts in this organisation, then removes the organisation and related data.
                    <strong> Platform founders</strong> (users in <code style={{ fontSize: 11 }}>platform_admins</code>) are
                    not deleted - they are only removed from this org.
                    Type the organisation name <strong>{currentOrg.name}</strong> to confirm.
                  </p>
                  <div className="field" style={{ marginBottom: 10 }}>
                    <input
                      type="text"
                      placeholder="Organisation name"
                      value={permanentDeleteConfirm}
                      onChange={(e) => setPermanentDeleteConfirm(e.target.value)}
                      autoComplete="off"
                      aria-label="Type organisation name to confirm permanent deletion"
                    />
                  </div>
                  <button
                    type="button"
                    className="btn btn-danger"
                    disabled={busyHardDelete}
                    onClick={() => void handlePermanentDeleteOrg()}
                  >
                    {busyHardDelete ? 'Deleting...' : 'Permanently delete organisation'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* New site modal */}
      <div
        className={`overlay${modal === 'new-site' ? ' open' : ''}`}
        role="presentation"
        onClick={(e) => e.target === e.currentTarget && setModal(null)}
      >
        <div className="modal">
          <div className="modal-header">
            <div className="modal-title">Add organisation</div>
            <button type="button" className="modal-close" onClick={() => setModal(null)}>
              ✕
            </button>
          </div>
          <div className="modal-body">
            <div className="field">
              <label>Organisation name</label>
              <input
                type="text"
                placeholder="e.g. Sussex Students Union"
                value={newSite.name}
                onChange={(e) => setNewSite((s) => ({ ...s, name: e.target.value }))}
              />
            </div>
            <div className="field">
              <label>Subdomain slug</label>
              <input
                type="text"
                placeholder="e.g. sussex-union"
                value={newSite.slug}
                onChange={(e) => {
                  setNewSiteSlugTouched(true);
                  setNewSite((s) => ({ ...s, slug: e.target.value }));
                }}
              />
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={() => setModal(null)}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" disabled={creatingOrg} onClick={() => void createNewSite()}>
              {creatingOrg ? 'Creating...' : 'Create organisation'}
            </button>
          </div>
        </div>
      </div>

      {/* New broadcast modal */}
      <div
        className={`overlay${modal === 'broadcast' ? ' open' : ''}`}
        role="presentation"
        onClick={(e) => e.target === e.currentTarget && setModal(null)}
      >
        <div className="modal">
          <div className="modal-header">
            <div className="modal-title">New Broadcast</div>
            <button type="button" className="modal-close" onClick={() => setModal(null)}>
              ✕
            </button>
          </div>
          <div className="modal-body">
            <div className="field">
              <label>Title</label>
              <input
                type="text"
                placeholder="e.g. Spring site briefing"
                value={broadcastDraft.title}
                onChange={(e) => setBroadcastDraft((d) => ({ ...d, title: e.target.value }))}
              />
            </div>
            <div className="field">
              <label>Audience</label>
              <FormSelect
                tone="subtle"
                value={broadcastDraft.audience}
                onChange={(e) => setBroadcastDraft((d) => ({ ...d, audience: e.target.value as 'all' | 'site' }))}
              >
                <option value="all">All members (company-wide)</option>
                <option value="site">Single organisation</option>
              </FormSelect>
            </div>
            {broadcastDraft.audience === 'site' && (
              <div className="field">
                <label>Organisation</label>
                <FormSelect
                  tone="subtle"
                  value={broadcastDraft.siteId}
                  onChange={(e) => setBroadcastDraft((d) => ({ ...d, siteId: e.target.value }))}
                >
                  {orgs.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </FormSelect>
              </div>
            )}
            <div className="field">
              <label>Message</label>
              <textarea
                rows={4}
                placeholder="Write your message..."
                value={broadcastDraft.body}
                onChange={(e) => setBroadcastDraft((d) => ({ ...d, body: e.target.value }))}
              />
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={() => setModal(null)}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" onClick={submitBroadcast}>
              Send broadcast
            </button>
          </div>
        </div>
      </div>

      <div className={`toast${toast ? ' show' : ''}`}>{toast ?? ''}</div>
    </>
  );
}
