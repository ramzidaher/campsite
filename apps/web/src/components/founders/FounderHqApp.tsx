'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { createClient } from '@/lib/supabase/client';
import {
  CAMPSITES,
  CS_MEMBERS,
  CS_ROTA,
  type BroadcastRow,
  type Campsite,
  type CampsiteStatus,
  escapeHtml,
  getActivity,
  getBroadcasts,
  GLOBAL_MEMBERS,
  PENDING_GLOBAL,
  type PendingRow,
  ROTA_GLOBAL,
} from '@/components/founders/mockData';

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
  'settings-hq': 'Platform Settings',
};

type FounderPageKey = keyof typeof PAGE_LABELS;

function greeting(hour: number, firstName: string) {
  if (hour < 12) return `Good morning, ${firstName}`;
  if (hour < 17) return `Good afternoon, ${firstName}`;
  return `Good evening, ${firstName}`;
}

const ROLE_MAP: Record<string, string> = {
  admin: 'rb-admin',
  mgr: 'rb-mgr',
  coord: 'rb-coord',
  staff: 'rb-staff',
};

const ROLE_LBL: Record<string, string> = {
  admin: 'Super Admin',
  mgr: 'Manager',
  coord: 'Coordinator',
  staff: 'Weekly Paid',
};

function statusCls(s: CampsiteStatus) {
  if (s === 'open') return 'cs-open';
  if (s === 'seasonal') return 'cs-seasonal';
  return 'cs-closed';
}

function statusLabel(s: CampsiteStatus) {
  if (s === 'open') return '● Open';
  if (s === 'seasonal') return '◐ Seasonal';
  return '○ Closed';
}

export function FounderHqApp({ user }: { user: FounderHqUser }) {
  const [activePage, setActivePage] = useState<FounderPageKey>('overview');
  const [csFilter, setCsFilter] = useState<CampsiteStatus | 'all'>('all');
  const [csQuery, setCsQuery] = useState('');
  const [modal, setModal] = useState<'campsite' | 'new-site' | 'broadcast' | null>(null);
  const [currentCampsiteId, setCurrentCampsiteId] = useState<number | null>(null);
  const [csTab, setCsTab] = useState<'members' | 'rota' | 'broadcasts' | 'settings'>('members');
  const [toast, setToast] = useState<string | null>(null);
  const [flagSheets, setFlagSheets] = useState(true);
  const [flagDiscount, setFlagDiscount] = useState(true);
  const [flagBroadcast, setFlagBroadcast] = useState(true);
  const [flagBeta, setFlagBeta] = useState(false);
  const [siteBooking, setSiteBooking] = useState(true);
  const [siteApproval, setSiteApproval] = useState(true);
  const [sitePublic, setSitePublic] = useState(true);
  const [pendingList, setPendingList] = useState<PendingRow[]>(() => [...PENDING_GLOBAL]);
  const [memberQuery, setMemberQuery] = useState('');
  const [memberSite, setMemberSite] = useState<string>('all');
  const [memberRole, setMemberRole] = useState<string>('all');
  const [memberStatusTab, setMemberStatusTab] = useState<'all' | 'active' | 'pending' | 'inactive'>('all');
  const [newSite, setNewSite] = useState({
    name: '',
    region: '',
    country: 'England',
    status: 'Open' as 'Open' | 'Seasonal' | 'Closed',
    managerEmail: '',
  });
  const [broadcastDraft, setBroadcastDraft] = useState({
    title: '',
    audience: 'all' as 'all' | 'site',
    siteId: CAMPSITES[0]?.id ?? 1,
    body: '',
  });
  const [sentBroadcasts, setSentBroadcasts] = useState<BroadcastRow[]>([]);

  const broadcasts = useMemo(() => {
    const base = getBroadcasts(user.displayName);
    return [...sentBroadcasts, ...base];
  }, [sentBroadcasts, user.displayName]);
  const activity = useMemo(() => getActivity(user.displayName), [user.displayName]);

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

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2800);
    return () => clearTimeout(t);
  }, [toast]);

  const navTo = useCallback((page: FounderPageKey) => {
    setActivePage(page);
  }, []);

  const filteredCampsites = useMemo(() => {
    const q = csQuery.toLowerCase().trim();
    return CAMPSITES.filter((c) => {
      if (csFilter !== 'all' && c.status !== csFilter) return false;
      if (!q) return true;
      return `${c.name} ${c.location}`.toLowerCase().includes(q);
    });
  }, [csFilter, csQuery]);

  const topCampsites = useMemo(() => {
    return [...CAMPSITES]
      .filter((c) => c.status !== 'closed')
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);
  }, []);

  const monthlyVals = [58, 63, 71, 62, 74, 87];
  const monthlyMax = Math.max(...monthlyVals);

  const revenueSites = useMemo(() => {
    const sites = CAMPSITES.filter((c) => c.revenue > 0).sort((a, b) => b.revenue - a.revenue);
    const max = sites[0]?.revenue ?? 1;
    return { sites, max };
  }, []);

  const revenueTrend = [58000, 63000, 71000, 62000, 74000, 87400];
  const revenueTrendMax = Math.max(...revenueTrend);

  const growthSites = useMemo(() => {
    const sites = CAMPSITES.filter((c) => c.status !== 'closed').slice(0, 8);
    const newSignups = [8, 5, 12, 3, 6, 9, 4, 7];
    return sites.map((c, i) => ({ c, n: newSignups[i] ?? 0 }));
  }, []);

  const pendingCount = pendingList.length;

  const memberSiteOptions = useMemo(() => {
    const names = [...new Set(CAMPSITES.map((c) => c.name))].sort();
    return ['all', ...names];
  }, []);

  const filteredMembers = useMemo(() => {
    const q = memberQuery.toLowerCase().trim();
    return GLOBAL_MEMBERS.filter((m) => {
      if (memberSite !== 'all' && m.site !== memberSite) return false;
      if (memberRole !== 'all' && m.role !== memberRole) return false;
      if (memberStatusTab !== 'all' && m.status !== memberStatusTab) return false;
      if (!q) return true;
      return `${m.name} ${m.email} ${m.site}`.toLowerCase().includes(q);
    });
  }, [memberQuery, memberSite, memberRole, memberStatusTab]);

  const auditExtra = useMemo(
    () => [
      {
        icon: '⚙️',
        html: `Platform settings updated by <strong>${escapeHtml(user.displayName)}</strong> — billing renewed`,
        time: '25 Mar, 09:00',
      },
      {
        icon: '⛺',
        html: `Campsite <strong>Saltmarsh Edge</strong> created by <strong>${escapeHtml(user.displayName)}</strong>`,
        time: '24 Mar, 14:22',
      },
      {
        icon: '🔒',
        html: "<strong>Chloe Jensen</strong>'s account deactivated by <strong>Tom Wilson</strong>",
        time: '24 Mar, 10:00',
      },
    ],
    [user.displayName]
  );

  const currentCampsite: Campsite | undefined = useMemo(
    () => CAMPSITES.find((x) => x.id === currentCampsiteId),
    [currentCampsiteId]
  );

  const modalMembers = useMemo(() => {
    if (!currentCampsite) return [];
    const id = currentCampsite.id;
    const fromCs = CS_MEMBERS[id];
    if (fromCs) return fromCs;
    return [
      { initials: currentCampsite.mgr_init, name: currentCampsite.mgr, role: 'admin' as const, status: 'active' as const },
      { initials: 'ST', name: 'Staff Member', role: 'staff' as const, status: 'active' as const },
    ];
  }, [currentCampsite]);

  const modalRota = useMemo(() => {
    if (!currentCampsite) return [];
    return CS_ROTA[currentCampsite.id] ?? ROTA_GLOBAL.slice(0, 3);
  }, [currentCampsite]);

  const openCampsiteDetail = (id: number) => {
    setCurrentCampsiteId(id);
    setCsTab('members');
    setModal('campsite');
  };

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = '/login';
  };

  const openCampsiteAdmin = () => {
    setModal(null);
    const name = CAMPSITES.find((c) => c.id === currentCampsiteId)?.name ?? 'site';
    showToast(`⛺ Opening Site Admin for ${name}`);
  };

  const approvePending = (email: string) => {
    const row = pendingList.find((p) => p.email === email);
    setPendingList((list) => list.filter((p) => p.email !== email));
    showToast(`✅ Approved ${row?.name ?? 'member'}`);
  };

  const rejectPending = (email: string) => {
    const row = pendingList.find((p) => p.email === email);
    setPendingList((list) => list.filter((p) => p.email !== email));
    showToast(`Rejected: ${row?.name ?? 'request'}`);
  };

  const submitBroadcast = () => {
    const title = broadcastDraft.title.trim();
    if (!title) {
      showToast('Add a broadcast title');
      return;
    }
    const cs = CAMPSITES.find((c) => c.id === broadcastDraft.siteId);
    const reach =
      broadcastDraft.audience === 'all'
        ? 'All 348 members'
        : `${cs?.name ?? 'Site'} · ${cs?.members ?? 0} members`;
    setSentBroadcasts((prev) => [
      {
        icon: '📡',
        title,
        by: `${user.displayName} (Founder)`,
        sent: 'Just now',
        reach,
      },
      ...prev,
    ]);
    setBroadcastDraft({
      title: '',
      audience: 'all',
      siteId: CAMPSITES[0]?.id ?? 1,
      body: '',
    });
    setModal(null);
    showToast('📡 Broadcast sent');
  };

  const createNewSite = () => {
    if (!newSite.name.trim()) {
      showToast('Enter a site name');
      return;
    }
    showToast(`⛺ Campsite “${newSite.name.trim()}” created ✓`);
    setNewSite({ name: '', region: '', country: 'England', status: 'Open', managerEmail: '' });
    setModal(null);
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
          <div className="brand-icon">⛺</div>
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
          <NavBtn page="campsites" icon="⛺" label="All Campsites" badge={String(CAMPSITES.length)} badgeClass="nb-gold" />
          <NavBtn page="revenue" icon="₤" label="Revenue & Finance" />
          <NavBtn page="growth" icon="↗" label="Growth & Analytics" />

          <div className="nav-label" style={{ marginTop: 4 }}>
            Operations
          </div>
          <NavBtn page="members" icon="◎" label="All Members" badge={String(GLOBAL_MEMBERS.length)} badgeClass="nb-muted" />
          <NavBtn page="pending-global" icon="⏳" label="Pending Approvals" badge={String(pendingCount)} badgeClass="nb-red" />
          <NavBtn page="broadcasts-hq" icon="📡" label="Broadcasts HQ" />
          <NavBtn page="rota-hq" icon="📅" label="Rota Overview" />

          <div className="nav-label" style={{ marginTop: 4 }}>
            Platform
          </div>
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
            <button type="button" className="icon-btn" title="Export" onClick={() => showToast('📊 Exporting report…')}>
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
                  <div className="hero-sub">Here&apos;s your live company pulse across all 12 campsites.</div>
                </div>
                <div className="hero-time">
                  <div style={{ color: 'var(--text3)', fontSize: 11.5 }}>Today</div>
                  <div className="hero-date">{heroDate}</div>
                </div>
              </div>
              <div className="hero-metrics">
                <div className="hero-metric">
                  <div className="hm-val">12</div>
                  <div className="hm-lbl">Active Sites</div>
                </div>
                <div className="hero-metric">
                  <div className="hm-val">348</div>
                  <div className="hm-lbl">Total Members</div>
                </div>
                <div className="hero-metric">
                  <div className="hm-val">£87.4k</div>
                  <div className="hm-lbl">MRR</div>
                </div>
                <div className="hero-metric">
                  <div className="hm-val">94.2%</div>
                  <div className="hm-lbl">Avg Occupancy</div>
                </div>
                <div className="hero-metric">
                  <div className="hm-val">{pendingCount}</div>
                  <div className="hm-lbl">Pending Actions</div>
                </div>
              </div>
            </div>

            <div className="stats-row">
              <div className="stat-card">
                <div className="stat-label">
                  Total Revenue (YTD) <span className="stat-icon">💷</span>
                </div>
                <div className="stat-value">£1.04M</div>
                <div className="stat-sub">
                  <span className="up">↑ 22%</span> &nbsp;vs last year
                </div>
                <div className="stat-bar">
                  <div className="stat-bar-fill fill-gold" style={{ width: '72%' }} />
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-label">
                  Total Members <span className="stat-icon">👤</span>
                </div>
                <div className="stat-value">348</div>
                <div className="stat-sub">
                  <span className="up">+38</span> &nbsp;this month
                </div>
                <div className="stat-bar">
                  <div className="stat-bar-fill fill-green" style={{ width: '81%' }} />
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-label">
                  Avg Bookings / Site <span className="stat-icon">📅</span>
                </div>
                <div className="stat-value">189</div>
                <div className="stat-sub">
                  <span className="up">↑ 11%</span> &nbsp;vs last month
                </div>
                <div className="stat-bar">
                  <div className="stat-bar-fill fill-blue" style={{ width: '63%' }} />
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-label">
                  Net Promoter Score <span className="stat-icon">⭐</span>
                </div>
                <div className="stat-value">78</div>
                <div className="stat-sub">
                  <span className="up">↑ 4pts</span> &nbsp;since Jan
                </div>
                <div className="stat-bar">
                  <div className="stat-bar-fill fill-purple" style={{ width: '78%' }} />
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div className="card">
                  <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid var(--border)' }}>
                    <div className="section-head" style={{ margin: 0 }}>
                      <div className="section-title">Top Performing Campsites</div>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => navTo('campsites')}>
                        View all →
                      </button>
                    </div>
                  </div>
                  <div className="card-pad" style={{ paddingTop: 14 }}>
                    {topCampsites.map((c, i) => (
                      <div
                        key={c.id}
                        className="perf-row"
                        style={{ cursor: 'pointer' }}
                        onClick={() => openCampsiteDetail(c.id)}
                        onKeyDown={(e) => e.key === 'Enter' && openCampsiteDetail(c.id)}
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
                          <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 400 }}>{c.location}</div>
                        </div>
                        <div className="perf-bar-wrap">
                          <div className="perf-bar" style={{ width: `${Math.round((c.revenue / 11200) * 100)}%` }} />
                        </div>
                        <div className="perf-val">£{(c.revenue / 1000).toFixed(1)}k</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="card">
                  <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid var(--border)' }}>
                    <div className="section-head" style={{ margin: 0 }}>
                      <div className="section-title">Cross-Site Activity</div>
                      <span style={{ fontSize: 11.5, color: 'var(--text3)' }}>Last 24 hours</span>
                    </div>
                  </div>
                  <div className="card-pad" style={{ paddingTop: 6, paddingBottom: 6 }}>
                    {activity.map((a, idx) => (
                      <div key={idx} className="activity-item">
                        <div className="activity-icon">{a.icon}</div>
                        <div>
                          <div className="activity-text" dangerouslySetInnerHTML={{ __html: a.html }} />
                          <div className="activity-time">{a.time}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <div className="section-head">
                    <div className="section-title">Alerts</div>
                    <span style={{ fontSize: 11.5, color: 'var(--text3)' }}>3 active</span>
                  </div>
                  <div className="alert alert-warn">
                    ⚠️{' '}
                    <span>
                      <strong>Lakeside Peak</strong> — occupancy at 102%, overbooking risk
                    </span>
                  </div>
                  <div className="alert alert-info">
                    ℹ️{' '}
                    <span>
                      <strong>Birchwood Valley</strong> — awaiting licence renewal (12 days)
                    </span>
                  </div>
                  <div className="alert alert-success">
                    ✓{' '}
                    <span>
                      <strong>Glenshee Highlands</strong> — just passed safety inspection
                    </span>
                  </div>
                </div>

                <div className="card card-pad">
                  <div className="section-head" style={{ marginBottom: 10 }}>
                    <div className="section-title">Monthly Revenue</div>
                    <span style={{ fontSize: 11.5, color: 'var(--text3)' }}>Mar 2026</span>
                  </div>
                  <div style={{ fontFamily: 'var(--serif)', fontSize: 26, color: 'var(--accent)' }}>£87.4k</div>
                  <div style={{ fontSize: 11.5, color: 'var(--green)', marginTop: 2 }}>↑ 18% vs Feb</div>
                  <div className="mini-chart">
                    {monthlyVals.map((v, i) => (
                      <div
                        key={i}
                        className={`bar${i === 5 ? ' highlight' : ''}`}
                        style={{ height: Math.max(8, (v / monthlyMax) * 44) }}
                        title={`£${v}k`}
                      />
                    ))}
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: 10,
                      color: 'var(--text3)',
                      marginTop: 5,
                    }}
                  >
                    <span>Oct</span>
                    <span>Nov</span>
                    <span>Dec</span>
                    <span>Jan</span>
                    <span>Feb</span>
                    <span style={{ color: 'var(--gold2)', fontWeight: 600 }}>Mar</span>
                  </div>
                </div>

                <div className="card card-pad">
                  <div className="section-title" style={{ marginBottom: 12 }}>
                    Quick Actions
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                    <button type="button" className="btn btn-ghost btn-sm" style={{ justifyContent: 'flex-start' }} onClick={() => navTo('pending-global')}>
                      ⏳ &nbsp;Review {pendingCount} pending approval{pendingCount === 1 ? '' : 's'}
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
                <div className="page-title">All Campsites</div>
                <div className="page-sub">12 locations — click any site to open its admin dashboard</div>
              </div>
              <button type="button" className="btn btn-primary" onClick={() => setModal('new-site')}>
                + Add Campsite
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
              <div className="search-bar" style={{ width: 240 }}>
                <span style={{ color: 'var(--text3)', fontSize: 12 }}>🔍</span>
                <input type="text" placeholder="Search sites…" value={csQuery} onChange={(e) => setCsQuery(e.target.value)} />
              </div>
              {(['all', 'open', 'seasonal', 'closed'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  className={`filter-pill${csFilter === f ? ' active' : ''}`}
                  onClick={() => setCsFilter(f)}
                >
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
              <div style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text3)' }}>Sorted by revenue ↓</div>
            </div>

            <div className="campsite-grid">
              {filteredCampsites.map((c) => (
                <div key={c.id} className="campsite-card" onClick={() => openCampsiteDetail(c.id)} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && openCampsiteDetail(c.id)}>
                  <div className="campsite-header">
                    <div>
                      <div className="campsite-name">{c.name}</div>
                      <div className="campsite-location">📍 {c.location}</div>
                    </div>
                    <span className={`campsite-status ${statusCls(c.status)}`}>{statusLabel(c.status)}</span>
                  </div>
                  <div className="campsite-body">
                    <div className="campsite-metrics">
                      <div className="cm-item">
                        <div className="cm-val">{c.members}</div>
                        <div className="cm-lbl">Members</div>
                      </div>
                      <div className="cm-item">
                        <div className="cm-val">{c.status === 'closed' ? '—' : c.bookings}</div>
                        <div className="cm-lbl">Bookings</div>
                      </div>
                      <div className="cm-item">
                        <div className="cm-val">{c.status === 'closed' ? '—' : `£${(c.revenue / 1000).toFixed(1)}k`}</div>
                        <div className="cm-lbl">Revenue</div>
                      </div>
                      <div className="cm-item">
                        <div className="cm-val">{c.status === 'closed' ? '—' : `${c.occ}%`}</div>
                        <div className="cm-lbl">Occupancy</div>
                      </div>
                    </div>
                  </div>
                  <div className="campsite-footer">
                    <div className="campsite-mgr">
                      <div className="cm-av">{c.mgr_init}</div>
                      {c.mgr}
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
            <div className="page-sub">Consolidated financials across all 12 campsites</div>

            <div className="stats-row" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
              <div className="stat-card">
                <div className="stat-label">
                  Total Revenue (YTD) <span className="stat-icon">💷</span>
                </div>
                <div className="stat-value">£1.04M</div>
                <div className="stat-sub">
                  <span className="up">↑ 22%</span> &nbsp;vs 2025
                </div>
                <div className="stat-bar">
                  <div className="stat-bar-fill fill-gold" style={{ width: '72%' }} />
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-label">
                  Monthly Recurring Revenue <span className="stat-icon">📈</span>
                </div>
                <div className="stat-value">£87.4k</div>
                <div className="stat-sub">
                  <span className="up">↑ 18%</span> &nbsp;vs Feb 2026
                </div>
                <div className="stat-bar">
                  <div className="stat-bar-fill fill-green" style={{ width: '67%' }} />
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-label">
                  Avg Revenue / Site <span className="stat-icon">⛺</span>
                </div>
                <div className="stat-value">£7.3k</div>
                <div className="stat-sub">
                  <span className="up">↑ 9%</span> &nbsp;vs last month
                </div>
                <div className="stat-bar">
                  <div className="stat-bar-fill fill-blue" style={{ width: '55%' }} />
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div className="card">
                <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid var(--border)' }}>
                  <div className="section-title">Revenue by Site (March)</div>
                </div>
                <div className="card-pad" style={{ paddingTop: 14 }}>
                  {revenueSites.sites.map((c) => (
                    <div key={c.id} className="perf-row">
                      <div className="perf-label">
                        {c.name}
                        <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 400 }}>{c.location}</div>
                      </div>
                      <div className="perf-bar-wrap" style={{ width: 120 }}>
                        <div className="perf-bar" style={{ width: `${Math.round((c.revenue / revenueSites.max) * 100)}%` }} />
                      </div>
                      <div className="perf-val">£{(c.revenue / 1000).toFixed(1)}k</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="card">
                <div style={{ padding: '18px 20px 14px', borderBottom: '1px solid var(--border)' }}>
                  <div className="section-title">Monthly Trend (Oct–Mar)</div>
                </div>
                <div className="card-pad">
                  <div style={{ height: 160, display: 'flex', alignItems: 'flex-end', gap: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, width: '100%', height: '100%' }}>
                      {revenueTrend.map((v, i) => (
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
                                height: `${Math.max(8, Math.round((v / revenueTrendMax) * 100))}%`,
                                borderRadius: '4px 4px 0 0',
                                background:
                                  i === 5 ? 'linear-gradient(180deg, var(--gold2), var(--gold))' : 'var(--surface3)',
                                transition: 'background var(--t)',
                              }}
                              title={`£${(v / 1000).toFixed(0)}k`}
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
                    <span>Oct</span>
                    <span>Nov</span>
                    <span>Dec</span>
                    <span>Jan</span>
                    <span>Feb</span>
                    <span style={{ color: 'var(--gold2)', fontWeight: 600 }}>Mar</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Growth */}
        <div className={`page${activePage === 'growth' ? ' active' : ''}`}>
          <div className="page-inner">
            <div className="page-title">Growth & Analytics</div>
            <div className="page-sub">Platform-wide engagement, retention and expansion data</div>

            <div className="stats-row">
              <div className="stat-card">
                <div className="stat-label">
                  Member Growth (MoM) <span className="stat-icon">↗</span>
                </div>
                <div className="stat-value">+12.4%</div>
                <div className="stat-sub">
                  <span className="up">Best</span> &nbsp;month in 14 months
                </div>
                <div className="stat-bar">
                  <div className="stat-bar-fill fill-green" style={{ width: '82%' }} />
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-label">
                  Retention Rate <span className="stat-icon">🔄</span>
                </div>
                <div className="stat-value">88.7%</div>
                <div className="stat-sub">
                  <span className="up">↑ 2.1pts</span> &nbsp;vs last quarter
                </div>
                <div className="stat-bar">
                  <div className="stat-bar-fill fill-blue" style={{ width: '89%' }} />
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-label">
                  New Sites This Year <span className="stat-icon">⛺</span>
                </div>
                <div className="stat-value">3</div>
                <div className="stat-sub">
                  Target: <span className="up">5 by Dec</span>
                </div>
                <div className="stat-bar">
                  <div className="stat-bar-fill fill-gold" style={{ width: '60%' }} />
                </div>
              </div>
              <div className="stat-card">
                <div className="stat-label">
                  Platform Uptime <span className="stat-icon">⚡</span>
                </div>
                <div className="stat-value">99.9%</div>
                <div className="stat-sub">30-day rolling average</div>
                <div className="stat-bar">
                  <div className="stat-bar-fill fill-purple" style={{ width: '99%' }} />
                </div>
              </div>
            </div>

            <div className="card card-pad">
              <div className="section-title" style={{ marginBottom: 16 }}>
                Member Signups by Site (March)
              </div>
              {growthSites.map(({ c, n }) => (
                <div key={c.id} className="perf-row">
                  <div className="perf-label">
                    {c.name}
                    <div style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 400 }}>+{n} new members</div>
                  </div>
                  <div className="perf-bar-wrap" style={{ width: 180 }}>
                    <div className="perf-bar" style={{ width: `${Math.round((n / 12) * 100)}%` }} />
                  </div>
                  <div className="perf-val">{n}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Members */}
        <div className={`page${activePage === 'members' ? ' active' : ''}`}>
          <div className="page-inner">
            <div className="page-title">All Members</div>
            <div className="page-sub">348 members across 12 campsites — global view</div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
              <div className="search-bar" style={{ width: 240 }}>
                <span style={{ color: 'var(--text3)', fontSize: 12 }}>🔍</span>
                <input
                  type="text"
                  placeholder="Search name, email or site…"
                  value={memberQuery}
                  onChange={(e) => setMemberQuery(e.target.value)}
                />
              </div>
              <select className="fh-muted-select" value={memberSite} onChange={(e) => setMemberSite(e.target.value)}>
                {memberSiteOptions.map((s) => (
                  <option key={s} value={s}>
                    {s === 'all' ? 'All campsites' : s}
                  </option>
                ))}
              </select>
              <select className="fh-muted-select" value={memberRole} onChange={(e) => setMemberRole(e.target.value)}>
                <option value="all">All roles</option>
                <option value="admin">Super Admin</option>
                <option value="mgr">Manager</option>
                <option value="coord">Coordinator</option>
                <option value="staff">Weekly Paid</option>
              </select>
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
                      <th>Campsite</th>
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
                        <tr key={m.email}>
                          <td>
                            <div className="td-name">
                              <div className="td-av">{m.initials}</div>
                              <div>
                                <div style={{ fontWeight: 500, color: 'var(--text)' }}>{m.name}</div>
                                <div style={{ fontSize: 11, color: 'var(--text3)' }}>{m.email}</div>
                              </div>
                            </div>
                          </td>
                          <td style={{ color: 'var(--text2)' }}>{m.site}</td>
                          <td>
                            <span className={`rb ${ROLE_MAP[m.role] ?? 'rb-staff'}`}>{ROLE_LBL[m.role] ?? m.role}</span>
                          </td>
                          <td>
                            <span className={`sb sb-${m.status}`}>
                              <span className="sb-dot" />
                              {m.status.charAt(0).toUpperCase() + m.status.slice(1)}
                            </span>
                          </td>
                          <td style={{ color: 'var(--text3)' }}>{m.joined}</td>
                          <td>
                            <button type="button" className="btn btn-ghost btn-sm" onClick={() => showToast('Opening member…')}>
                              Edit
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
              {pendingCount === 0
                ? 'No members awaiting approval'
                : `${pendingCount} member${pendingCount === 1 ? '' : 's'} awaiting approval across all campsites`}
            </div>
            <div className="card">
              <div className="table-wrap">
                {pendingCount === 0 ? (
                  <div className="card-pad" style={{ color: 'var(--text2)', fontSize: 13 }}>
                    You&apos;re all caught up — new requests will appear here.
                  </div>
                ) : (
                  <table>
                    <thead>
                      <tr>
                        <th>Member</th>
                        <th>Campsite</th>
                        <th>Role Requested</th>
                        <th>Submitted</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendingList.map((p) => (
                        <tr key={p.email}>
                          <td>
                            <div className="td-name">
                              <div className="td-av">{p.initials}</div>
                              <div>
                                <div style={{ fontWeight: 500, color: 'var(--text)' }}>{p.name}</div>
                                <div style={{ fontSize: 11, color: 'var(--text3)' }}>{p.email}</div>
                              </div>
                            </div>
                          </td>
                          <td style={{ color: 'var(--text2)' }}>{p.site}</td>
                          <td style={{ color: 'var(--text2)' }}>{p.role}</td>
                          <td style={{ color: 'var(--text3)' }}>{p.time}</td>
                          <td style={{ display: 'flex', gap: 6, paddingTop: 11 }}>
                            <button type="button" className="btn btn-success btn-sm" onClick={() => approvePending(p.email)}>
                              Approve
                            </button>
                            <button type="button" className="btn btn-danger btn-sm" onClick={() => rejectPending(p.email)}>
                              Reject
                            </button>
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
                <div className="page-sub">Send to one site, a group, or the entire company</div>
              </div>
              <button type="button" className="btn btn-primary" onClick={() => setModal('broadcast')}>
                + New Broadcast
              </button>
            </div>
            <div className="card card-pad">
              <div className="alert alert-info" style={{ marginBottom: 18 }}>
                ℹ️ As a founder you can broadcast to all 348 members simultaneously, or target by campsite, department, or role.
              </div>
              <div className="section-title" style={{ marginBottom: 14 }}>
                Recent Broadcasts
              </div>
              {broadcasts.map((b, i) => (
                <div key={i} className="activity-item">
                  <div className="activity-icon">{b.icon}</div>
                  <div style={{ flex: 1 }}>
                    <div className="activity-text">
                      <strong>{b.title}</strong>
                    </div>
                    <div className="activity-time">
                      {b.by} · {b.sent} · {b.reach}
                    </div>
                  </div>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => showToast('Opening broadcast…')}>
                    View
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Rota */}
        <div className={`page${activePage === 'rota-hq' ? ' active' : ''}`}>
          <div className="page-inner">
            <div className="page-title">Rota Overview</div>
            <div className="page-sub">Upcoming shifts across all campsites — week of 24–28 Mar</div>
            <div className="card">
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Staff Member</th>
                      <th>Campsite</th>
                      <th>Date</th>
                      <th>Time</th>
                      <th>Role</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ROTA_GLOBAL.map((r, i) => (
                      <tr key={`${r.name}-${i}`}>
                        <td style={{ color: 'var(--text)' }}>{r.name}</td>
                        <td style={{ color: 'var(--text2)' }}>{r.site}</td>
                        <td style={{ color: 'var(--text2)' }}>{r.date}</td>
                        <td style={{ color: 'var(--text2)' }}>{r.time}</td>
                        <td style={{ color: 'var(--text3)' }}>{r.role}</td>
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
            <div className="page-sub">All events across all campsites — full admin trail</div>
            <div className="card card-pad">
              <div className="section-title" style={{ marginBottom: 14 }}>
                Platform Audit Trail
              </div>
              {[...activity, ...auditExtra].map((a, idx) => (
                <div key={idx} className="activity-item">
                  <div className="activity-icon">{a.icon}</div>
                  <div>
                    <div className="activity-text" dangerouslySetInnerHTML={{ __html: a.html }} />
                    <div className="activity-time">{a.time}</div>
                  </div>
                </div>
              ))}
            </div>
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
                      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>Discount QR Codes</div>
                      <div style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 2 }}>Enable member discount scanning</div>
                    </div>
                    <button type="button" className={`toggle${flagDiscount ? ' on' : ''}`} onClick={() => setFlagDiscount((v) => !v)} aria-label="Toggle discount QR" />
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
                <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 9, padding: 16, marginBottom: 14 }}>
                  <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--gold)', fontWeight: 600, marginBottom: 6 }}>Enterprise Plan</div>
                  <div style={{ fontFamily: 'var(--serif)', fontSize: 26, color: 'var(--accent)' }}>
                    £2,400<span style={{ fontSize: 14, color: 'var(--text3)' }}>/mo</span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 5 }}>12 sites · Unlimited members · Priority support</div>
                </div>
                <button type="button" className="btn btn-ghost btn-sm" style={{ width: '100%', justifyContent: 'center' }} onClick={() => showToast('Billing')}>
                  Manage billing →
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      </div>

      {/* Campsite modal */}
      <div
        className={`overlay${modal === 'campsite' ? ' open' : ''}`}
        id="modal-campsite"
        role="presentation"
        onClick={(e) => e.target === e.currentTarget && setModal(null)}
      >
        {currentCampsite && (
          <div className="modal modal-lg">
            <div className="modal-header">
              <div>
                <div className="modal-title">{currentCampsite.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text2)', marginTop: 2 }}>📍 {currentCampsite.location}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button type="button" className="btn btn-primary btn-sm" onClick={openCampsiteAdmin}>
                  Open Site Admin →
                </button>
                <button type="button" className="modal-close" onClick={() => setModal(null)}>
                  ✕
                </button>
              </div>
            </div>
            <div className="modal-body">
              <div className="detail-grid">
                <div className="detail-stat">
                  <div className="ds-val">{currentCampsite.members}</div>
                  <div className="ds-lbl">Members</div>
                </div>
                <div className="detail-stat">
                  <div className="ds-val">{currentCampsite.status === 'closed' ? '—' : currentCampsite.bookings}</div>
                  <div className="ds-lbl">Bookings (Month)</div>
                </div>
                <div className="detail-stat">
                  <div className="ds-val">{currentCampsite.status === 'closed' ? '—' : `£${(currentCampsite.revenue / 1000).toFixed(1)}k`}</div>
                  <div className="ds-lbl">Revenue (Month)</div>
                  <div className={`ds-trend${currentCampsite.status === 'closed' ? '' : ' up'}`}>↑ 14%&nbsp;&nbsp;vs last month</div>
                </div>
                <div className="detail-stat">
                  <div className="ds-val">{currentCampsite.status === 'closed' ? '—' : `${currentCampsite.occ}%`}</div>
                  <div className="ds-lbl">Occupancy</div>
                  <div className="ds-trend" style={{ color: 'var(--text3)' }}>
                    Manager: {currentCampsite.mgr}
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
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10.5, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Member</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10.5, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Role</th>
                      <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10.5, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {modalMembers.map((m) => (
                      <tr key={m.name} style={{ borderBottom: '1px solid var(--border)' }}>
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
                              {m.initials}
                            </div>
                            <span style={{ fontSize: 12.5, color: 'var(--text)' }}>{m.name}</span>
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
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ display: csTab === 'rota' ? 'block' : 'none' }}>
                <div className="alert alert-info">
                  📅 Rota for this site loads from Google Sheets integration.{' '}
                  <button type="button" className="fh-link" onClick={() => showToast('Opening Google Sheets…')}>
                    Open sheet →
                  </button>
                </div>
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
                    {modalRota.map((r, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td style={{ padding: '10px 12px', color: 'var(--text)' }}>{r.name}</td>
                        <td style={{ padding: '10px 12px', color: 'var(--text2)' }}>{r.date}</td>
                        <td style={{ padding: '10px 12px', color: 'var(--text2)' }}>{r.time}</td>
                        <td style={{ padding: '10px 12px', color: 'var(--text3)' }}>{r.role}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ display: csTab === 'broadcasts' ? 'block' : 'none' }}>
                {broadcasts.slice(0, 2).map((b, i) => (
                  <div key={i} className="activity-item">
                    <div className="activity-icon">{b.icon}</div>
                    <div>
                      <div className="activity-text">
                        <strong>{b.title}</strong>
                      </div>
                      <div className="activity-time">
                        {b.by} · {b.sent}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ display: csTab === 'settings' ? 'block' : 'none' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0', borderBottom: '1px solid var(--border)' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>Booking system active</div>
                      <div style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 2 }}>Accept live bookings on this site</div>
                    </div>
                    <button type="button" className={`toggle${siteBooking ? ' on' : ''}`} onClick={() => setSiteBooking((v) => !v)} aria-label="Toggle booking" />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0', borderBottom: '1px solid var(--border)' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>Member approval required</div>
                      <div style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 2 }}>Managers must approve new members</div>
                    </div>
                    <button type="button" className={`toggle${siteApproval ? ' on' : ''}`} onClick={() => setSiteApproval((v) => !v)} aria-label="Toggle approval" />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0' }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>Public listing</div>
                      <div style={{ fontSize: 11.5, color: 'var(--text3)', marginTop: 2 }}>Show on the Campsite directory</div>
                    </div>
                    <button type="button" className={`toggle${sitePublic ? ' on' : ''}`} onClick={() => setSitePublic((v) => !v)} aria-label="Toggle public listing" />
                  </div>
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
            <div className="modal-title">Add New Campsite</div>
            <button type="button" className="modal-close" onClick={() => setModal(null)}>
              ✕
            </button>
          </div>
          <div className="modal-body">
            <div className="field">
              <label>Site Name</label>
              <input
                type="text"
                placeholder="e.g. Heather Moor"
                value={newSite.name}
                onChange={(e) => setNewSite((s) => ({ ...s, name: e.target.value }))}
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="field">
                <label>County / Region</label>
                <input
                  type="text"
                  placeholder="e.g. North Yorkshire"
                  value={newSite.region}
                  onChange={(e) => setNewSite((s) => ({ ...s, region: e.target.value }))}
                />
              </div>
              <div className="field">
                <label>Country</label>
                <select value={newSite.country} onChange={(e) => setNewSite((s) => ({ ...s, country: e.target.value }))}>
                  <option>England</option>
                  <option>Scotland</option>
                  <option>Wales</option>
                  <option>Northern Ireland</option>
                </select>
              </div>
            </div>
            <div className="field">
              <label>Status</label>
              <select
                value={newSite.status}
                onChange={(e) => setNewSite((s) => ({ ...s, status: e.target.value as typeof newSite.status }))}
              >
                <option>Open</option>
                <option>Seasonal</option>
                <option>Closed</option>
              </select>
            </div>
            <div className="field">
              <label>Site Manager Email</label>
              <input
                type="email"
                placeholder="manager@example.com"
                value={newSite.managerEmail}
                onChange={(e) => setNewSite((s) => ({ ...s, managerEmail: e.target.value }))}
              />
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-ghost" onClick={() => setModal(null)}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" onClick={createNewSite}>
              Create Campsite
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
              <select
                value={broadcastDraft.audience}
                onChange={(e) => setBroadcastDraft((d) => ({ ...d, audience: e.target.value as 'all' | 'site' }))}
              >
                <option value="all">All members (company-wide)</option>
                <option value="site">Single campsite</option>
              </select>
            </div>
            {broadcastDraft.audience === 'site' && (
              <div className="field">
                <label>Campsite</label>
                <select
                  value={broadcastDraft.siteId}
                  onChange={(e) => setBroadcastDraft((d) => ({ ...d, siteId: Number(e.target.value) }))}
                >
                  {CAMPSITES.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="field">
              <label>Message</label>
              <textarea
                rows={4}
                placeholder="Write your message…"
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
