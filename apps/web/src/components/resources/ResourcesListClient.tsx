'use client';

import { createClient } from '@/lib/supabase/client';
import { isMissingArchivedAtColumn } from '@/lib/staffResourceArchiveCompat';
import { parseStaffResourceFolderEmbed } from '@/lib/staffResourceFolderEmbed';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';

export type StaffResourceFolderRow = {
  id: string;
  name: string;
  sort_order: number;
};

export type StaffResourceRow = {
  id: string;
  title: string;
  description: string;
  file_name: string;
  mime_type: string;
  byte_size: number;
  updated_at: string;
  folder_id: string | null;
  archived_at?: string | null;
  staff_resource_folders?: { id: string; name: string } | null;
};

export function ResourcesListClient({
  orgId,
  canManage,
  folderFilter,
  initialSearch = '',
  viewArchived = false,
}: {
  orgId: string;
  canManage: boolean;
  /** `null` = all (grouped by folder); UUID = that folder; `none` = uncategorised only */
  folderFilter: string | null | 'none';
  /** Prefill from top bar or shared links, e.g. `?q=handbook` */
  initialSearch?: string;
  /** Managers only: show archived documents instead of the active library (from `?archived=1`). */
  viewArchived?: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [q, setQ] = useState(initialSearch);
  const [debounced, setDebounced] = useState('');
  const [rows, setRows] = useState<StaffResourceRow[]>([]);
  const [folders, setFolders] = useState<StaffResourceFolderRow[]>([]);
  const [busy, setBusy] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [folderBusy, setFolderBusy] = useState(false);
  /** Set false when remote DB has no `archived_at` column (migration not applied). */
  const [archiveColumnOk, setArchiveColumnOk] = useState(true);

  useEffect(() => {
    setQ(initialSearch);
  }, [initialSearch]);

  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(q.trim()), q.trim().length >= 2 ? 300 : 0);
    return () => window.clearTimeout(t);
  }, [q]);

  const searchActive = debounced.length >= 2;
  const archiveOnly = Boolean(canManage && viewArchived && archiveColumnOk);

  const resourcesHref = useCallback(
    (opts: { folder?: string | null | 'none'; archived?: boolean }) => {
      const p = new URLSearchParams();
      if (opts.archived) p.set('archived', '1');
      if (opts.folder === 'none') p.set('folder', 'none');
      else if (opts.folder) p.set('folder', opts.folder);
      const s = p.toString();
      return s ? `/resources?${s}` : '/resources';
    },
    [],
  );

  const loadFolders = useCallback(async () => {
    const { data, error } = await supabase
      .from('staff_resource_folders')
      .select('id, name, sort_order')
      .eq('org_id', orgId)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });
    if (error) throw error;
    setFolders((data ?? []) as StaffResourceFolderRow[]);
  }, [supabase, orgId]);

  const load = useCallback(async () => {
    setBusy(true);
    setErr(null);
    try {
      const wantsArchiveList = Boolean(canManage && viewArchived);

      if (wantsArchiveList && archiveColumnOk) {
        let q = supabase
          .from('staff_resources')
          .select(
            'id, title, description, file_name, mime_type, byte_size, updated_at, archived_at, folder_id, staff_resource_folders(id, name)',
          )
          .eq('org_id', orgId)
          .not('archived_at', 'is', null)
          .order('updated_at', { ascending: false })
          .limit(200);
        if (folderFilter === 'none') {
          q = q.is('folder_id', null);
        } else if (folderFilter) {
          q = q.eq('folder_id', folderFilter);
        }
        const { data, error } = await q;
        if (error && isMissingArchivedAtColumn(error)) {
          setArchiveColumnOk(false);
        } else if (error) {
          throw error;
        } else {
          const raw = (data ?? []) as Record<string, unknown>[];
          setRows(
            raw.map((r) => ({
              id: String(r.id ?? ''),
              title: String(r.title ?? ''),
              description: r.description != null ? String(r.description) : '',
              file_name: String(r.file_name ?? ''),
              mime_type: String(r.mime_type ?? ''),
              byte_size: Number(r.byte_size ?? 0),
              updated_at: String(r.updated_at ?? ''),
              archived_at: r.archived_at != null ? String(r.archived_at) : null,
              folder_id: r.folder_id != null ? String(r.folder_id) : null,
              staff_resource_folders: parseStaffResourceFolderEmbed(r.staff_resource_folders),
            })),
          );
        }
      } else if (searchActive) {
        const { data, error } = await supabase.rpc('search_staff_resources', {
          q: debounced,
          limit_n: 80,
        });
        if (error) throw error;
        const raw = (data ?? []) as Record<string, unknown>[];
        let list: StaffResourceRow[] = raw.map((r) => ({
          id: String(r.id ?? ''),
          title: String(r.title ?? ''),
          description: r.description != null ? String(r.description) : '',
          file_name: String(r.file_name ?? ''),
          mime_type: String(r.mime_type ?? ''),
          byte_size: Number(r.byte_size ?? 0),
          updated_at: String(r.updated_at ?? ''),
          folder_id: r.folder_id != null ? String(r.folder_id) : null,
          staff_resource_folders: parseStaffResourceFolderEmbed(r.staff_resource_folders),
        }));
        if (folderFilter === 'none') {
          list = list.filter((r) => !r.folder_id);
        } else if (folderFilter) {
          list = list.filter((r) => r.folder_id === folderFilter);
        }
        setRows(list);
      } else {
        let q = supabase
          .from('staff_resources')
          .select(
            'id, title, description, file_name, mime_type, byte_size, updated_at, folder_id, staff_resource_folders(id, name)',
          )
          .eq('org_id', orgId)
          .is('archived_at', null)
          .order('updated_at', { ascending: false })
          .limit(200);
        if (folderFilter === 'none') {
          q = q.is('folder_id', null);
        } else if (folderFilter) {
          q = q.eq('folder_id', folderFilter);
        }
        let { data, error } = await q;
        if (error && isMissingArchivedAtColumn(error)) {
          setArchiveColumnOk(false);
          let q2 = supabase
            .from('staff_resources')
            .select(
              'id, title, description, file_name, mime_type, byte_size, updated_at, folder_id, staff_resource_folders(id, name)',
            )
            .eq('org_id', orgId)
            .order('updated_at', { ascending: false })
            .limit(200);
          if (folderFilter === 'none') {
            q2 = q2.is('folder_id', null);
          } else if (folderFilter) {
            q2 = q2.eq('folder_id', folderFilter);
          }
          const second = await q2;
          data = second.data;
          error = second.error;
        }
        if (error) throw error;
        const raw = (data ?? []) as Record<string, unknown>[];
        setRows(
          raw.map((r) => ({
            id: String(r.id ?? ''),
            title: String(r.title ?? ''),
            description: r.description != null ? String(r.description) : '',
            file_name: String(r.file_name ?? ''),
            mime_type: String(r.mime_type ?? ''),
            byte_size: Number(r.byte_size ?? 0),
            updated_at: String(r.updated_at ?? ''),
            folder_id: r.folder_id != null ? String(r.folder_id) : null,
            staff_resource_folders: parseStaffResourceFolderEmbed(r.staff_resource_folders),
          })),
        );
      }
      await loadFolders();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not load resources.');
      setRows([]);
    } finally {
      setBusy(false);
    }
  }, [supabase, orgId, searchActive, debounced, folderFilter, loadFolders, archiveOnly, archiveColumnOk, canManage, viewArchived]);

  useEffect(() => {
    void load();
  }, [load]);

  async function addFolder(e: React.FormEvent) {
    e.preventDefault();
    const name = newFolderName.trim();
    if (!name || folderBusy) return;
    setFolderBusy(true);
    setErr(null);
    try {
      const { error } = await supabase.from('staff_resource_folders').insert({
        org_id: orgId,
        name,
        sort_order: 0,
      });
      if (error) throw error;
      setNewFolderName('');
      await loadFolders();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not create folder.');
    } finally {
      setFolderBusy(false);
    }
  }

  async function deleteFolder(id: string, label: string) {
    if (!canManage || folderBusy) return;
    if (!window.confirm(`Delete folder “${label}”? Files stay in the library but are moved out of this folder.`)) {
      return;
    }
    setFolderBusy(true);
    setErr(null);
    try {
      const { error } = await supabase.from('staff_resource_folders').delete().eq('id', id);
      if (error) throw error;
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not delete folder.');
    } finally {
      setFolderBusy(false);
    }
  }

  const groupedSections = useMemo(() => {
    if (searchActive || folderFilter !== null) return null;
    const uncategorized = rows.filter((r) => !r.folder_id);
    const sections: { key: string; title: string; items: StaffResourceRow[] }[] = [];
    if (uncategorized.length > 0) {
      sections.push({ key: 'none', title: 'Uncategorised', items: uncategorized });
    }
    for (const f of folders) {
      const items = rows.filter((r) => r.folder_id === f.id);
      if (items.length > 0) {
        sections.push({ key: f.id, title: f.name, items });
      }
    }
    return sections.length > 0 ? sections : null;
  }, [rows, folders, searchActive, folderFilter]);

  const currentFolderLabel =
    folderFilter && folderFilter !== 'none'
      ? folders.find((f) => f.id === folderFilter)?.name ?? 'Folder'
      : folderFilter === 'none'
        ? 'Uncategorised'
        : null;

  const uploadHref =
    folderFilter && folderFilter !== 'none'
      ? `/resources/new?folder=${folderFilter}`
      : folderFilter === 'none'
        ? '/resources/new?folder=none'
        : '/resources/new';

  return (
    <div className="mx-auto max-w-3xl px-7 py-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-authSerif text-2xl text-[#121212]">
            Resource library
            {archiveOnly ? (
              <span className="ml-2 text-lg font-normal text-[#6b6b6b]">· Archived</span>
            ) : null}
          </h1>
          <p className="mt-1 text-[13px] text-[#6b6b6b]">
            {archiveOnly
              ? 'Documents hidden from the main library. Restore or delete them from the resource page.'
              : 'Policies, handbooks, and reference files for everyone in your organisation.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canManage ? (
            <>
              {archiveColumnOk ? (
              <Link
                href={archiveOnly ? '/resources' : '/resources?archived=1'}
                className="inline-flex h-9 items-center rounded-lg border border-[#d8d8d8] bg-white px-3.5 text-[13px] font-medium text-[#121212] transition hover:bg-[#faf9f6]"
              >
                {archiveOnly ? 'Active library' : 'Archived'}
              </Link>
              ) : null}
              <Link
                href={uploadHref}
                className="inline-flex h-9 items-center rounded-lg bg-[#121212] px-4 text-[13px] font-medium text-[#faf9f6] transition hover:bg-black"
              >
                Upload
              </Link>
            </>
          ) : null}
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <Link
          href={resourcesHref({ archived: archiveOnly })}
          className={`inline-flex h-8 items-center rounded-full border px-3 text-[12.5px] ${
            folderFilter === null && !searchActive
              ? 'border-[#121212] bg-[#121212] text-[#faf9f6]'
              : 'border-[#d8d8d8] bg-white text-[#121212] hover:bg-[#faf9f6]'
          }`}
        >
          All
        </Link>
        <Link
          href={resourcesHref({ archived: archiveOnly, folder: 'none' })}
          className={`inline-flex h-8 items-center rounded-full border px-3 text-[12.5px] ${
            folderFilter === 'none' && !searchActive
              ? 'border-[#121212] bg-[#121212] text-[#faf9f6]'
              : 'border-[#d8d8d8] bg-white text-[#121212] hover:bg-[#faf9f6]'
          }`}
        >
          Uncategorised
        </Link>
        {folders.map((f) => (
          <Link
            key={f.id}
            href={resourcesHref({ archived: archiveOnly, folder: f.id })}
            className={`inline-flex h-8 max-w-[200px] items-center truncate rounded-full border px-3 text-[12.5px] ${
              folderFilter === f.id && !searchActive
                ? 'border-[#121212] bg-[#121212] text-[#faf9f6]'
                : 'border-[#d8d8d8] bg-white text-[#121212] hover:bg-[#faf9f6]'
            }`}
            title={f.name}
          >
            {f.name}
          </Link>
        ))}
      </div>

      {currentFolderLabel && !searchActive ? (
        <p className="mb-3 text-[13px] text-[#3d3d3d]">
          Viewing: <span className="font-medium text-[#121212]">{currentFolderLabel}</span>
          {' · '}
          <Link href={resourcesHref({ archived: archiveOnly })} className="text-[#121212] underline">
            Show all
          </Link>
        </p>
      ) : null}

      {canManage && !archiveOnly ? (
        <form onSubmit={addFolder} className="mb-5 flex flex-wrap items-end gap-2 rounded-xl border border-[#ececec] bg-[#faf9f6] p-3">
          <div className="min-w-[200px] flex-1">
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-[#6b6b6b]">
              New folder
            </label>
            <input
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="e.g. Policies"
              className="h-9 w-full rounded-lg border border-[#d8d8d8] bg-white px-3 text-[13px] outline-none focus:border-[#121212]"
            />
          </div>
          <button
            type="submit"
            disabled={folderBusy || !newFolderName.trim()}
            className="h-9 rounded-lg bg-[#121212] px-4 text-[13px] font-medium text-[#faf9f6] disabled:opacity-50"
          >
            {folderBusy ? '…' : 'Add'}
          </button>
          {folders.length > 0 ? (
            <div className="w-full pt-1 text-[12px] text-[#6b6b6b]">
              {folders.map((f) => (
                <span key={f.id} className="mr-3 inline-flex items-center gap-1">
                  {f.name}
                  <button
                    type="button"
                    className="text-[#b42318] hover:underline"
                    onClick={() => void deleteFolder(f.id, f.name)}
                    disabled={folderBusy}
                  >
                    Remove
                  </button>
                </span>
              ))}
            </div>
          ) : null}
        </form>
      ) : null}

      {archiveOnly ? (
        <p className="mb-5 rounded-lg border border-amber-100 bg-amber-50/80 px-3 py-2 text-[13px] text-[#5c4a21]">
          Full-text search applies to the <strong className="font-semibold">active</strong> library only. Switch to
          Active library to search, or browse archived files below.
        </p>
      ) : (
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
      )}

      {err ? <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-800">{err}</p> : null}

      {busy ? (
        <p className="text-[13px] text-[#6b6b6b]">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-[13px] text-[#6b6b6b]">
          {searchActive
            ? 'No resources match your search.'
            : archiveOnly
              ? 'No archived resources.'
              : 'No resources yet.'}
          {canManage && !searchActive && !archiveOnly ? (
            <>
              {' '}
              <Link href={uploadHref} className="font-medium text-[#121212] underline">
                Upload the first file
              </Link>
              .
            </>
          ) : null}
        </p>
      ) : groupedSections && groupedSections.length > 0 ? (
        <div className="space-y-8">
          {groupedSections.map((section) => (
            <div key={section.key}>
              <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-[#6b6b6b]">
                {section.title}
              </h2>
              <ul className="divide-y divide-[#ececec] overflow-hidden rounded-xl border border-[#d8d8d8] bg-white">
                {section.items.map((r) => (
                  <ResourceRow key={r.id} r={r} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <ul className="divide-y divide-[#ececec] overflow-hidden rounded-xl border border-[#d8d8d8] bg-white">
          {rows.map((r) => (
            <ResourceRow key={r.id} r={r} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ResourceRow({ r }: { r: StaffResourceRow }) {
  const folderName = r.staff_resource_folders?.name;
  return (
    <li>
      <Link href={`/resources/${r.id}`} className="block px-4 py-3 transition hover:bg-[#faf9f6]">
        <p className="text-[14px] font-medium text-[#121212]">{r.title}</p>
        {r.description ? (
          <p className="mt-0.5 line-clamp-2 text-[12.5px] text-[#6b6b6b]">{r.description}</p>
        ) : null}
        <p className="mt-1 text-[11.5px] text-[#9b9b9b]">
          {folderName ? `${folderName} · ` : null}
          {r.file_name} · {formatBytes(r.byte_size)} · Updated {new Date(r.updated_at).toLocaleString()}
        </p>
      </Link>
    </li>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
