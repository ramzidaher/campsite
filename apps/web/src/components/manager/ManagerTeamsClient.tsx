'use client';

import { FormSelect } from '@campsite/ui/web';
import type { DeptMemberRow } from '@/lib/departments/loadDepartmentsDirectory';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

type Dept = { id: string; name: string; type: string; is_archived: boolean };
type TeamRow = { id: string; name: string; lead_user_id: string | null };

function typeLabel(t: string) {
  if (t === 'society') return 'Society';
  if (t === 'club') return 'Club';
  return 'Department';
}

export function ManagerTeamsClient({
  currentUserId,
  departments,
  teamsByDept,
  teamMembersByTeamId,
  staffOptions,
}: {
  currentUserId: string;
  departments: Dept[];
  teamsByDept: Record<string, TeamRow[]>;
  teamMembersByTeamId: Record<string, DeptMemberRow[]>;
  staffOptions: { id: string; full_name: string; role: string }[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [draftByDept, setDraftByDept] = useState<Record<string, string>>({});
  const [newOwnerByDept, setNewOwnerByDept] = useState<Record<string, string>>({});
  const [pickByTeam, setPickByTeam] = useState<Record<string, string>>({});
  const [teamNameDrafts, setTeamNameDrafts] = useState<Record<string, string>>({});

  const sorted = useMemo(
    () => [...departments].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })),
    [departments]
  );

  const allTeams = useMemo(() => {
    const list: TeamRow[] = [];
    Object.values(teamsByDept).forEach((arr) => list.push(...arr));
    return list;
  }, [teamsByDept]);

  useEffect(() => {
    const next: Record<string, string> = {};
    allTeams.forEach((t) => {
      next[t.id] = t.name;
    });
    setTeamNameDrafts(next);
  }, [allTeams]);

  async function addTeam(deptId: string) {
    const name = (draftByDept[deptId] ?? '').trim();
    if (!name) return;
    const lead = (newOwnerByDept[deptId] ?? '').trim() || null;
    setMsg(null);
    setBusyKey(`dept:${deptId}`);
    const row: { dept_id: string; name: string; lead_user_id?: string } = { dept_id: deptId, name };
    if (lead) row.lead_user_id = lead;
    const { error } = await supabase.from('department_teams').insert(row);
    setBusyKey(null);
    if (error) {
      setMsg(error.message);
      return;
    }
    setDraftByDept((d) => ({ ...d, [deptId]: '' }));
    setNewOwnerByDept((d) => ({ ...d, [deptId]: '' }));
    router.refresh();
  }

  async function updateTeam(teamId: string, patch: { name?: string; lead_user_id?: string | null }) {
    setMsg(null);
    setBusyKey(`upd:${teamId}`);
    const { error } = await supabase.from('department_teams').update(patch).eq('id', teamId);
    setBusyKey(null);
    if (error) setMsg(error.message);
    else router.refresh();
  }

  async function addTeamMember(teamId: string, userId: string) {
    setMsg(null);
    setBusyKey(`add:${teamId}:${userId}`);
    const { error } = await supabase.from('department_team_members').insert({ user_id: userId, team_id: teamId });
    setBusyKey(null);
    if (error) setMsg(error.message);
    else {
      setPickByTeam((p) => ({ ...p, [teamId]: '' }));
      router.refresh();
    }
  }

  async function removeTeamMember(teamId: string, userId: string) {
    setMsg(null);
    setBusyKey(`rm:${teamId}:${userId}`);
    const { error } = await supabase
      .from('department_team_members')
      .delete()
      .eq('team_id', teamId)
      .eq('user_id', userId);
    setBusyKey(null);
    if (error) setMsg(error.message);
    else router.refresh();
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-authSerif text-[26px] leading-tight tracking-[-0.03em] text-[#121212]">Teams</h1>
        <p className="mt-1 text-[13px] text-[#6b6b6b]">
          Create teams, set <span className="font-medium text-[#121212]">team owners</span>, and manage rosters for your
          departments. Owners can rename the team and edit their roster. Only org admins can delete a team.
        </p>
        <p className="mt-2 rounded-lg border border-[#eceae6] bg-[#faf9f6] px-3 py-2 text-[12px] leading-snug text-[#6b6b6b]">
          You can broadcast to any team in these departments without being on the team. Team owners who are{' '}
          <em>not</em> department members must pick their own team when sending.
        </p>
        <p className="mt-2 text-[12px] text-[#9b9b9b]">
          <Link href="/manager/departments" className="font-medium text-[#6b6b6b] underline underline-offset-2 hover:text-[#121212]">
            Departments
          </Link>{' '}
           department membership (rota and channels) is separate from teams.
        </p>
      </div>

      {msg ? <p className="mb-4 text-sm text-[#b91c1c]">{msg}</p> : null}

      {sorted.length === 0 ? (
        <div className="rounded-xl border border-[#d8d8d8] bg-white px-6 py-14 text-center text-[#6b6b6b]">
          <p className="text-[15px] font-medium">No departments assigned</p>
          <p className="mt-1 text-[13px] text-[#9b9b9b]">
            Ask an org admin to assign you as a department manager or add you to a department as a coordinator.
          </p>
        </div>
      ) : (
        <ul className="space-y-4">
          {sorted.map((d) => {
            const teams = teamsByDept[d.id] ?? [];
            const draft = draftByDept[d.id] ?? '';
            const busyDept = busyKey === `dept:${d.id}`;
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
                    Open department...
                  </Link>
                </div>
                {teams.length === 0 ? (
                  <p className="mt-3 text-[13px] text-[#9b9b9b]">No teams in this department yet.</p>
                ) : (
                  <ul className="mt-3 space-y-3 border-t border-[#eceae6] pt-3">
                    {teams.map((t) => {
                      const roster = teamMembersByTeamId[t.id] ?? [];
                      const rosterIds = new Set(roster.map((r) => r.user_id));
                      const pick = pickByTeam[t.id] ?? '';
                      const nm = teamNameDrafts[t.id] ?? t.name;
                      const youOwn = t.lead_user_id === currentUserId;
                      return (
                        <li
                          key={t.id}
                          className="rounded-lg border border-[#eceae6] bg-[#faf9f6] p-3 text-[13px]"
                        >
                          <div className="space-y-2">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                              <input
                                className="min-w-0 flex-1 rounded-lg border border-[#d8d8d8] bg-white px-2 py-1.5 text-[13px] font-medium text-[#121212]"
                                value={nm}
                                onChange={(e) =>
                                  setTeamNameDrafts((prev) => ({ ...prev, [t.id]: e.target.value }))
                                }
                                aria-label={`Team name ${t.name}`}
                              />
                              <button
                                type="button"
                                className="shrink-0 rounded-lg border border-[#d8d8d8] bg-white px-3 py-1.5 text-[12px] font-medium text-[#6b6b6b] hover:bg-[#f5f4f1]"
                                onClick={() => {
                                  const n = (teamNameDrafts[t.id] ?? t.name).trim();
                                  if (n && n !== t.name) void updateTeam(t.id, { name: n });
                                }}
                              >
                                Save name
                              </button>
                            </div>
                            <label className="flex flex-col gap-1 text-[12px] text-[#6b6b6b] sm:flex-row sm:items-center">
                              <span className="shrink-0 font-medium text-[#121212]">Owner</span>
                              <FormSelect
                                className="max-w-full rounded-lg border border-[#d8d8d8] bg-white px-2 py-1 text-[12px] sm:max-w-md"
                                value={t.lead_user_id ?? ''}
                                onChange={(e) =>
                                  void updateTeam(t.id, {
                                    lead_user_id: e.target.value ? e.target.value : null,
                                  })
                                }
                              >
                                <option value="">No owner</option>
                                {staffOptions.map((s) => (
                                  <option key={s.id} value={s.id}>
                                    {s.full_name} ({s.role})
                                  </option>
                                ))}
                              </FormSelect>
                            </label>
                            {youOwn ? (
                              <p className="text-[11px] text-[#9b9b9b]">You are the owner of this team.</p>
                            ) : null}
                          </div>
                          <ul className="mt-2 space-y-1 text-[12px]">
                            {roster.length === 0 ? (
                              <li className="text-[#9b9b9b]">Nobody on this team yet.</li>
                            ) : (
                              roster.map((m) => (
                                <li key={m.user_id} className="flex flex-wrap items-center justify-between gap-2">
                                  <span>
                                    <span className="font-medium text-[#121212]">{m.full_name}</span>
                                    <span className="ml-2 text-[11px] text-[#9b9b9b]">{m.role}</span>
                                  </span>
                                  <button
                                    type="button"
                                    disabled={busyKey === `rm:${t.id}:${m.user_id}`}
                                    className="text-[12px] text-[#b91c1c] hover:underline disabled:opacity-50"
                                    onClick={() => void removeTeamMember(t.id, m.user_id)}
                                  >
                                    Remove
                                  </button>
                                </li>
                              ))
                            )}
                          </ul>
                          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                            <FormSelect
                              className="min-w-0 flex-1 rounded-lg border border-[#d8d8d8] bg-white px-2 py-1.5 text-[12px]"
                              value={pick}
                              disabled={Boolean(busyKey?.startsWith(`add:${t.id}:`))}
                              onChange={(e) => setPickByTeam((p) => ({ ...p, [t.id]: e.target.value }))}
                              aria-label={`Add person to ${t.name}`}
                            >
                              <option value="">Add someone to this team...</option>
                              {staffOptions
                                .filter((s) => !rosterIds.has(s.id))
                                .map((s) => (
                                  <option key={s.id} value={s.id}>
                                    {s.full_name} ({s.role})
                                  </option>
                                ))}
                            </FormSelect>
                            <button
                              type="button"
                              disabled={!pick.trim() || Boolean(busyKey?.startsWith(`add:${t.id}:`))}
                              className="shrink-0 rounded-lg bg-[#121212] px-3 py-1.5 text-[12px] font-medium text-[#faf9f6] disabled:opacity-50"
                              onClick={() => {
                                if (pick) void addTeamMember(t.id, pick);
                              }}
                            >
                              Add
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}

                <div className="mt-3 space-y-2">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <input
                      className="min-w-0 flex-1 rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2 text-[13px] outline-none focus:border-[#121212]"
                      placeholder="New team name (e.g. Night shift)"
                      value={draft}
                      disabled={busyDept}
                      onChange={(e) => setDraftByDept((prev) => ({ ...prev, [d.id]: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          void addTeam(d.id);
                        }
                      }}
                    />
                    <FormSelect
                      className="min-w-0 flex-1 rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2 text-[13px] sm:max-w-xs"
                      value={newOwnerByDept[d.id] ?? ''}
                      disabled={busyDept}
                      onChange={(e) => setNewOwnerByDept((prev) => ({ ...prev, [d.id]: e.target.value }))}
                      aria-label="Optional owner for new team"
                    >
                      <option value="">Owner (optional)</option>
                      {staffOptions.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.full_name} ({s.role})
                        </option>
                      ))}
                    </FormSelect>
                  </div>
                  <button
                    type="button"
                    disabled={busyDept || !draft.trim()}
                    className="rounded-lg bg-[#121212] px-4 py-2 text-[13px] font-medium text-[#faf9f6] disabled:opacity-50"
                    onClick={() => void addTeam(d.id)}
                  >
                    Add team
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
