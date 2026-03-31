'use client';

import { PROFILE_ROLES, type ProfileRole } from '@campsite/types';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

type Tier = {
  id: string;
  org_id: string;
  role: ProfileRole;
  label: string;
  discount_value: string | null;
  valid_at: string | null;
};

export function DiscountTiersClient({ orgId }: { orgId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<Tier[]>([]);
  const [loading, setLoading] = useState(true);
  const [previewRole, setPreviewRole] = useState<ProfileRole>('csa');
  const [editing, setEditing] = useState<Tier | null>(null);
  const [role, setRole] = useState<ProfileRole>('csa');
  const [label, setLabel] = useState('');
  const [discountValue, setDiscountValue] = useState('');
  const [validAt, setValidAt] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('discount_tiers')
      .select('id, org_id, role, label, discount_value, valid_at')
      .eq('org_id', orgId)
      .order('role');
    if (error) setMsg(error.message);
    setRows((data ?? []) as Tier[]);
    setLoading(false);
  }, [supabase, orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  const rolesTaken = new Set(rows.map((r) => r.role));
  const rolesAvailable = PROFILE_ROLES.filter((r) => !rolesTaken.has(r) || editing?.role === r);

  function startNew() {
    setEditing(null);
    const first = PROFILE_ROLES.find((r) => !rolesTaken.has(r));
    setRole(first ?? 'csa');
    setLabel('');
    setDiscountValue('');
    setValidAt('');
    setMsg(null);
  }

  function startEdit(t: Tier) {
    setEditing(t);
    setRole(t.role);
    setLabel(t.label);
    setDiscountValue(t.discount_value ?? '');
    setValidAt(t.valid_at ?? '');
    setMsg(null);
  }

  async function save() {
    setMsg(null);
    if (!label.trim()) {
      setMsg('Label is required.');
      return;
    }
    if (!editing && rolesAvailable.length === 0) {
      setMsg('Every role already has a tier. Delete one to reassign.');
      return;
    }
    if (editing) {
      const { error } = await supabase
        .from('discount_tiers')
        .update({
          label: label.trim(),
          discount_value: discountValue.trim() || null,
          valid_at: validAt.trim() || null,
        })
        .eq('id', editing.id);
      if (error) {
        setMsg(error.message);
        return;
      }
    } else {
      const { error } = await supabase.from('discount_tiers').insert({
        org_id: orgId,
        role,
        label: label.trim(),
        discount_value: discountValue.trim() || null,
        valid_at: validAt.trim() || null,
      });
      if (error) {
        setMsg(error.message);
        return;
      }
    }
    setEditing(null);
    await load();
  }

  async function remove(id: string) {
    if (!confirm('Delete this tier?')) return;
    const { error } = await supabase.from('discount_tiers').delete().eq('id', id);
    if (error) setMsg(error.message);
    else void load();
  }

  const previewTier = rows.find((r) => r.role === previewRole);

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-5 py-7 sm:px-[28px]">
      <Link
        href="/settings"
        className="text-[13px] text-[#6b6b6b] underline underline-offset-2 hover:text-[#121212]"
      >
        ← Settings
      </Link>
      <div>
        <h1 className="font-authSerif text-[22px] tracking-tight text-[#121212]">Discount tiers</h1>
        <p className="mt-1 text-[13px] text-[#6b6b6b]">
          One tier per role. Staff see their tier on the discount card.
        </p>
      </div>

      <section className="rounded-xl border border-[#d8d8d8] bg-white p-5 sm:p-6">
        <h2 className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-[#9b9b9b]">Preview</h2>
        <p className="mt-1 text-[12.5px] text-[#6b6b6b]">
          This is what the selected role will see on their card (after you save tiers below).
        </p>
        <label className="mt-3 block text-[13px] font-medium text-[#121212]">
          Role
          <select
            className="mt-1.5 w-full rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2.5 text-[13px] text-[#121212] outline-none focus:ring-1 focus:ring-[#121212]"
            value={previewRole}
            onChange={(e) => setPreviewRole(e.target.value as ProfileRole)}
          >
            {PROFILE_ROLES.map((r) => (
              <option key={r} value={r}>
                {r.replace(/_/g, ' ')}
              </option>
            ))}
          </select>
        </label>
        <div className="mt-3 rounded-lg border border-[#d8d8d8] bg-[#faf9f6] p-3 text-[13px]">
          {previewTier ? (
            <>
              <p className="font-medium text-[#121212]">
                You&apos;re entitled to: {previewTier.label}
              </p>
              {previewTier.discount_value ? (
                <p className="mt-1 text-[#6b6b6b]">{previewTier.discount_value}</p>
              ) : null}
              {previewTier.valid_at ? (
                <p className="mt-1 text-[#6b6b6b]">Valid at: {previewTier.valid_at}</p>
              ) : null}
            </>
          ) : (
            <p className="text-[#6b6b6b]">
              No discount configured. Contact your admin.
            </p>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-[#9b9b9b]">Tiers</h2>
          <button
            type="button"
            disabled={rolesAvailable.length === 0}
            onClick={() => startNew()}
            className="rounded-lg bg-[#121212] px-3 py-2 text-[13px] font-medium text-[#faf9f6] disabled:opacity-40"
          >
            Add tier
          </button>
        </div>
        {loading ? (
          <p className="text-[13px] text-[#6b6b6b]">Loading...</p>
        ) : rows.length === 0 ? (
          <p className="text-[13px] text-[#6b6b6b]">No tiers yet.</p>
        ) : (
          <ul className="space-y-2">
            {rows.map((t) => (
              <li
                key={t.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[#d8d8d8] bg-white px-3 py-2.5 text-[13px]"
              >
                <div>
                  <span className="font-medium capitalize text-[#121212]">
                    {t.role.replace(/_/g, ' ')}
                  </span>
                  <span className="text-[#6b6b6b]"> - {t.label}</span>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="font-medium text-[#121212] underline underline-offset-2 hover:text-[#000]"
                    onClick={() => startEdit(t)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="font-medium text-[#b91c1c] underline underline-offset-2 hover:text-[#991b1b]"
                    onClick={() => void remove(t.id)}
                  >
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-[#d8d8d8] bg-white p-5 sm:p-6">
        <h2 className="text-[13px] font-semibold text-[#121212]">
          {editing ? 'Edit tier' : 'New tier'}
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-[13px] font-medium text-[#121212]">
            Role
            <select
              disabled={!!editing}
              className="mt-1.5 w-full rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2.5 text-[13px] text-[#121212] outline-none focus:ring-1 focus:ring-[#121212] disabled:opacity-60"
              value={role}
              onChange={(e) => setRole(e.target.value as ProfileRole)}
            >
              {(editing ? [editing.role] : rolesAvailable).map((r) => (
                <option key={r} value={r}>
                  {r.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[13px] font-medium text-[#121212] sm:col-span-2">
            Label (shown on card)
            <input
              className="mt-1.5 w-full rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2.5 text-[13px] text-[#121212] outline-none focus:ring-1 focus:ring-[#121212]"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder='e.g. "10% off food and drink"'
            />
          </label>
          <label className="text-[13px] font-medium text-[#121212]">
            Discount value (display)
            <input
              className="mt-1.5 w-full rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2.5 text-[13px] text-[#121212] outline-none focus:ring-1 focus:ring-[#121212]"
              value={discountValue}
              onChange={(e) => setDiscountValue(e.target.value)}
              placeholder="10%"
            />
          </label>
          <label className="text-[13px] font-medium text-[#121212]">
            Valid at (display)
            <input
              className="mt-1.5 w-full rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2.5 text-[13px] text-[#121212] outline-none focus:ring-1 focus:ring-[#121212]"
              value={validAt}
              onChange={(e) => setValidAt(e.target.value)}
              placeholder="All USSU venues"
            />
          </label>
        </div>
        {msg ? <p className="mt-3 text-[13px] text-[#b91c1c]">{msg}</p> : null}
        <button
          type="button"
          onClick={() => void save()}
          className="mt-4 rounded-lg bg-[#121212] px-4 py-2.5 text-[13px] font-medium text-[#faf9f6] transition-opacity hover:opacity-90"
        >
          Save tier
        </button>
      </section>
    </div>
  );
}
