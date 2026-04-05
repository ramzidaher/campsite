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
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');
}

export function HRDirectoryClient({
  orgId: _orgId,
  canManage: _canManage,
  initialRows,
}: {
  orgId: string;
  canManage: boolean;
  initialRows: HRDirectoryRow[];
}) {
  const [q, setQ] = useState('');
  const [filterContract, setFilterContract] = useState('');
  const [filterLocation, setFilterLocation] = useState('');
  const [filterHasRecord, setFilterHasRecord] = useState('');

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
        <h1 className="font-authSerif text-[26px] leading-tight tracking-[-0.03em] text-[#121212]">
          Employee records
        </h1>
        <p className="mt-1 text-[13px] text-[#6b6b6b]">
          HR file for every active member — contract type, job title, employment dates, and more.
        </p>
      </div>

      {/* Filters */}
      <div className="mb-5 flex flex-wrap gap-3">
        <input
          type="search"
          placeholder="Search name, email, role…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="h-9 w-64 rounded-lg border border-[#d8d8d8] bg-white px-3 text-[13px] outline-none focus:border-[#121212]"
        />
        <select
          value={filterContract}
          onChange={(e) => setFilterContract(e.target.value)}
          className="h-9 rounded-lg border border-[#d8d8d8] bg-white px-3 text-[13px] text-[#6b6b6b] outline-none focus:border-[#121212]"
        >
          <option value="">All contracts</option>
          <option value="full_time">Full-time</option>
          <option value="part_time">Part-time</option>
          <option value="contractor">Contractor</option>
          <option value="zero_hours">Zero hours</option>
        </select>
        <select
          value={filterLocation}
          onChange={(e) => setFilterLocation(e.target.value)}
          className="h-9 rounded-lg border border-[#d8d8d8] bg-white px-3 text-[13px] text-[#6b6b6b] outline-none focus:border-[#121212]"
        >
          <option value="">All locations</option>
          <option value="office">Office</option>
          <option value="remote">Remote</option>
          <option value="hybrid">Hybrid</option>
        </select>
        <select
          value={filterHasRecord}
          onChange={(e) => setFilterHasRecord(e.target.value)}
          className="h-9 rounded-lg border border-[#d8d8d8] bg-white px-3 text-[13px] text-[#6b6b6b] outline-none focus:border-[#121212]"
        >
          <option value="">All members</option>
          <option value="yes">Has HR record</option>
          <option value="no">Missing HR record</option>
        </select>
        <span className="ml-auto flex items-center text-[12px] text-[#9b9b9b]">
          {filtered.length} of {initialRows.length} members
        </span>
      </div>

      {/* Table */}
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
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-[#9b9b9b]">
                  No members match the current filters.
                </td>
              </tr>
            ) : null}
            {filtered.map((r) => {
              const onProbation =
                r.probation_end_date && r.probation_end_date >= today;
              return (
                <tr key={r.user_id} className="group hover:bg-[#faf9f6]">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      {r.avatar_url ? (
                        <img
                          src={r.avatar_url}
                          alt=""
                          className="h-7 w-7 shrink-0 rounded-full object-cover"
                        />
                      ) : (
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#e8e4dc] text-[10px] font-bold text-[#6b6b6b]">
                          {initials(r.full_name)}
                        </div>
                      )}
                      <div>
                        <div className="font-medium text-[#121212]">{r.full_name}</div>
                        {r.email ? <div className="text-[11.5px] text-[#9b9b9b]">{r.email}</div> : null}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-[#4a4a4a]">
                    {r.job_title || <span className="text-[#c8c8c8]">—</span>}
                    {r.grade_level ? (
                      <span className="ml-1 text-[11px] text-[#9b9b9b]">({r.grade_level})</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    {r.contract_type ? (
                      <span className="rounded-full bg-[#f5f4f1] px-2 py-0.5 text-[11px] font-medium text-[#4a4a4a]">
                        {contractLabel(r.contract_type)}
                        {r.fte && r.fte < 1 ? ` ${Math.round(r.fte * 100)}%` : ''}
                      </span>
                    ) : (
                      <span className="text-[#c8c8c8]">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-[#4a4a4a]">
                    {r.work_location ? locationLabel(r.work_location) : <span className="text-[#c8c8c8]">—</span>}
                  </td>
                  <td className="px-4 py-3 text-[#4a4a4a]">
                    {r.employment_start_date ?? <span className="text-[#c8c8c8]">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    {r.probation_end_date ? (
                      <span
                        className={[
                          'text-[12px]',
                          onProbation ? 'font-medium text-[#c2410c]' : 'text-[#6b6b6b]',
                        ].join(' ')}
                      >
                        {r.probation_end_date}
                        {onProbation ? ' ●' : ''}
                      </span>
                    ) : (
                      <span className="text-[#c8c8c8]">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {r.department_names.slice(0, 3).map((d) => (
                        <span
                          key={d}
                          className="rounded-full bg-[#f0ede8] px-2 py-0.5 text-[11px] text-[#6b6b6b]"
                        >
                          {d}
                        </span>
                      ))}
                      {r.department_names.length > 3 ? (
                        <span className="text-[11px] text-[#9b9b9b]">
                          +{r.department_names.length - 3}
                        </span>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/admin/hr/${r.user_id}`}
                      className="text-[12px] font-medium text-[#121212] underline underline-offset-2 opacity-0 group-hover:opacity-100"
                    >
                      Open file →
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Missing records callout */}
      {initialRows.some((r) => !r.hr_record_id) ? (
        <p className="mt-4 text-[12px] text-[#9b9b9b]">
          {initialRows.filter((r) => !r.hr_record_id).length} member
          {initialRows.filter((r) => !r.hr_record_id).length === 1 ? '' : 's'} without an HR record — open their file
          to create one.
        </p>
      ) : null}
    </div>
  );
}
