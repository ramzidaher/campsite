'use client';

import { createClient } from '@/lib/supabase/client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

type Def = {
  id: string;
  key: string;
  label: string;
  section: string;
  field_type: string;
  is_required: boolean;
  visible_to_manager: boolean;
  visible_to_self: boolean;
  is_active: boolean;
};

export function CustomHrFieldDefinitionsClient({
  orgId,
  initialDefinitions,
}: {
  orgId: string;
  initialDefinitions: Def[];
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<Def[]>(initialDefinitions);
  const [draft, setDraft] = useState({
    key: '',
    label: '',
    section: 'personal',
    field_type: 'text',
    is_required: false,
    visible_to_manager: false,
    visible_to_self: true,
  });

  async function createDef() {
    setBusy(true);
    const { error } = await supabase.from('hr_custom_field_definitions').insert({
      org_id: orgId,
      key: draft.key.trim(),
      label: draft.label.trim(),
      section: draft.section,
      field_type: draft.field_type,
      is_required: draft.is_required,
      visible_to_manager: draft.visible_to_manager,
      visible_to_self: draft.visible_to_self,
      is_active: true,
    });
    setBusy(false);
    if (!error) {
      router.refresh();
    }
  }

  async function toggleArchive(row: Def) {
    setBusy(true);
    await supabase
      .from('hr_custom_field_definitions')
      .update({ is_active: !row.is_active })
      .eq('id', row.id);
    setBusy(false);
    setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, is_active: !r.is_active } : r)));
    router.refresh();
  }

  return (
    <section className="mt-6 rounded-xl border border-[#d8d8d8] bg-white p-5">
      <h2 className="text-[16px] font-semibold text-[#121212]">Custom HR field definitions</h2>
      <p className="mt-1 text-[12px] text-[#9b9b9b]">Create org-level custom fields for HR profiles.</p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <input placeholder="Key (e.g. visa_status)" value={draft.key} onChange={(e) => setDraft((d) => ({ ...d, key: e.target.value }))} className="rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px]" />
        <input placeholder="Label" value={draft.label} onChange={(e) => setDraft((d) => ({ ...d, label: e.target.value }))} className="rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px]" />
        <select value={draft.section} onChange={(e) => setDraft((d) => ({ ...d, section: e.target.value }))} className="rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px]">
          <option value="personal">Personal</option>
          <option value="job">Job</option>
          <option value="payroll">Payroll</option>
          <option value="compliance">Compliance</option>
          <option value="medical_summary">Medical summary</option>
        </select>
        <select value={draft.field_type} onChange={(e) => setDraft((d) => ({ ...d, field_type: e.target.value }))} className="rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px]">
          <option value="text">Text</option>
          <option value="textarea">Textarea</option>
          <option value="number">Number</option>
          <option value="date">Date</option>
          <option value="boolean">Boolean</option>
          <option value="select">Select</option>
          <option value="multi_select">Multi select</option>
          <option value="url">URL</option>
          <option value="email">Email</option>
          <option value="phone">Phone</option>
          <option value="currency">Currency</option>
        </select>
      </div>
      <div className="mt-3 flex flex-wrap gap-3 text-[12.5px] text-[#6b6b6b]">
        <label className="inline-flex items-center gap-2"><input type="checkbox" checked={draft.is_required} onChange={(e) => setDraft((d) => ({ ...d, is_required: e.target.checked }))} />Required</label>
        <label className="inline-flex items-center gap-2"><input type="checkbox" checked={draft.visible_to_manager} onChange={(e) => setDraft((d) => ({ ...d, visible_to_manager: e.target.checked }))} />Manager visible</label>
        <label className="inline-flex items-center gap-2"><input type="checkbox" checked={draft.visible_to_self} onChange={(e) => setDraft((d) => ({ ...d, visible_to_self: e.target.checked }))} />Self visible</label>
      </div>
      <div className="mt-3">
        <button type="button" disabled={busy || !draft.key.trim() || !draft.label.trim()} onClick={() => void createDef()} className="rounded-lg bg-[#121212] px-4 py-2 text-[12.5px] text-[#faf9f6] disabled:opacity-50">
          Create field
        </button>
      </div>

      <div className="mt-4 space-y-2">
        {rows.map((r) => (
          <div key={r.id} className="rounded-lg border border-[#ececec] bg-[#faf9f6] px-3 py-2 text-[12.5px]">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[#121212]">{r.label} <span className="text-[#9b9b9b]">({r.key})</span></p>
              <button type="button" onClick={() => void toggleArchive(r)} className="rounded border border-[#d8d8d8] px-2.5 py-1 text-[12px] text-[#121212] hover:bg-[#fafafa]">
                {r.is_active ? 'Archive' : 'Unarchive'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
