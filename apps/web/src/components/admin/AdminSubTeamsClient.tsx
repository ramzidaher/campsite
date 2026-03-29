'use client';

import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

type Dept = { id: string; name: string; type: string; is_archived: boolean };

function typeLabel(t: string) {
  if (t === 'society') return 'Society';
  if (t === 'club') return 'Club';
  return 'Department';
}

export function AdminSubTeamsClient({
  initialDepartments,
  initialTeamsByDept,
}: {
  initialDepartments: Dept[];
  initialTeamsByDept: Record<string, { id: string; name: string }[]>;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [busyDeptId, setBusyDeptId] = useState<string | null>(null);
  const [draftByDept, setDraftByDept] = useState<Record<string, string>>({});

  const sortedDepts = useMemo(
    () =>
      [...initialDepartments].sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
      ),
    [initialDepartments]
  );

  async function addTeam(deptId: string) {
    const name = (draftByDept[deptId] ?? '').trim();
    if (!name) return;
    setMsg(null);
    setBusyDeptId(deptId);
    const { error } = await supabase.from('dept_teams').insert({ dept_id: deptId, name });
    setBusyDeptId(null);
    if (error) {
      setMsg(error.message);
      return;
    }
    setDraftByDept((d) => ({ ...d, [deptId]: '' }));
    router.refresh();
  }

  async function removeTeam(teamId: string) {
    setMsg(null);
    setBusyDeptId(teamId);
    const { error } = await supabase.from('dept_teams').delete().eq('id', teamId);
    setBusyDeptId(null);
    if (error) setMsg(error.message);
    else router.refresh();
  }

  return (
    <div className="mx-auto max-w-6xl px-5 py-7 sm:px-7">
      <div className="mb-6">
        <h1 className="font-authSerif text-[26px] leading-tight tracking-[-0.03em] text-[#121212]">Sub-teams</h1>
        <p className="mt-1 text-[13px] text-[#6b6b6b]">
          Groups inside a department for targeted broadcasts. Create teams here, then assign members in each row or open
          the full department panel.
        </p>
        <p className="mt-2 text-[12px] text-[#9b9b9b]">
          <Link href="/admin/departments" className="font-medium text-[#6b6b6b] underline underline-offset-2 hover:text-[#121212]">
            Departments
          </Link>{' '}
          — channels, managers, and member ↔ sub-team assignment on the Members list.
        </p>
      </div>

      {msg ? <p className="mb-4 text-sm text-[#b91c1c]">{msg}</p> : null}

      {sortedDepts.length === 0 ? (
        <div className="rounded-xl border border-[#d8d8d8] bg-white px-6 py-14 text-center text-[#6b6b6b]">
          <p className="text-[15px] font-medium">No departments yet</p>
          <p className="mt-1 text-[13px] text-[#9b9b9b]">
            Add a department first, then return here to create sub-teams.
          </p>
          <Link
            href="/admin/departments"
            className="mt-4 inline-block text-[13px] font-medium text-[#121212] underline underline-offset-2"
          >
            Go to Departments
          </Link>
        </div>
      ) : (
        <ul className="space-y-4">
          {sortedDepts.map((d) => {
            const teams = initialTeamsByDept[d.id] ?? [];
            const draft = draftByDept[d.id] ?? '';
            const busy = busyDeptId === d.id;
            return (
              <li
                key={d.id}
                className="rounded-xl border border-[#d8d8d8] bg-white p-4 sm:p-5"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-medium text-[#121212]">{d.name}</p>
                    <p className="text-[12px] text-[#9b9b9b]">
                      {typeLabel(d.type)}
                      {d.is_archived ? ' · Archived' : ''}
                    </p>
                  </div>
                  <Link
                    href={`/admin/departments?dept=${encodeURIComponent(d.id)}`}
                    className="shrink-0 text-[12px] font-medium text-[#6b6b6b] underline underline-offset-2 hover:text-[#121212]"
                  >
                    Open department…
                  </Link>
                </div>

                {teams.length === 0 ? (
                  <p className="mt-3 text-[13px] text-[#9b9b9b]">No sub-teams yet.</p>
                ) : (
                  <ul className="mt-3 space-y-1.5 border-t border-[#eceae6] pt-3 text-[13px]">
                    {teams.map((t) => (
                      <li key={t.id} className="flex items-center justify-between gap-2">
                        <span className="text-[#121212]">{t.name}</span>
                        <button
                          type="button"
                          disabled={busyDeptId === t.id}
                          className="text-[12px] text-[#b91c1c] hover:underline disabled:opacity-50"
                          onClick={() => void removeTeam(t.id)}
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                )}

                <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                  <input
                    className="min-w-0 flex-1 rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2 text-[13px] outline-none focus:border-[#121212]"
                    placeholder="New sub-team name"
                    value={draft}
                    disabled={busy}
                    onChange={(e) => setDraftByDept((prev) => ({ ...prev, [d.id]: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        void addTeam(d.id);
                      }
                    }}
                  />
                  <button
                    type="button"
                    disabled={busy || !draft.trim()}
                    className="shrink-0 rounded-lg bg-[#121212] px-4 py-2 text-[13px] font-medium text-[#faf9f6] disabled:opacity-50"
                    onClick={() => void addTeam(d.id)}
                  >
                    Add sub-team
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
