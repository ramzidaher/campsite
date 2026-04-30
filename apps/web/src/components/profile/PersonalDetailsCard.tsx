'use client';

import { invalidateClientCaches } from '@/lib/cache/clientInvalidate';
import { createClient } from '@/lib/supabase/client';
import { Pencil } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

type Props = {
  fullName: string;
  preferredName: string | null;
  email: string;
  department: string;
  pronouns: string | null;
  showPronouns: boolean;
};

const inputClass =
  'mt-1.5 w-full rounded-lg border border-[#d8d8d8] bg-[#faf9f6] px-3 py-2.5 text-[13px] text-[#121212] outline-none transition placeholder:text-[#9b9b9b] focus:border-[#121212] focus:ring-1 focus:ring-[#121212]';

export function PersonalDetailsCard({
  fullName,
  preferredName,
  email,
  department,
  pronouns,
  showPronouns,
}: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [nameValue, setNameValue] = useState(fullName);
  const [preferredNameValue, setPreferredNameValue] = useState(preferredName ?? '');
  const [pronounsValue, setPronounsValue] = useState(pronouns ?? '');
  const [showPronounsValue, setShowPronounsValue] = useState(showPronouns);

  const visiblePronouns = pronounsValue.trim() || '—';

  async function save() {
    setLoading(true);
    const supabase = createClient();
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      setLoading(false);
      return;
    }
    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: nameValue.trim(),
        preferred_name: preferredNameValue.trim() || null,
        pronouns: pronounsValue.trim().slice(0, 80) || null,
        show_pronouns: showPronounsValue,
      })
      .eq('id', data.user.id);
    setLoading(false);
    if (error) return;
    await invalidateClientCaches({ scopes: ['profile-self'], shellUserIds: [data.user.id] }).catch(() => null);
    setEditing(false);
    router.refresh();
  }

  function cancel() {
    setNameValue(fullName);
    setPreferredNameValue(preferredName ?? '');
    setPronounsValue(pronouns ?? '');
    setShowPronounsValue(showPronouns);
    setEditing(false);
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-[#e8e8e8] bg-white">
      <div className="flex items-center justify-between border-b border-[#f0f0f0] px-4 py-3">
        <span className="text-[12px] font-semibold uppercase tracking-widest text-[#9b9b9b]">Personal details</span>
        {!editing ? (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-2 text-[12px] text-[var(--org-brand-primary,#0f6e56)]"
          >
            <Pencil className="h-3.5 w-3.5" aria-hidden />
            Edit
          </button>
        ) : null}
      </div>
      <div className="p-4">
        <dl className="grid gap-x-6 gap-y-3 text-[13px] sm:grid-cols-2">
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-widest text-[#9b9b9b]">Full name</dt>
            <dd className="text-[#121212]">
              {editing ? <input className={inputClass} value={nameValue} onChange={(e) => setNameValue(e.target.value)} /> : nameValue || '—'}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-widest text-[#9b9b9b]">Work email</dt>
            <dd className="text-[#121212]">{email}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-widest text-[#9b9b9b]">Department</dt>
            <dd className="text-[#121212]">{department}</dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-widest text-[#9b9b9b]">Pronouns</dt>
            <dd className="text-[#121212]">
              {editing ? (
                <div>
                  <input className={inputClass} value={pronounsValue} onChange={(e) => setPronounsValue(e.target.value)} />
                  <label className="mt-2 flex items-center gap-2 text-[12px] text-[#6b6b6b]">
                    <input type="checkbox" checked={showPronounsValue} onChange={(e) => setShowPronounsValue(e.target.checked)} />
                    Show on profile
                  </label>
                </div>
              ) : (
                visiblePronouns
              )}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-widest text-[#9b9b9b]">Preferred name</dt>
            <dd className="text-[#121212]">
              {editing ? (
                <input className={inputClass} value={preferredNameValue} onChange={(e) => setPreferredNameValue(e.target.value)} />
              ) : (
                preferredNameValue.trim() || '—'
              )}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] font-semibold uppercase tracking-widest text-[#9b9b9b]">Phone</dt>
            <dd className="text-[#6b6b6b] italic">Not provided</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-[11px] font-semibold uppercase tracking-widest text-[#9b9b9b]">Emergency contact</dt>
            <dd className="text-[#6b6b6b] italic">Not stored in CampSite yet. Ask your HR team if they keep this elsewhere.</dd>
          </div>
        </dl>
        {editing ? (
          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              onClick={save}
              disabled={loading || !nameValue.trim()}
              className="inline-flex items-center justify-center rounded-lg bg-[#121212] px-4 py-2 text-[13px] font-medium text-white disabled:opacity-50"
            >
              {loading ? 'Saving...' : 'Save'}
            </button>
            <button
              type="button"
              onClick={cancel}
              disabled={loading}
              className="inline-flex items-center justify-center rounded-lg border border-[#d8d8d8] bg-white px-4 py-2 text-[13px] font-medium text-[#121212] disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
