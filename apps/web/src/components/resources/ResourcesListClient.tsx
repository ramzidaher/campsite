'use client';

import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

export type StaffResourceRow = {
  id: string;
  title: string;
  description: string;
  file_name: string;
  mime_type: string;
  byte_size: number;
  updated_at: string;
};

export function ResourcesListClient({
  orgId,
  canManage,
}: {
  orgId: string;
  canManage: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [rows, setRows] = useState<StaffResourceRow[]>([]);
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(q.trim()), q.trim().length >= 2 ? 300 : 0);
    return () => window.clearTimeout(t);
  }, [q]);

  const searchActive = debounced.length >= 2;

  const load = useCallback(async () => {
    setBusy(true);
    setErr(null);
    try {
      if (searchActive) {
        const { data, error } = await supabase.rpc('search_staff_resources', {
          q: debounced,
          limit_n: 80,
        });
        if (error) throw error;
        const list = (data ?? []) as StaffResourceRow[];
        setRows(list);
      } else {
        const { data, error } = await supabase
          .from('staff_resources')
          .select('id, title, description, file_name, mime_type, byte_size, updated_at')
          .eq('org_id', orgId)
          .order('updated_at', { ascending: false })
          .limit(100);
        if (error) throw error;
        setRows((data ?? []) as StaffResourceRow[]);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not load resources.');
      setRows([]);
    } finally {
      setBusy(false);
    }
  }, [supabase, orgId, searchActive, debounced]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="mx-auto max-w-3xl px-7 py-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-authSerif text-2xl text-[#121212]">Resource library</h1>
          <p className="mt-1 text-[13px] text-[#6b6b6b]">
            Policies, handbooks, and reference files for everyone in your organisation.
          </p>
        </div>
        {canManage ? (
          <Link
            href="/resources/new"
            className="inline-flex h-9 items-center rounded-lg bg-[#121212] px-4 text-[13px] font-medium text-[#faf9f6] transition hover:bg-black"
          >
            Upload
          </Link>
        ) : null}
      </div>

      <div className="relative mb-5">
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[#9b9b9b]">
          🔍
        </span>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search resources (type at least 2 characters)…"
          className="h-10 w-full rounded-lg border border-[#d8d8d8] bg-[#f5f4f1] py-2 pl-9 pr-3 text-[13px] text-[#121212] outline-none placeholder:text-[#9b9b9b] focus:border-[#121212] focus:ring-[3px] focus:ring-[#121212]/10"
        />
      </div>

      {err ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-800">{err}</p> : null}

      {busy ? (
        <p className="text-[13px] text-[#6b6b6b]">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-[13px] text-[#6b6b6b]">
          {searchActive ? 'No resources match your search.' : 'No resources yet.'}
          {canManage && !searchActive ? (
            <>
              {' '}
              <Link href="/resources/new" className="font-medium text-[#121212] underline">
                Upload the first file
              </Link>
              .
            </>
          ) : null}
        </p>
      ) : (
        <ul className="divide-y divide-[#ececec] rounded-xl border border-[#d8d8d8] bg-white">
          {rows.map((r) => (
            <li key={r.id}>
              <Link
                href={`/resources/${r.id}`}
                className="block px-4 py-3 transition hover:bg-[#faf9f6]"
              >
                <p className="text-[14px] font-medium text-[#121212]">{r.title}</p>
                {r.description ? (
                  <p className="mt-0.5 line-clamp-2 text-[12.5px] text-[#6b6b6b]">{r.description}</p>
                ) : null}
                <p className="mt-1 text-[11.5px] text-[#9b9b9b]">
                  {r.file_name} · {formatBytes(r.byte_size)} · Updated{' '}
                  {new Date(r.updated_at).toLocaleString()}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
