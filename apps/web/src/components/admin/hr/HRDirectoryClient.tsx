'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

export type HRDirectoryRow = {
  user_id: string;
  full_name: string;
  email: string | null;
  status: string;
  avatar_url: string | null;
  role: string;
  reports_to_user_id: string | null;
  reports_to_name: string | null;
  department_names: string[];
  hr_record_id: string | null;
  job_title: string | null;
  grade_level: string | null;
  contract_type: string | null;
  salary_band: string | null;
  fte: number | null;
  work_location: string | null;
  employment_start_date: string | null;
  probation_end_date: string | null;
  notice_period_weeks: number | null;
};

type DashStats = {
  headcount_total: number;
  missing_hr_records: number;
  onboarding_active: number;
  by_contract: { contract_type: string; count: number }[];
  by_location: { work_location: string; count: number }[];
  probation_ending_soon: { user_id: string; full_name: string; probation_end_date: string }[];
  review_cycles_active: { id: string; name: string; type: string; total: number; completed: number; manager_due: string | null }[];
  on_leave_today: { user_id: string; full_name: string; kind: string; end_date: string }[];
  bradford_alerts: { user_id: string; full_name: string; spell_count: number; total_days: number; bradford_score: number }[];
};

function contractLabel(ct: string | null) {
  switch (ct) {
    case 'full_time': return 'Full-time';
    case 'part_time': return 'Part-time';
    case 'contractor': return 'Contractor';
    case 'zero_hours': return 'Zero hours';
    default: return '—';
  }
}

function locationLabel(wl: string | null) {
  switch (wl) {
    case 'office': return 'Office';
    case 'remote': return 'Remote';
    case 'hybrid': return 'Hybrid';
    default: return '—';
  }
}

function initials(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? '').join('');
}

function StatCard({ label, value, sub, href, warn }: { label: string; value: string | number; sub?: string; href?: string; warn?: boolean }) {
  const inner = (
    <div className={['rounded-xl border p-4', warn ? 'border-[#fecaca] bg-[#fef2f2]' : 'border-[#d8d8d8] bg-white'].join(' ')}>
      <p className={['text-[11.5px] font-medium uppercase tracking-wide', warn ? 'text-[#b91c1c]' : 'text-[#9b9b9b]'].join(' ')}>{label}</p>
      <p className={['mt-1 text-[28px] font-bold leading-none', warn ? 'text-[#b91c1c]' : 'text-[#121212]'].join(' ')}>{value}</p>
      {sub ? <p className="mt-1 text-[11.5px] text-[#9b9b9b]">{sub}</p> : null}
    </div>
  );
  if (href) return <Link href={href} className="block hover:opacity-80 transition-opacity">{inner}</Link>;
  return inner;
}

export function HRDirectoryClient({
  orgId: _orgId,
  canManage: _canManage,
  initialRows,
  dashStats,
}: {
  orgId: string;
  canManage: boolean;
  initialRows: HRDirectoryRow[];
  dashStats: Record<string, unknown> | null;
}) {
  const stats = dashStats as DashStats | null;

  const [q, setQ] = useState('');
  const [filterContract, setFilterContract] = useState('');
  const [filterLocation, setFilterLocation] = useState('');
  const [filterHasRecord, setFilterHasRecord] = useState('');
  const [tab, setTab] = useState<'dashboard' | 'directory'>(stats ? 'dashboard' : 'directory');

  const filtered = useMemo(() => {
    const term = q.toLowerCase().trim();
    return initialRows.filter((r) => {
      if (term) {
        const haystack = [r.full_name, r.email, r.job_title, r.department_names.join(' ')].join(' ').toLowerCase();
        if (!haystack.includes(term)) return false;
      }
      if (filterContract && r.contract_type !== filterContract) return false;
      if (filterLocation && r.work_location !== filterLocation) return false;
      if (filterHasRecord === 'yes' && !r.hr_record_id) return false;
      if (filterHasRecord === 'no' && r.hr_record_id) return false;
      return true;
    });
  }, [initialRows, q, filterContract, filterLocation, filterHasRecord]);

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 sm:px-7">
      <div className="mb-6">
        <h1 className="font-authSerif text-[26px] leading-tight tracking-[-0.03em] text-[#121212]">Employee records</h1>
        <p className="mt-1 text-[13px] text-[#6b6b6b]">HR overview and employee directory.</p>
      </div>

      {/* Tabs */}
      <div className="mb-6 flex border-b border-[#ececec]">
        {stats ? (
          <button type="button" onClick={() => setTab('dashboard')} className={['px-4 py-2 text-[13px] font-medium border-b-2 -mb-px transition-colors', tab === 'dashboard' ? 'border-[#121212] text-[#121212]' : 'border-transparent text-[#9b9b9b] hover:text-[#4a4a4a]'].join(' ')}>
            Overview
          </button>
        ) : null}
        <button type="button" onClick={() => setTab('directory')} className={['px-4 py-2 text-[13px] font-medium border-b-2 -mb-px transition-colors', tab === 'directory' ? 'border-[#121212] text-[#121212]' : 'border-transparent text-[#9b9b9b] hover:text-[#4a4a4a]'].join(' ')}>
          Directory ({initialRows.length})
        </button>
      </div>

      {/* ── DASHBOARD TAB ── */}
      {tab === 'dashboard' && stats ? (
        <div className="space-y-8">
          {/* Headline stats */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard label="Active headcount" value={stats.headcount_total} />
            <StatCard
              label="Missing HR records"
              value={stats.missing_hr_records}
              warn={stats.missing_hr_records > 0}
              sub={stats.missing_hr_records > 0 ? 'No record on file' : 'All employees covered'}
            />
            <StatCard
              label="Active onboardings"
              value={stats.onboarding_active}
              href="/hr/onboarding"
            />
            <StatCard
              label="Probation ending soon"
              value={stats.probation_ending_soon.length}
              warn={stats.probation_ending_soon.length > 0}
              sub="Next 60 days"
            />
          </div>

          {/* Two-column middle row */}
          <div className="grid gap-6 sm:grid-cols-2">
            {/* Breakdown by contract */}
            <div className="rounded-xl border border-[#d8d8d8] bg-white p-5">
              <h2 className="text-[13px] font-semibold text-[#121212]">Contract types</h2>
              {stats.by_contract.length === 0 ? (
                <p className="mt-3 text-[12px] text-[#9b9b9b]">No HR records yet.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {stats.by_contract.map((c) => {
                    const pct = stats.headcount_total > 0 ? Math.round((c.count / stats.headcount_total) * 100) : 0;
                    return (
                      <li key={c.contract_type}>
                        <div className="flex items-center justify-between text-[12.5px]">
                          <span className="text-[#4a4a4a]">{contractLabel(c.contract_type)}</span>
                          <span className="font-medium text-[#121212]">{c.count} <span className="font-normal text-[#9b9b9b]">({pct}%)</span></span>
                        </div>
                        <div className="mt-1 h-1 w-full rounded-full bg-[#ececec]">
                          <div className="h-1 rounded-full bg-[#121212]" style={{ width: `${pct}%` }} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Breakdown by location */}
            <div className="rounded-xl border border-[#d8d8d8] bg-white p-5">
              <h2 className="text-[13px] font-semibold text-[#121212]">Work locations</h2>
              {stats.by_location.length === 0 ? (
                <p className="mt-3 text-[12px] text-[#9b9b9b]">No HR records yet.</p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {stats.by_location.map((l) => {
                    const pct = stats.headcount_total > 0 ? Math.round((l.count / stats.headcount_total) * 100) : 0;
                    return (
                      <li key={l.work_location}>
                        <div className="flex items-center justify-between text-[12.5px]">
                          <span className="text-[#4a4a4a]">{locationLabel(l.work_location)}</span>
                          <span className="font-medium text-[#121212]">{l.count} <span className="font-normal text-[#9b9b9b]">({pct}%)</span></span>
                        </div>
                        <div className="mt-1 h-1 w-full rounded-full bg-[#ececec]">
                          <div className="h-1 rounded-full bg-[#4a4a4a]" style={{ width: `${pct}%` }} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>

          {/* Active review cycles */}
          {stats.review_cycles_active.length > 0 ? (
            <div className="rounded-xl border border-[#d8d8d8] bg-white p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-[13px] font-semibold text-[#121212]">Active review cycles</h2>
                <Link href="/hr/performance" className="text-[12px] text-[#6b6b6b] underline underline-offset-2 hover:text-[#121212]">View all</Link>
              </div>
              <ul className="mt-3 space-y-3">
                {stats.review_cycles_active.map((c) => {
                  const pct = c.total > 0 ? Math.round((c.completed / c.total) * 100) : 0;
                  return (
                    <li key={c.id}>
                      <div className="flex items-center justify-between text-[12.5px]">
                        <Link href={`/hr/performance/${c.id}`} className="font-medium text-[#121212] hover:underline">{c.name}</Link>
                        <span className="text-[#9b9b9b]">{c.completed}/{c.total} done</span>
                      </div>
                      <div className="mt-1 h-1.5 w-full rounded-full bg-[#ececec]">
                        <div className="h-1.5 rounded-full bg-[#121212] transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      {c.manager_due ? <p className="mt-0.5 text-[11px] text-[#9b9b9b]">Manager assessment due {c.manager_due}</p> : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}

          {/* Bottom row: probation + leave + bradford */}
          <div className="grid gap-6 sm:grid-cols-3">
            {/* Probation ending soon */}
            <div className="rounded-xl border border-[#d8d8d8] bg-white p-5">
              <h2 className="text-[13px] font-semibold text-[#121212]">Probation ending (60 days)</h2>
              {stats.probation_ending_soon.length === 0 ? (
                <p className="mt-3 text-[12px] text-[#9b9b9b]">None due.</p>
              ) : (
                <ul className="mt-3 divide-y divide-[#ececec]">
                  {stats.probation_ending_soon.map((p) => (
                    <li key={p.user_id} className="py-2">
                      <Link href={`/hr/records/${p.user_id}`} className="text-[12.5px] font-medium text-[#121212] hover:underline">{p.full_name}</Link>
                      <p className="text-[11.5px] text-[#c2410c]">{p.probation_end_date}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* On leave today */}
            <div className="rounded-xl border border-[#d8d8d8] bg-white p-5">
              <h2 className="text-[13px] font-semibold text-[#121212]">On leave today</h2>
              {stats.on_leave_today.length === 0 ? (
                <p className="mt-3 text-[12px] text-[#9b9b9b]">Nobody on leave today.</p>
              ) : (
                <ul className="mt-3 divide-y divide-[#ececec]">
                  {stats.on_leave_today.map((l) => (
                    <li key={l.user_id} className="py-2">
                      <p className="text-[12.5px] font-medium text-[#121212]">{l.full_name}</p>
                      <p className="text-[11.5px] text-[#9b9b9b]">
                        {l.kind === 'annual' ? 'Annual leave' : 'TOIL'} · back {l.end_date}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Bradford alerts */}
            <div className="rounded-xl border border-[#d8d8d8] bg-white p-5">
              <h2 className="text-[13px] font-semibold text-[#121212]">Sickness score alerts <span className="text-[11px] font-normal text-[#9b9b9b]">(≥200)</span></h2>
              {stats.bradford_alerts.length === 0 ? (
                <p className="mt-3 text-[12px] text-[#9b9b9b]">No alerts.</p>
              ) : (
                <ul className="mt-3 divide-y divide-[#ececec]">
                  {stats.bradford_alerts.map((b) => (
                    <li key={b.user_id} className="py-2">
                      <div className="flex items-center justify-between">
                        <Link href={`/hr/records/${b.user_id}`} className="text-[12.5px] font-medium text-[#121212] hover:underline">{b.full_name}</Link>
                        <span className="text-[12px] font-bold text-[#b91c1c]">{b.bradford_score}</span>
                      </div>
                      <p className="text-[11px] text-[#9b9b9b]">{b.spell_count} spell{b.spell_count === 1 ? '' : 's'} · {b.total_days} day{b.total_days === 1 ? '' : 's'}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {/* ── DIRECTORY TAB ── */}
      {tab === 'directory' ? (
        <>
          {/* Filters */}
          <div className="mb-5 flex flex-wrap gap-3">
            <input
              type="search"
              placeholder="Search name, email, role…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="h-9 w-64 rounded-lg border border-[#d8d8d8] bg-white px-3 text-[13px] outline-none focus:border-[#121212]"
            />
            <select value={filterContract} onChange={(e) => setFilterContract(e.target.value)} className="h-9 rounded-lg border border-[#d8d8d8] bg-white px-3 text-[13px] text-[#6b6b6b] outline-none focus:border-[#121212]">
              <option value="">All contracts</option>
              <option value="full_time">Full-time</option>
              <option value="part_time">Part-time</option>
              <option value="contractor">Contractor</option>
              <option value="zero_hours">Zero hours</option>
            </select>
            <select value={filterLocation} onChange={(e) => setFilterLocation(e.target.value)} className="h-9 rounded-lg border border-[#d8d8d8] bg-white px-3 text-[13px] text-[#6b6b6b] outline-none focus:border-[#121212]">
              <option value="">All locations</option>
              <option value="office">Office</option>
              <option value="remote">Remote</option>
              <option value="hybrid">Hybrid</option>
            </select>
            <select value={filterHasRecord} onChange={(e) => setFilterHasRecord(e.target.value)} className="h-9 rounded-lg border border-[#d8d8d8] bg-white px-3 text-[13px] text-[#6b6b6b] outline-none focus:border-[#121212]">
              <option value="">All members</option>
              <option value="yes">Has HR record</option>
              <option value="no">Missing HR record</option>
            </select>
            <span className="ml-auto flex items-center text-[12px] text-[#9b9b9b]">{filtered.length} of {initialRows.length}</span>
          </div>

          <div className="overflow-x-auto rounded-xl border border-[#d8d8d8] bg-white">
            <table className="w-full min-w-[820px] text-[13px]">
              <thead>
                <tr className="border-b border-[#ececec] text-left text-[11.5px] font-semibold uppercase tracking-wide text-[#9b9b9b]">
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Job title</th>
                  <th className="px-4 py-3">Contract</th>
                  <th className="px-4 py-3">Location</th>
                  <th className="px-4 py-3">Start date</th>
                  <th className="px-4 py-3">Probation ends</th>
                  <th className="px-4 py-3">Departments</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[#ececec]">
                {filtered.length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-[#9b9b9b]">No members match.</td></tr>
                ) : null}
                {filtered.map((r) => {
                  const onProbation = r.probation_end_date && r.probation_end_date >= today;
                  return (
                    <tr key={r.user_id} className="group hover:bg-[#faf9f6]">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          {r.avatar_url ? (
                            <img src={r.avatar_url} alt="" className="h-7 w-7 shrink-0 rounded-full object-cover" />
                          ) : (
                            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#e8e4dc] text-[10px] font-bold text-[#6b6b6b]">{initials(r.full_name)}</div>
                          )}
                          <div>
                            <div className="font-medium text-[#121212]">{r.full_name}</div>
                            {r.email ? <div className="text-[11.5px] text-[#9b9b9b]">{r.email}</div> : null}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[#4a4a4a]">
                        {r.job_title || <span className="text-[#c8c8c8]">—</span>}
                        {r.grade_level ? <span className="ml-1 text-[11px] text-[#9b9b9b]">({r.grade_level})</span> : null}
                      </td>
                      <td className="px-4 py-3">
                        {r.contract_type ? (
                          <span className="rounded-full bg-[#f5f4f1] px-2 py-0.5 text-[11px] font-medium text-[#4a4a4a]">
                            {contractLabel(r.contract_type)}{r.fte && r.fte < 1 ? ` ${Math.round(r.fte * 100)}%` : ''}
                          </span>
                        ) : <span className="text-[#c8c8c8]">—</span>}
                      </td>
                      <td className="px-4 py-3 text-[#4a4a4a]">{r.work_location ? locationLabel(r.work_location) : <span className="text-[#c8c8c8]">—</span>}</td>
                      <td className="px-4 py-3 text-[#4a4a4a]">{r.employment_start_date ?? <span className="text-[#c8c8c8]">—</span>}</td>
                      <td className="px-4 py-3">
                        {r.probation_end_date ? (
                          <span className={['text-[12px]', onProbation ? 'font-medium text-[#c2410c]' : 'text-[#6b6b6b]'].join(' ')}>
                            {r.probation_end_date}{onProbation ? ' ●' : ''}
                          </span>
                        ) : <span className="text-[#c8c8c8]">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {r.department_names.slice(0, 3).map((d) => (
                            <span key={d} className="rounded-full bg-[#f0ede8] px-2 py-0.5 text-[11px] text-[#6b6b6b]">{d}</span>
                          ))}
                          {r.department_names.length > 3 ? <span className="text-[11px] text-[#9b9b9b]">+{r.department_names.length - 3}</span> : null}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link href={`/hr/records/${r.user_id}`} className="text-[12px] font-medium text-[#121212] underline underline-offset-2 opacity-0 group-hover:opacity-100">
                          Open file →
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {initialRows.some((r) => !r.hr_record_id) ? (
            <p className="mt-4 text-[12px] text-[#9b9b9b]">
              {initialRows.filter((r) => !r.hr_record_id).length} member{initialRows.filter((r) => !r.hr_record_id).length === 1 ? '' : 's'} without an HR record — open their file to create one.
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
