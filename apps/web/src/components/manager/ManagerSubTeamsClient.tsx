'use client';

import Link from 'next/link';
import { useMemo } from 'react';

type Dept = { id: string; name: string; type: string; is_archived: boolean };

function typeLabel(t: string) {
  if (t === 'society') return 'Society';
  if (t === 'club') return 'Club';
  return 'Department';
}

export function ManagerSubTeamsClient({
  departments,
  teamsByDept,
}: {
  departments: Dept[];
  teamsByDept: Record<string, { id: string; name: string }[]>;
}) {
  const sorted = useMemo(
    () => [...departments].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })),
    [departments]
  );

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-authSerif text-[26px] leading-tight tracking-[-0.03em] text-[#121212]">Sub-teams</h1>
        <p className="mt-1 text-[13px] text-[#6b6b6b]">
          Sub-teams let org admins target broadcasts to part of a department. This page lists teams for departments you
          manage so you know what exists when you compose a broadcast.
        </p>
        <p className="mt-2 rounded-lg border border-[#eceae6] bg-[#faf9f6] px-3 py-2 text-[12px] leading-snug text-[#6b6b6b]">
          Only an <span className="font-medium text-[#121212]">org admin</span> can create sub-teams and assign people to
          them. Use{' '}
          <Link href="/manager/departments" className="font-medium text-[#121212] underline underline-offset-2">
            Departments
          </Link>{' '}
          to add or remove members in your departments.
        </p>
      </div>

      {sorted.length === 0 ? (
        <div className="rounded-xl border border-[#d8d8d8] bg-white px-6 py-14 text-center text-[#6b6b6b]">
          <p className="text-[15px] font-medium">No departments assigned</p>
          <p className="mt-1 text-[13px] text-[#9b9b9b]">Ask an org admin to add you as a manager on a department.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {sorted.map((d) => {
            const teams = teamsByDept[d.id] ?? [];
            return (
              <li key={d.id} className="rounded-xl border border-[#d8d8d8] bg-white p-4 sm:p-5">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-medium text-[#121212]">{d.name}</p>
                    <p className="text-[12px] text-[#9b9b9b]">
                      {typeLabel(d.type)}
                      {d.is_archived ? ' · Archived' : ''}
                    </p>
                  </div>
                  <Link
                    href={`/manager/departments?dept=${encodeURIComponent(d.id)}`}
                    className="shrink-0 text-[12px] font-medium text-[#6b6b6b] underline underline-offset-2 hover:text-[#121212]"
                  >
                    Open department…
                  </Link>
                </div>
                {teams.length === 0 ? (
                  <p className="mt-3 text-[13px] text-[#9b9b9b]">No sub-teams for this department yet.</p>
                ) : (
                  <ul className="mt-3 flex flex-wrap gap-2 border-t border-[#eceae6] pt-3">
                    {teams.map((t) => (
                      <li
                        key={t.id}
                        className="rounded-full border border-[#d8d8d8] bg-[#f5f4f1] px-3 py-1 text-[12px] text-[#121212]"
                      >
                        {t.name}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
