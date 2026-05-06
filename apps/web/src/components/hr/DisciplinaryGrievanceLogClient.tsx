'use client';

import { FormSelect } from '@campsite/ui/web';
import { createClient } from '@/lib/supabase/client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

type CaseType = 'disciplinary' | 'grievance';
type CaseStatus = 'open' | 'investigating' | 'hearing' | 'outcome_issued' | 'appeal' | 'closed';

type CaseRow = {
  id: string;
  case_type: CaseType;
  case_ref: string;
  category: string | null;
  severity: string | null;
  status: CaseStatus;
  incident_date: string | null;
  reported_date: string | null;
  hearing_date: string | null;
  outcome_effective_date: string | null;
  review_date: string | null;
  summary: string | null;
  allegations_details: string | null;
  outcome_action: string | null;
  appeal_submitted: boolean;
  appeal_outcome: string | null;
  owner_user_id: string | null;
  investigator_user_id: string | null;
  witness_details: string | null;
  investigation_notes: string | null;
  internal_notes: string | null;
  linked_documents: unknown;
  archived_at: string | null;
  created_at: string;
};

type EventRow = {
  id: string;
  case_id: string;
  event_type: string;
  old_status: string | null;
  new_status: string | null;
  created_at: string;
};

type CasePermissionSet = {
  canManageDisciplinary: boolean;
  canManageGrievance: boolean;
  canViewSensitive: boolean;
};

function emptyCase(caseType: CaseType): Omit<CaseRow, 'id' | 'created_at'> {
  return {
    case_type: caseType,
    case_ref: '',
    category: null,
    severity: null,
    status: 'open',
    incident_date: null,
    reported_date: null,
    hearing_date: null,
    outcome_effective_date: null,
    review_date: null,
    summary: null,
    allegations_details: null,
    outcome_action: null,
    appeal_submitted: false,
    appeal_outcome: null,
    owner_user_id: null,
    investigator_user_id: null,
    witness_details: null,
    investigation_notes: null,
    internal_notes: null,
    linked_documents: [],
    archived_at: null,
  };
}

export function DisciplinaryGrievanceLogClient({
  title = 'Disciplinary & grievance records',
  subjectUserId,
  orgId,
  initialCases,
  initialEvents,
  permissions,
}: {
  title?: string;
  subjectUserId: string;
  orgId: string;
  initialCases: CaseRow[];
  initialEvents: EventRow[];
  permissions: CasePermissionSet;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [rows, setRows] = useState(initialCases);
  const [events] = useState(initialEvents);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const canManageType = (caseType: CaseType) =>
    caseType === 'disciplinary' ? permissions.canManageDisciplinary : permissions.canManageGrievance;

  async function createCase(caseType: CaseType) {
    if (!canManageType(caseType)) return;
    setBusy(true);
    setMsg(null);
    const payload = {
      ...emptyCase(caseType),
      org_id: orgId,
      user_id: subjectUserId,
      case_ref: `${caseType.toUpperCase()}-${Date.now().toString().slice(-6)}`,
      reported_date: new Date().toISOString().slice(0, 10),
    };
    const { error } = await supabase.from('employee_case_records').insert(payload);
    setBusy(false);
    if (error) {
      setMsg({ type: 'error', text: error.message });
      return;
    }
    setMsg({ type: 'success', text: `${caseType} case created.` });
    router.refresh();
  }

  async function saveCase(r: CaseRow) {
    if (!canManageType(r.case_type)) return;
    setBusy(true);
    setMsg(null);
    const { error } = await supabase
      .from('employee_case_records')
      .update({
        case_ref: r.case_ref.trim(),
        category: r.category?.trim() || null,
        severity: r.severity?.trim() || null,
        status: r.status,
        incident_date: r.incident_date || null,
        reported_date: r.reported_date || null,
        hearing_date: r.hearing_date || null,
        outcome_effective_date: r.outcome_effective_date || null,
        review_date: r.review_date || null,
        summary: r.summary?.trim() || null,
        allegations_details: r.allegations_details?.trim() || null,
        outcome_action: r.outcome_action?.trim() || null,
        appeal_submitted: r.appeal_submitted,
        appeal_outcome: r.appeal_outcome?.trim() || null,
        owner_user_id: r.owner_user_id || null,
        investigator_user_id: r.investigator_user_id || null,
        witness_details: r.witness_details?.trim() || null,
        investigation_notes: r.investigation_notes?.trim() || null,
        internal_notes: r.internal_notes?.trim() || null,
      })
      .eq('id', r.id);
    setBusy(false);
    if (error) {
      setMsg({ type: 'error', text: error.message });
      return;
    }
    setMsg({ type: 'success', text: `${r.case_type} case updated.` });
    router.refresh();
  }

  async function toggleArchive(r: CaseRow) {
    if (!canManageType(r.case_type)) return;
    setBusy(true);
    setMsg(null);
    const { error } = await supabase
      .from('employee_case_records')
      .update({ archived_at: r.archived_at ? null : new Date().toISOString() })
      .eq('id', r.id);
    setBusy(false);
    if (error) {
      setMsg({ type: 'error', text: error.message });
      return;
    }
    setMsg({ type: 'success', text: r.archived_at ? 'Case restored.' : 'Case archived.' });
    router.refresh();
  }

  function setRow(i: number, next: Partial<CaseRow>) {
    setRows((prev) => {
      const copy = [...prev];
      copy[i] = { ...copy[i]!, ...next };
      return copy;
    });
  }

  return (
    <section className="mt-6 rounded-xl border border-[#d8d8d8] bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-semibold text-[#121212]">{title}</h2>
          <p className="mt-1 text-[12px] text-[#9b9b9b]">
            Sensitive case management with status lifecycle, archive controls, and event timeline.
          </p>
        </div>
        <div className="flex gap-2">
          {permissions.canManageDisciplinary ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void createCase('disciplinary')}
              className="rounded-lg border border-[#d8d8d8] bg-white px-3 py-1.5 text-[12.5px] text-[#121212] hover:bg-[#fafafa] disabled:opacity-50"
            >
              Add disciplinary
            </button>
          ) : null}
          {permissions.canManageGrievance ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => void createCase('grievance')}
              className="rounded-lg border border-[#d8d8d8] bg-white px-3 py-1.5 text-[12.5px] text-[#121212] hover:bg-[#fafafa] disabled:opacity-50"
            >
              Add grievance
            </button>
          ) : null}
        </div>
      </div>

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

      {rows.length === 0 ? (
        <p className="mt-3 text-[13px] text-[#9b9b9b]">No disciplinary or grievance cases.</p>
      ) : (
        <div className="mt-4 space-y-3">
          {rows.map((r, i) => {
            const canManage = canManageType(r.case_type);
            return (
              <div key={r.id} className="rounded-lg border border-[#ececec] bg-[#faf9f6] p-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="text-[12.5px] font-medium text-[#6b6b6b]">
                    Case type
                    <input
                      value={r.case_type}
                      disabled
                      className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-[#f3f3f3] px-3 py-2 text-[13px]"
                    />
                  </label>
                  <label className="text-[12.5px] font-medium text-[#6b6b6b]">
                    Case reference
                    <input
                      value={r.case_ref}
                      disabled={!canManage || busy}
                      onChange={(e) => setRow(i, { case_ref: e.target.value })}
                      className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px]"
                    />
                  </label>
                  <label className="text-[12.5px] font-medium text-[#6b6b6b]">
                    Status
                    <FormSelect
                      value={r.status}
                      disabled={!canManage || busy}
                      onChange={(e) => setRow(i, { status: e.target.value as CaseStatus })}
                      className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px]"
                    >
                      <option value="open">Open</option>
                      <option value="investigating">Investigating</option>
                      <option value="hearing">Hearing</option>
                      <option value="outcome_issued">Outcome issued</option>
                      <option value="appeal">Appeal</option>
                      <option value="closed">Closed</option>
                    </FormSelect>
                  </label>
                  <label className="text-[12.5px] font-medium text-[#6b6b6b]">
                    Category
                    <input
                      value={r.category ?? ''}
                      disabled={!canManage || busy}
                      onChange={(e) => setRow(i, { category: e.target.value || null })}
                      className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px]"
                    />
                  </label>
                  <label className="text-[12.5px] font-medium text-[#6b6b6b]">
                    Severity
                    <input
                      value={r.severity ?? ''}
                      disabled={!canManage || busy}
                      onChange={(e) => setRow(i, { severity: e.target.value || null })}
                      className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px]"
                    />
                  </label>
                  <label className="text-[12.5px] font-medium text-[#6b6b6b]">
                    Incident date
                    <input
                      type="date"
                      value={r.incident_date ?? ''}
                      disabled={!canManage || busy}
                      onChange={(e) => setRow(i, { incident_date: e.target.value || null })}
                      className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px]"
                    />
                  </label>
                  <label className="text-[12.5px] font-medium text-[#6b6b6b]">
                    Hearing date
                    <input
                      type="date"
                      value={r.hearing_date ?? ''}
                      disabled={!canManage || busy}
                      onChange={(e) => setRow(i, { hearing_date: e.target.value || null })}
                      className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px]"
                    />
                  </label>
                  <label className="text-[12.5px] font-medium text-[#6b6b6b] sm:col-span-2">
                    Summary
                    <textarea
                      rows={2}
                      value={r.summary ?? ''}
                      disabled={!canManage || busy}
                      onChange={(e) => setRow(i, { summary: e.target.value || null })}
                      className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px]"
                    />
                  </label>
                  <label className="text-[12.5px] font-medium text-[#6b6b6b] sm:col-span-2">
                    Outcome / action
                    <textarea
                      rows={2}
                      value={r.outcome_action ?? ''}
                      disabled={!canManage || busy}
                      onChange={(e) => setRow(i, { outcome_action: e.target.value || null })}
                      className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px]"
                    />
                  </label>
                  {permissions.canViewSensitive ? (
                    <>
                      <label className="text-[12.5px] font-medium text-[#6b6b6b] sm:col-span-2">
                        Allegations / details
                        <textarea
                          rows={2}
                          value={r.allegations_details ?? ''}
                          disabled={!canManage || busy}
                          onChange={(e) => setRow(i, { allegations_details: e.target.value || null })}
                          className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px]"
                        />
                      </label>
                      <label className="text-[12.5px] font-medium text-[#6b6b6b] sm:col-span-2">
                        Investigation notes
                        <textarea
                          rows={2}
                          value={r.investigation_notes ?? ''}
                          disabled={!canManage || busy}
                          onChange={(e) => setRow(i, { investigation_notes: e.target.value || null })}
                          className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px]"
                        />
                      </label>
                      <label className="text-[12.5px] font-medium text-[#6b6b6b] sm:col-span-2">
                        Internal notes
                        <textarea
                          rows={2}
                          value={r.internal_notes ?? ''}
                          disabled={!canManage || busy}
                          onChange={(e) => setRow(i, { internal_notes: e.target.value || null })}
                          className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px]"
                        />
                      </label>
                    </>
                  ) : null}
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {canManage ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void saveCase(r)}
                      className="rounded-lg bg-[#121212] px-4 py-1.5 text-[12.5px] font-medium text-[#faf9f6] disabled:opacity-50"
                    >
                      Save case
                    </button>
                  ) : null}
                  {canManage ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void toggleArchive(r)}
                      className="rounded-lg border border-[#d8d8d8] bg-white px-3 py-1.5 text-[12.5px] text-[#121212] hover:bg-[#fafafa] disabled:opacity-50"
                    >
                      {r.archived_at ? 'Unarchive' : 'Archive'}
                    </button>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {events.length ? (
        <div className="mt-4 rounded-lg border border-[#ececec] bg-[#fcfcfc] p-3">
          <p className="text-[12px] font-semibold text-[#121212]">Case timeline</p>
          <ul className="mt-2 space-y-1 text-[12px] text-[#6b6b6b]">
            {events.slice(0, 12).map((e) => (
              <li key={e.id}>
                {new Date(e.created_at).toISOString().slice(0, 10)} · {e.event_type}
                {e.old_status || e.new_status ? ` (${e.old_status ?? ''} → ${e.new_status ?? ''})` : ''}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
