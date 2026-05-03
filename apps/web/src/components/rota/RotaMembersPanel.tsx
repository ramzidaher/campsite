'use client';

import { FormSelect } from '@campsite/ui/web';
import { createClient } from '@/lib/supabase/client';
import { friendlyDbError } from '@/lib/rota/friendlyDbError';
import { useCallback, useEffect, useMemo, useState } from 'react';

export function RotaMembersPanel({
  rotas,
  staff,
}: {
  rotas: { id: string; title: string }[];
  staff: { id: string; full_name: string }[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const [open, setOpen] = useState(false);
  const [rotaId, setRotaId] = useState('');
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [addUserId, setAddUserId] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const nameById = useMemo(() => new Map(staff.map((s) => [s.id, s.full_name])), [staff]);

  const loadMembers = useCallback(async () => {
    if (!rotaId) {
      setMemberIds([]);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.from('rota_members').select('user_id').eq('rota_id', rotaId);
    if (error) {
      setMsg(friendlyDbError(error.message));
      setMemberIds([]);
    } else {
      setMsg(null);
      setMemberIds((data ?? []).map((r) => r.user_id as string));
    }
    setLoading(false);
  }, [supabase, rotaId]);

  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  async function addMember() {
    setMsg(null);
    if (!rotaId || !addUserId) return;
    const { error } = await supabase.from('rota_members').insert({ rota_id: rotaId, user_id: addUserId });
    if (error) setMsg(friendlyDbError(error.message));
    else {
      setAddUserId('');
      void loadMembers();
    }
  }

  async function removeMember(userId: string) {
    setMsg(null);
    if (!rotaId) return;
    const { error } = await supabase.from('rota_members').delete().eq('rota_id', rotaId).eq('user_id', userId);
    if (error) setMsg(friendlyDbError(error.message));
    else void loadMembers();
  }

  if (rotas.length === 0) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-[#e4e2dc] bg-white p-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)] sm:p-7">
      <button
        type="button"
        className="rounded-lg px-2 py-1.5 text-[13px] font-medium text-[#5c5c5c] transition hover:bg-[#ebeae6]"
        onClick={() => setOpen(!open)}
      >
        {open ? 'Hide roster visibility' : 'Show roster visibility'}
      </button>
      {open ? (
        <div className="mt-5 space-y-5">
          <p className="max-w-xl text-[14px] leading-relaxed text-[#5c5c5c]">
            Invited people can see this rota’s shifts even when they are not assigned a slot yet.
          </p>
          <label className="block text-[13px] font-semibold text-[#121212]">
            Rota
            <FormSelect
              className="mt-1.5 w-full max-w-md rounded-xl border border-[#d4d2cc] bg-[#faf9f6] px-3 py-2.5 text-sm outline-none focus:border-[#121212] focus:ring-2 focus:ring-[#121212]/10"
              value={rotaId}
              onChange={(e) => setRotaId(e.target.value)}
            >
              <option value="">-</option>
              {rotas.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title}
                </option>
              ))}
            </FormSelect>
          </label>
          {rotaId ? (
            <>
              <div className="flex flex-wrap items-end gap-3">
                <label className="text-[13px] font-semibold text-[#121212]">
                  Add person
                  <FormSelect
                    className="mt-1.5 block w-full min-w-[220px] rounded-xl border border-[#d4d2cc] bg-[#faf9f6] px-3 py-2.5 text-sm outline-none focus:border-[#121212] focus:ring-2 focus:ring-[#121212]/10"
                    value={addUserId}
                    onChange={(e) => setAddUserId(e.target.value)}
                  >
                    <option value="">-</option>
                    {staff
                      .filter((s) => !memberIds.includes(s.id))
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.full_name}
                        </option>
                      ))}
                  </FormSelect>
                </label>
                <button
                  type="button"
                  className="rounded-xl bg-[#121212] px-4 py-2.5 text-[13px] font-semibold text-[#faf9f6] shadow-sm transition hover:bg-[#2d2d2d] disabled:opacity-40"
                  onClick={() => void addMember()}
                  disabled={!addUserId}
                >
                  Add
                </button>
              </div>
              {loading ? (
                <p className="text-sm text-[#6b6b6b]">Loading...</p>
              ) : memberIds.length === 0 ? (
                <p className="text-sm text-[#6b6b6b]">No invited members yet.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {memberIds.map((uid) => (
                    <li
                      key={uid}
                      className="flex items-center justify-between gap-2 rounded-xl border border-[#ebe9e4] bg-[#faf9f6] px-4 py-2.5 text-[13px]"
                    >
                      <span className="font-medium text-[#121212]">{nameById.get(uid) ?? uid}</span>
                      <button
                        type="button"
                        className="rounded-lg border border-red-200 px-2.5 py-1 text-[12px] font-semibold text-red-800 hover:bg-red-50"
                        onClick={() => void removeMember(uid)}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : null}
          {msg ? (
            <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-900">{msg}</p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
