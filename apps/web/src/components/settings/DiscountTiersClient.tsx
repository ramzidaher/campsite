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
    <div className="mx-auto max-w-2xl space-y-8">
      <Link href="/settings" className="text-sm text-emerald-400 hover:underline">
        ← Settings
      </Link>
      <div>
        <h1 className="text-xl font-semibold text-[var(--campsite-text)]">Discount tiers</h1>
        <p className="mt-1 text-sm text-[var(--campsite-text-secondary)]">
          One tier per role. Staff see their tier on the discount card.
        </p>
      </div>

      <section className="rounded-xl border border-[var(--campsite-border)] bg-[var(--campsite-bg)] p-4">
        <h2 className="text-sm font-semibold text-[var(--campsite-text)]">Preview</h2>
        <p className="mt-1 text-xs text-[var(--campsite-text-secondary)]">
          This is what the selected role will see on their card (after you save tiers below).
        </p>
        <label className="mt-3 block text-sm">
          Role
          <select
            className="mt-1 w-full rounded-md border border-[var(--campsite-border)] bg-[var(--campsite-surface)] px-2 py-2"
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
        <div className="mt-3 rounded-lg border border-[var(--campsite-border)] bg-[var(--campsite-surface)] p-3 text-sm">
          {previewTier ? (
            <>
              <p className="font-medium text-[var(--campsite-text)]">
                You&apos;re entitled to: {previewTier.label}
              </p>
              {previewTier.discount_value ? (
                <p className="mt-1 text-[var(--campsite-text-secondary)]">{previewTier.discount_value}</p>
              ) : null}
              {previewTier.valid_at ? (
                <p className="mt-1 text-[var(--campsite-text-secondary)]">Valid at: {previewTier.valid_at}</p>
              ) : null}
            </>
          ) : (
            <p className="text-[var(--campsite-text-secondary)]">
              No discount configured. Contact your admin.
            </p>
          )}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--campsite-text-muted)]">
            Tiers
          </h2>
          <button
            type="button"
            disabled={rolesAvailable.length === 0}
            onClick={() => startNew()}
            className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm text-white disabled:opacity-40"
          >
            Add tier
          </button>
        </div>
        {loading ? (
          <p className="text-sm text-[var(--campsite-text-secondary)]">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-[var(--campsite-text-secondary)]">No tiers yet.</p>
        ) : (
          <ul className="space-y-2">
            {rows.map((t) => (
              <li
                key={t.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--campsite-border)] px-3 py-2 text-sm"
              >
                <div>
                  <span className="font-medium capitalize text-[var(--campsite-text)]">
                    {t.role.replace(/_/g, ' ')}
                  </span>
                  <span className="text-[var(--campsite-text-secondary)]"> — {t.label}</span>
                </div>
                <div className="flex gap-2">
                  <button type="button" className="text-emerald-400 hover:underline" onClick={() => startEdit(t)}>
                    Edit
                  </button>
                  <button type="button" className="text-red-400 hover:underline" onClick={() => void remove(t.id)}>
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-[var(--campsite-border)] bg-[var(--campsite-bg)] p-4">
        <h2 className="text-sm font-semibold text-[var(--campsite-text)]">
          {editing ? 'Edit tier' : 'New tier'}
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            Role
            <select
              disabled={!!editing}
              className="mt-1 w-full rounded-md border border-[var(--campsite-border)] bg-[var(--campsite-surface)] px-2 py-2 disabled:opacity-60"
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
          <label className="text-sm sm:col-span-2">
            Label (shown on card)
            <input
              className="mt-1 w-full rounded-md border border-[var(--campsite-border)] bg-[var(--campsite-surface)] px-2 py-2"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder='e.g. "10% off food and drink"'
            />
          </label>
          <label className="text-sm">
            Discount value (display)
            <input
              className="mt-1 w-full rounded-md border border-[var(--campsite-border)] bg-[var(--campsite-surface)] px-2 py-2"
              value={discountValue}
              onChange={(e) => setDiscountValue(e.target.value)}
              placeholder="10%"
            />
          </label>
          <label className="text-sm">
            Valid at (display)
            <input
              className="mt-1 w-full rounded-md border border-[var(--campsite-border)] bg-[var(--campsite-surface)] px-2 py-2"
              value={validAt}
              onChange={(e) => setValidAt(e.target.value)}
              placeholder="All USSU venues"
            />
          </label>
        </div>
        {msg ? <p className="mt-3 text-sm text-red-300">{msg}</p> : null}
        <button
          type="button"
          onClick={() => void save()}
          className="mt-4 rounded-md bg-emerald-600 px-4 py-2 text-sm text-white"
        >
          Save tier
        </button>
      </section>
    </div>
  );
}
