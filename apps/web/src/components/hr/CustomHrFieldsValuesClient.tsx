'use client';

import { createClient } from '@/lib/supabase/client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

type DefRow = {
  id: string;
  key: string;
  label: string;
  section: string;
  field_type: string;
  options: unknown;
  is_required: boolean;
};

type ValueRow = {
  definition_id: string;
  value: unknown;
};

export function CustomHrFieldsValuesClient({
  orgId,
  subjectUserId,
  definitions,
  initialValues,
  canEdit,
  title = 'Custom HR fields',
}: {
  orgId: string;
  subjectUserId: string;
  definitions: DefRow[];
  initialValues: ValueRow[];
  canEdit: boolean;
  title?: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(
      initialValues.map((v) => [
        v.definition_id,
        typeof v.value === 'string' ? v.value : v.value == null ? '' : JSON.stringify(v.value),
      ]),
    ),
  );

  async function save(def: DefRow) {
    if (!canEdit) return;
    setBusy(true);
    setMsg(null);
    const raw = values[def.id] ?? '';
    const payload = raw === '' ? null : raw;
    const { error } = await supabase
      .from('hr_custom_field_values')
      .upsert({
        org_id: orgId,
        user_id: subjectUserId,
        definition_id: def.id,
        value: payload,
      }, { onConflict: 'org_id,user_id,definition_id' });
    setBusy(false);
    if (error) {
      setMsg(error.message);
      return;
    }
    setMsg(`Saved ${def.label}`);
    router.refresh();
  }

  return (
    <section className="mt-6 rounded-xl border border-[#d8d8d8] bg-white p-5">
      <h2 className="text-[15px] font-semibold text-[#121212]">{title}</h2>
      <p className="mt-1 text-[12px] text-[#9b9b9b]">Org-defined extra HR fields.</p>
      {msg ? <p className="mt-2 text-[12px] text-[#6b6b6b]">{msg}</p> : null}

      <div className="mt-4 space-y-3">
        {definitions.map((def) => (
          <div key={def.id} className="rounded-lg border border-[#ececec] bg-[#faf9f6] p-3">
            <label className="text-[12.5px] font-medium text-[#6b6b6b]">
              {def.label} {def.is_required ? '*' : ''}
              <input
                value={values[def.id] ?? ''}
                disabled={!canEdit || busy}
                onChange={(e) => setValues((prev) => ({ ...prev, [def.id]: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px]"
              />
            </label>
            {canEdit ? (
              <div className="mt-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void save(def)}
                  className="rounded-lg bg-[#121212] px-3 py-1.5 text-[12px] text-[#faf9f6] disabled:opacity-50"
                >
                  Save
                </button>
              </div>
            ) : null}
          </div>
        ))}
        {definitions.length === 0 ? (
          <p className="text-[13px] text-[#9b9b9b]">No custom fields configured yet.</p>
        ) : null}
      </div>
    </section>
  );
}
