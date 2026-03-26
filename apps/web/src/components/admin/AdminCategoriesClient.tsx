'use client';

import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';

type Dept = { id: string; name: string; type: string };

function typeIcon(t: string) {
  if (t === 'society') return '👥';
  if (t === 'club') return '⚽';
  return '🏢';
}

export function AdminCategoriesClient({
  initialDepartments,
  categoriesByDept: initialCats,
}: {
  initialDepartments: Dept[];
  categoriesByDept: Record<string, { id: string; name: string }[]>;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [draftByDept, setDraftByDept] = useState<Record<string, string>>({});

  const refresh = useCallback(() => {
    router.refresh();
  }, [router]);

  async function addCategory(deptId: string) {
    const name = (draftByDept[deptId] ?? '').trim();
    if (!name) return;
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.from('dept_categories').insert({ dept_id: deptId, name });
    setBusy(false);
    if (error) {
      setMsg(error.message);
      return;
    }
    setDraftByDept((d) => ({ ...d, [deptId]: '' }));
    void refresh();
  }

  async function removeCategory(catId: string) {
    setBusy(true);
    setMsg(null);
    const { error } = await supabase.from('dept_categories').delete().eq('id', catId);
    setBusy(false);
    if (error) setMsg(error.message);
    else void refresh();
  }

  const sortedDepts = useMemo(
    () => [...initialDepartments].sort((a, b) => a.name.localeCompare(b.name)),
    [initialDepartments]
  );

  return (
    <div className="mx-auto max-w-6xl px-5 py-7 sm:px-7">
      <div className="mb-6">
        <h1 className="font-authSerif text-[26px] leading-tight tracking-[-0.03em] text-[#121212]">Categories</h1>
        <p className="mt-1 text-[13px] text-[#6b6b6b]">
          Broadcast categories are scoped per department. They appear when composing broadcasts and in{' '}
          <Link href="/admin/departments" className="font-medium text-[#121212] underline underline-offset-2">
            Departments
          </Link>{' '}
          detail as well.
        </p>
      </div>

      {msg ? (
        <p className="mb-4 rounded-lg border border-[#fecaca] bg-[#fef2f2] px-3 py-2 text-[13px] text-[#b91c1c]">
          {msg}
        </p>
      ) : null}

      <div className="space-y-4">
        {sortedDepts.length === 0 ? (
          <p className="rounded-xl border border-[#d8d8d8] bg-white px-4 py-10 text-center text-[13px] text-[#9b9b9b]">
            No departments yet.{' '}
            <Link href="/admin/departments" className="font-medium text-[#121212] underline underline-offset-2">
              Create one first
            </Link>
            .
          </p>
        ) : (
          sortedDepts.map((d) => {
            const cats = initialCats[d.id] ?? [];
            return (
              <div key={d.id} className="rounded-xl border border-[#d8d8d8] bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-lg" aria-hidden>
                    {typeIcon(d.type)}
                  </span>
                  <h2 className="font-authSerif text-lg text-[#121212]">{d.name}</h2>
                  <span className="rounded-full bg-[#f5f4f1] px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-[#6b6b6b]">
                    {d.type}
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {cats.length === 0 ? (
                    <span className="text-[13px] text-[#9b9b9b]">No categories yet.</span>
                  ) : (
                    cats.map((c) => (
                      <span
                        key={c.id}
                        className="inline-flex items-center gap-1.5 rounded-full border border-[#d8d8d8] bg-[#faf9f6] px-3 py-1 text-[13px] text-[#121212]"
                      >
                        {c.name}
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void removeCategory(c.id)}
                          className="ml-0.5 rounded-full p-0.5 text-[#9b9b9b] hover:bg-[#f5f4f1] hover:text-[#b91c1c] disabled:opacity-40"
                          aria-label={`Remove ${c.name}`}
                        >
                          ×
                        </button>
                      </span>
                    ))
                  )}
                </div>

                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={draftByDept[d.id] ?? ''}
                    disabled={busy}
                    onChange={(e) => setDraftByDept((prev) => ({ ...prev, [d.id]: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void addCategory(d.id);
                    }}
                    placeholder="New category name"
                    className="h-9 min-w-[200px] flex-1 rounded-lg border border-[#d8d8d8] bg-white px-3 text-[13px] text-[#121212] outline-none placeholder:text-[#9b9b9b]"
                  />
                  <button
                    type="button"
                    disabled={busy || !(draftByDept[d.id] ?? '').trim()}
                    onClick={() => void addCategory(d.id)}
                    className="h-9 rounded-lg border border-[#121212] bg-[#121212] px-4 text-[13px] font-medium text-[#faf9f6] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Add
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
