'use client';

import { createClient } from '@/lib/supabase/client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

export type DependantRow = {
  full_name: string;
  relationship: string;
  date_of_birth: string | null;
  is_student: boolean;
  is_disabled: boolean;
  is_beneficiary: boolean;
  beneficiary_percentage: number | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  is_emergency_contact: boolean;
};

function emptyDependant(): DependantRow {
  return {
    full_name: '',
    relationship: 'other',
    date_of_birth: null,
    is_student: false,
    is_disabled: false,
    is_beneficiary: false,
    beneficiary_percentage: null,
    phone: null,
    email: null,
    address: null,
    notes: null,
    is_emergency_contact: false,
  };
}

export function DependantsEditorClient({
  title = 'Dependants & beneficiaries',
  description,
  subjectUserId,
  initialDependants,
  canEdit,
}: {
  title?: string;
  description?: string;
  subjectUserId: string;
  initialDependants: DependantRow[];
  canEdit: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [rows, setRows] = useState<DependantRow[]>(
    initialDependants.length ? initialDependants : (canEdit ? [emptyDependant()] : []),
  );
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const beneficiaryRows = rows.filter((r) => r.is_beneficiary);
  const beneficiaryTotal = beneficiaryRows.reduce((sum, r) => sum + Number(r.beneficiary_percentage ?? 0), 0);
  const beneficiaryValid = beneficiaryRows.length === 0 || Math.abs(beneficiaryTotal - 100) < 0.001;

  function setRow(i: number, next: Partial<DependantRow>) {
    setRows((prev) => {
      const copy = [...prev];
      copy[i] = { ...copy[i]!, ...next };
      return copy;
    });
  }

  async function save() {
    if (!canEdit) return;
    setMsg(null);
    if (!beneficiaryValid) {
      setMsg({ type: 'error', text: 'Beneficiary allocations must total exactly 100%.' });
      return;
    }
    setBusy(true);
    const payload = rows
      .map((r) => ({
        ...r,
        full_name: r.full_name.trim(),
        relationship: (r.relationship || 'other').trim(),
        date_of_birth: r.date_of_birth || null,
        phone: r.phone?.trim() || null,
        email: r.email?.trim() || null,
        address: r.address?.trim() || null,
        notes: r.notes?.trim() || null,
        beneficiary_percentage: r.is_beneficiary ? Number(r.beneficiary_percentage ?? 0) : null,
      }))
      .filter((r) => r.full_name.length > 0);

    const { error } = await supabase.rpc('employee_dependants_replace', {
      p_user_id: subjectUserId,
      p_dependants: payload,
    });
    setBusy(false);
    if (error) {
      setMsg({ type: 'error', text: error.message });
      return;
    }
    setMsg({ type: 'success', text: 'Dependants saved.' });
    router.refresh();
  }

  return (
    <section className="mt-6 rounded-xl border border-[#d8d8d8] bg-white p-5">
      <h2 className="text-[15px] font-semibold text-[#121212]">{title}</h2>
      <p className="mt-1 text-[12px] text-[#9b9b9b]">
        {description ?? 'Store dependant and beneficiary information for payroll, benefits, and emergency records.'}
      </p>

      {msg ? (
        <p className={['mt-3 rounded-lg px-3 py-2 text-[13px]', msg.type === 'error'
          ? 'border border-[#fecaca] bg-[#fef2f2] text-[#b91c1c]'
          : 'border border-[#86efac] bg-[#f0fdf4] text-[#166534]'].join(' ')}>
          {msg.text}
        </p>
      ) : null}

      {!canEdit && rows.length === 0 ? (
        <p className="mt-3 text-[13px] text-[#9b9b9b]">No dependants recorded.</p>
      ) : null}

      <div className="mt-4 space-y-3">
        {rows.map((r, i) => (
          <div key={i} className="rounded-lg border border-[#ececec] bg-[#faf9f6] p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-[12.5px] font-medium text-[#6b6b6b]">
                Full name
                <input
                  type="text"
                  value={r.full_name}
                  disabled={!canEdit || busy}
                  onChange={(e) => setRow(i, { full_name: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px]"
                />
              </label>
              <label className="text-[12.5px] font-medium text-[#6b6b6b]">
                Relationship
                <select
                  value={r.relationship}
                  disabled={!canEdit || busy}
                  onChange={(e) => setRow(i, { relationship: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px]"
                >
                  <option value="child">Child</option>
                  <option value="spouse">Spouse</option>
                  <option value="partner">Partner</option>
                  <option value="parent">Parent</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <label className="text-[12.5px] font-medium text-[#6b6b6b]">
                Date of birth
                <input
                  type="date"
                  value={r.date_of_birth ?? ''}
                  disabled={!canEdit || busy}
                  onChange={(e) => setRow(i, { date_of_birth: e.target.value || null })}
                  className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px]"
                />
              </label>
              <label className="text-[12.5px] font-medium text-[#6b6b6b]">
                Beneficiary %
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={r.beneficiary_percentage ?? ''}
                  disabled={!canEdit || busy || !r.is_beneficiary}
                  onChange={(e) => setRow(i, { beneficiary_percentage: e.target.value === '' ? null : Number(e.target.value) })}
                  className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px]"
                  placeholder={r.is_beneficiary ? 'e.g. 50' : 'Set beneficiary first'}
                />
              </label>
              <label className="text-[12.5px] font-medium text-[#6b6b6b]">
                Phone
                <input
                  type="text"
                  value={r.phone ?? ''}
                  disabled={!canEdit || busy}
                  onChange={(e) => setRow(i, { phone: e.target.value || null })}
                  className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px]"
                />
              </label>
              <label className="text-[12.5px] font-medium text-[#6b6b6b]">
                Email
                <input
                  type="email"
                  value={r.email ?? ''}
                  disabled={!canEdit || busy}
                  onChange={(e) => setRow(i, { email: e.target.value || null })}
                  className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px]"
                />
              </label>
              <label className="text-[12.5px] font-medium text-[#6b6b6b] sm:col-span-2">
                Address
                <input
                  type="text"
                  value={r.address ?? ''}
                  disabled={!canEdit || busy}
                  onChange={(e) => setRow(i, { address: e.target.value || null })}
                  className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px]"
                />
              </label>
              <label className="text-[12.5px] font-medium text-[#6b6b6b] sm:col-span-2">
                Notes
                <textarea
                  rows={2}
                  value={r.notes ?? ''}
                  disabled={!canEdit || busy}
                  onChange={(e) => setRow(i, { notes: e.target.value || null })}
                  className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px]"
                />
              </label>
            </div>
            <div className="mt-3 flex flex-wrap gap-3 text-[12.5px] text-[#6b6b6b]">
              <label className="inline-flex items-center gap-2">
                <input type="checkbox" checked={r.is_student} disabled={!canEdit || busy} onChange={(e) => setRow(i, { is_student: e.target.checked })} />
                Student
              </label>
              <label className="inline-flex items-center gap-2">
                <input type="checkbox" checked={r.is_disabled} disabled={!canEdit || busy} onChange={(e) => setRow(i, { is_disabled: e.target.checked })} />
                Disabled
              </label>
              <label className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={r.is_beneficiary}
                  disabled={!canEdit || busy}
                  onChange={(e) => setRow(i, {
                    is_beneficiary: e.target.checked,
                    beneficiary_percentage: e.target.checked ? (r.beneficiary_percentage ?? 0) : null,
                  })}
                />
                Beneficiary
              </label>
              <label className="inline-flex items-center gap-2">
                <input type="checkbox" checked={r.is_emergency_contact} disabled={!canEdit || busy} onChange={(e) => setRow(i, { is_emergency_contact: e.target.checked })} />
                Emergency contact
              </label>
            </div>
            {canEdit ? (
              <div className="mt-3">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setRows((prev) => prev.filter((_, idx) => idx !== i))}
                  className="rounded-lg border border-[#fecaca] bg-white px-3 py-1.5 text-[12px] text-[#991b1b] hover:bg-[#fef2f2] disabled:opacity-50"
                >
                  Remove
                </button>
              </div>
            ) : null}
          </div>
        ))}
      </div>

      {canEdit ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className={beneficiaryValid ? 'text-[12px] text-[#6b6b6b]' : 'text-[12px] text-[#b91c1c]'}>
            Beneficiary total: {beneficiaryTotal.toFixed(2)}% {beneficiaryValid ? '' : '(must equal 100%)'}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => setRows((prev) => [...prev, emptyDependant()])}
              className="rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[12.5px] text-[#121212] hover:bg-[#fafafa] disabled:opacity-50"
            >
              Add dependant
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void save()}
              className="rounded-lg bg-[#121212] px-4 py-2 text-[12.5px] font-medium text-[#faf9f6] disabled:opacity-50"
            >
              {busy ? 'Saving…' : 'Save dependants'}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
