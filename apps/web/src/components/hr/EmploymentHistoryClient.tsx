'use client';

import { createClient } from '@/lib/supabase/client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

export type EmploymentHistoryRow = {
  role_title: string;
  department_name: string | null;
  team_name: string | null;
  manager_name: string | null;
  employment_type: string | null;
  contract_type: string | null;
  fte: number | null;
  location_type: string | null;
  start_date: string;
  end_date: string | null;
  change_reason: string | null;
  pay_grade: string | null;
  salary_band: string | null;
  notes: string | null;
  source: 'manual' | 'auto_from_hr_record' | 'employee_request';
};

function emptyEmploymentHistory(): EmploymentHistoryRow {
  return {
    role_title: '',
    department_name: null,
    team_name: null,
    manager_name: null,
    employment_type: null,
    contract_type: null,
    fte: null,
    location_type: null,
    start_date: '',
    end_date: null,
    change_reason: null,
    pay_grade: null,
    salary_band: null,
    notes: null,
    source: 'manual',
  };
}

export function EmploymentHistoryClient({
  title = 'Employment history',
  description,
  subjectUserId,
  initialRows,
  canEdit,
  isSelf = false,
}: {
  title?: string;
  description?: string;
  subjectUserId: string;
  initialRows: EmploymentHistoryRow[];
  canEdit: boolean;
  isSelf?: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [rows, setRows] = useState<EmploymentHistoryRow[]>(
    initialRows.length
      ? initialRows
      : canEdit
        ? [{ ...emptyEmploymentHistory(), source: isSelf ? 'employee_request' : 'manual' }]
        : [],
  );
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  function setRow(i: number, next: Partial<EmploymentHistoryRow>) {
    setRows((prev) => {
      const copy = [...prev];
      copy[i] = { ...copy[i]!, ...next };
      return copy;
    });
  }

  async function save() {
    if (!canEdit) return;
    setMsg(null);
    const payload = rows
      .map((r) => ({
        role_title: r.role_title.trim(),
        department_name: r.department_name?.trim() || null,
        team_name: r.team_name?.trim() || null,
        manager_name: r.manager_name?.trim() || null,
        employment_type: r.employment_type?.trim() || null,
        contract_type: r.contract_type?.trim() || null,
        fte: r.fte == null || Number.isNaN(Number(r.fte)) ? null : Number(r.fte),
        location_type: r.location_type?.trim() || null,
        start_date: r.start_date || null,
        end_date: r.end_date || null,
        change_reason: r.change_reason?.trim() || null,
        pay_grade: r.pay_grade?.trim() || null,
        salary_band: r.salary_band?.trim() || null,
        notes: r.notes?.trim() || null,
        source: r.source || (isSelf ? 'employee_request' : 'manual'),
      }))
      .filter((r) => r.role_title.length > 0 && !!r.start_date);

    setBusy(true);
    const { error } = await supabase.rpc('employee_employment_history_replace', {
      p_user_id: subjectUserId,
      p_history: payload,
    });
    setBusy(false);
    if (error) {
      setMsg({ type: 'error', text: error.message });
      return;
    }
    setMsg({ type: 'success', text: 'Employment history saved.' });
    router.refresh();
  }

  return (
    <section className="mt-6 rounded-xl border border-[#d8d8d8] bg-white p-5">
      <h2 className="text-[15px] font-semibold text-[#121212]">{title}</h2>
      <p className="mt-1 text-[12px] text-[#9b9b9b]">
        {description ??
          'Track role changes, transfers, and progression history inside the organisation.'}
      </p>

      {msg ? (
        <p
          className={[
            'mt-3 rounded-lg px-3 py-2 text-[13px]',
            msg.type === 'error'
              ? 'border border-[#fecaca] bg-[#fef2f2] text-[#b91c1c]'
              : 'border border-[#86efac] bg-[#f0fdf4] text-[#166534]',
          ].join(' ')}
        >
          {msg.text}
        </p>
      ) : null}

      {!canEdit && rows.length === 0 ? (
        <p className="mt-3 text-[13px] text-[#9b9b9b]">No employment history recorded.</p>
      ) : null}

      <div className="mt-4 space-y-3">
        {rows.map((r, i) => (
          <div key={i} className="rounded-lg border border-[#ececec] bg-[#faf9f6] p-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-[12.5px] font-medium text-[#6b6b6b]">
                Role title
                <input
                  type="text"
                  value={r.role_title}
                  disabled={!canEdit || busy}
                  onChange={(e) => setRow(i, { role_title: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px]"
                />
              </label>
              <label className="text-[12.5px] font-medium text-[#6b6b6b]">
                Department
                <input
                  type="text"
                  value={r.department_name ?? ''}
                  disabled={!canEdit || busy}
                  onChange={(e) => setRow(i, { department_name: e.target.value || null })}
                  className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px]"
                />
              </label>
              <label className="text-[12.5px] font-medium text-[#6b6b6b]">
                Team
                <input
                  type="text"
                  value={r.team_name ?? ''}
                  disabled={!canEdit || busy}
                  onChange={(e) => setRow(i, { team_name: e.target.value || null })}
                  className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px]"
                />
              </label>
              <label className="text-[12.5px] font-medium text-[#6b6b6b]">
                Manager
                <input
                  type="text"
                  value={r.manager_name ?? ''}
                  disabled={!canEdit || busy}
                  onChange={(e) => setRow(i, { manager_name: e.target.value || null })}
                  className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px]"
                />
              </label>
              <label className="text-[12.5px] font-medium text-[#6b6b6b]">
                Employment type
                <input
                  type="text"
                  value={r.employment_type ?? ''}
                  disabled={!canEdit || busy}
                  onChange={(e) => setRow(i, { employment_type: e.target.value || null })}
                  className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px]"
                  placeholder="e.g. Permanent, Fixed-term"
                />
              </label>
              <label className="text-[12.5px] font-medium text-[#6b6b6b]">
                Contract type
                <input
                  type="text"
                  value={r.contract_type ?? ''}
                  disabled={!canEdit || busy}
                  onChange={(e) => setRow(i, { contract_type: e.target.value || null })}
                  className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px]"
                  placeholder="e.g. Full-time, Part-time"
                />
              </label>
              <label className="text-[12.5px] font-medium text-[#6b6b6b]">
                FTE
                <input
                  type="number"
                  min="0"
                  max="1.5"
                  step="0.01"
                  value={r.fte ?? ''}
                  disabled={!canEdit || busy}
                  onChange={(e) =>
                    setRow(i, { fte: e.target.value === '' ? null : Number(e.target.value) })
                  }
                  className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px]"
                  placeholder="e.g. 1.00"
                />
              </label>
              <label className="text-[12.5px] font-medium text-[#6b6b6b]">
                Location type
                <input
                  type="text"
                  value={r.location_type ?? ''}
                  disabled={!canEdit || busy}
                  onChange={(e) => setRow(i, { location_type: e.target.value || null })}
                  className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px]"
                  placeholder="e.g. Office, Hybrid, Remote"
                />
              </label>
              <label className="text-[12.5px] font-medium text-[#6b6b6b]">
                Start date
                <input
                  type="date"
                  value={r.start_date || ''}
                  disabled={!canEdit || busy}
                  onChange={(e) => setRow(i, { start_date: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px]"
                />
              </label>
              <label className="text-[12.5px] font-medium text-[#6b6b6b]">
                End date
                <input
                  type="date"
                  value={r.end_date ?? ''}
                  disabled={!canEdit || busy}
                  onChange={(e) => setRow(i, { end_date: e.target.value || null })}
                  className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px]"
                />
              </label>
              <label className="text-[12.5px] font-medium text-[#6b6b6b]">
                Change reason
                <input
                  type="text"
                  value={r.change_reason ?? ''}
                  disabled={!canEdit || busy}
                  onChange={(e) => setRow(i, { change_reason: e.target.value || null })}
                  className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px]"
                  placeholder="e.g. Promotion"
                />
              </label>
              <label className="text-[12.5px] font-medium text-[#6b6b6b]">
                Pay grade
                <input
                  type="text"
                  value={r.pay_grade ?? ''}
                  disabled={!canEdit || busy}
                  onChange={(e) => setRow(i, { pay_grade: e.target.value || null })}
                  className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px]"
                />
              </label>
              <label className="text-[12.5px] font-medium text-[#6b6b6b]">
                Salary band
                <input
                  type="text"
                  value={r.salary_band ?? ''}
                  disabled={!canEdit || busy}
                  onChange={(e) => setRow(i, { salary_band: e.target.value || null })}
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
        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              setRows((prev) => [
                ...prev,
                { ...emptyEmploymentHistory(), source: isSelf ? 'employee_request' : 'manual' },
              ])
            }
            className="rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[12.5px] text-[#121212] hover:bg-[#fafafa] disabled:opacity-50"
          >
            Add role entry
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void save()}
            className="rounded-lg bg-[#121212] px-4 py-2 text-[12.5px] font-medium text-[#faf9f6] disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Save history'}
          </button>
        </div>
      ) : null}
    </section>
  );
}
