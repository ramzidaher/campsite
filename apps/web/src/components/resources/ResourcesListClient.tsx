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
  const [folderMsg, setFolderMsg] = useState<string | null>(null);
  const [folderErr, setFolderErr] = useState<string | null>(null);
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

  const fetchFolders = useCallback(async (): Promise<StaffResourceFolderRow[]> => {
    const { data, error } = await supabase
      .from('staff_resource_folders')
      .select('id, name, sort_order')
      .eq('org_id', orgId)
      .order('sort_order', { ascending: true })
      .order('name', { ascending: true });
    if (error) throw error;
    return (data ?? []) as StaffResourceFolderRow[];
  }, [supabase, orgId]);

  const load = useCallback(async () => {
    setBusy(true);
    setErr(null);
    try {
      let folderRows: StaffResourceFolderRow[] = [];
      try {
        folderRows = sortFolderRows(await fetchFolders());
        setFolders(folderRows);
      } catch {
        /* folders load failure — still try resources; keep prior folders */
      }

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
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not load resources.');
      setRows([]);
    } finally {
      setBusy(false);
    }
  }, [supabase, orgId, searchActive, debounced, folderFilter, fetchFolders, archiveOnly, archiveColumnOk, canManage, viewArchived]);

  useEffect(() => {
    void load();
  }, [load]);

  function sortFolderRows(list: StaffResourceFolderRow[]): StaffResourceFolderRow[] {
    return [...list].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
  }

  async function addFolder(e: React.FormEvent) {
    e.preventDefault();
    const name = newFolderName.trim();
    if (!name || folderBusy) return;
    setFolderBusy(true);
    setFolderErr(null);
    setFolderMsg(null);
    try {
      const { data, error } = await supabase
        .from('staff_resource_folders')
        .insert({
          org_id: orgId,
          name,
          sort_order: 0,
        })
        .select('id, name, sort_order')
        .single();
      if (error) throw error;
      if (!data) throw new Error('Could not create folder.');
      const row = data as StaffResourceFolderRow;
      setNewFolderName('');
      setFolderMsg(`“${name}” added.`);
      setFolders((prev) => sortFolderRows([...prev.filter((f) => f.id !== row.id), row]));
      void fetchFolders()
        .then((fresh) => setFolders(sortFolderRows(fresh)))
        .catch(() => {
          /* keep optimistic list */
        });
    } catch (e) {
      setFolderErr(e instanceof Error ? e.message : 'Could not create folder.');
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
    setFolderErr(null);
    try {
      const { error } = await supabase.from('staff_resource_folders').delete().eq('id', id);
      if (error) throw error;
      await load();
    } catch (e) {
      setFolderErr(e instanceof Error ? e.message : 'Could not delete folder.');
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
      sections.push({ key: f.id, title: f.name, items });
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

  const fileCountByFolderId = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) {
      if (r.folder_id) m.set(r.folder_id, (m.get(r.folder_id) ?? 0) + 1);
    }
    return m;
  }, [rows]);

  const showFolderTiles = !archiveOnly && !searchActive && folderFilter === null && folders.length > 0;

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
          className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-[12.5px] font-medium ${
            folderFilter === null && !searchActive
              ? 'border-[#121212] bg-[#121212] text-[#faf9f6]'
              : 'border-[#d8d8d8] bg-white text-[#121212] hover:bg-[#faf9f6]'
          }`}
        >
          <FolderIconSmall className={folderFilter === null && !searchActive ? 'text-[#faf9f6]' : 'text-[#b45309]'} />
          All
        </Link>
        <Link
          href={resourcesHref({ archived: archiveOnly, folder: 'none' })}
          className={`inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-[12.5px] font-medium ${
            folderFilter === 'none' && !searchActive
              ? 'border-[#121212] bg-[#121212] text-[#faf9f6]'
              : 'border-[#d8d8d8] bg-white text-[#121212] hover:bg-[#faf9f6]'
          }`}
        >
          <FolderOutlineIconSmall className={folderFilter === 'none' && !searchActive ? 'text-[#faf9f6]' : 'text-[#78716c]'} />
          Uncategorised
        </Link>
        {folders.map((f) => (
          <Link
            key={f.id}
            href={resourcesHref({ archived: archiveOnly, folder: f.id })}
            className={`inline-flex h-9 max-w-[220px] items-center gap-1.5 truncate rounded-lg border px-3 text-[12.5px] font-medium ${
              folderFilter === f.id && !searchActive
                ? 'border-[#b45309] bg-[#fff7ed] text-[#121212] ring-1 ring-[#b45309]/25'
                : 'border-[#e7e5e4] bg-gradient-to-b from-[#fdf8f0] to-[#f5ecd8] text-[#121212] hover:border-[#d6d3d1]'
            }`}
            title={f.name}
          >
            <FolderIconSmall className="shrink-0 text-[#b45309]" />
            <span className="truncate">{f.name}</span>
          </Link>
        ))}
      </div>

      {showFolderTiles ? (
        <div className="mb-6">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#9b9b9b]">Folders</p>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {folders.map((f) => {
              const n = fileCountByFolderId.get(f.id) ?? 0;
              return (
                <li key={f.id}>
                  <Link
                    href={resourcesHref({ archived: archiveOnly, folder: f.id })}
                    className="flex items-start gap-3 rounded-xl border border-[#e8dcc8] bg-gradient-to-br from-[#fffbf5] via-[#fdf6e8] to-[#f3e9d7] p-4 shadow-sm transition hover:border-[#d4b896] hover:shadow-md"
                  >
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[#f0dcc0]/80 text-[#9a3412]">
                      <FolderIconLarge className="h-7 w-7" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-semibold leading-snug text-[#121212]">{f.name}</span>
                      <span className="mt-0.5 block text-[12px] text-[#78716c]">
                        {n === 0 ? 'Empty folder · upload files here' : `${n} file${n === 1 ? '' : 's'}`}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

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
          {folderMsg ? (
            <p className="w-full text-[12px] text-[#3d7c47]" role="status">
              {folderMsg}
            </p>
          ) : null}
          {folderErr ? (
            <p className="w-full text-[12px] text-red-800" role="alert">
              {folderErr}
            </p>
          ) : null}
          {folders.length > 0 ? (
            <div className="w-full pt-1">
              <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-[#9b9b9b]">Manage folders</p>
              <div className="flex flex-wrap gap-2">
                {folders.map((f) => (
                  <span
                    key={f.id}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-[#e7e5e4] bg-white px-2.5 py-1.5 text-[12px] text-[#121212]"
                  >
                    <FolderIconSmall className="shrink-0 text-[#b45309]" aria-hidden />
                    <span className="max-w-[140px] truncate">{f.name}</span>
                    <button
                      type="button"
                      className="text-[12px] text-[#b42318] hover:underline"
                      onClick={() => void deleteFolder(f.id, f.name)}
                      disabled={folderBusy}
                    >
                      Remove
                    </button>
                  </span>
                ))}
              </div>
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
      ) : groupedSections && groupedSections.length > 0 ? (
        <div className="space-y-8">
          {groupedSections.map((section) => (
            <div key={section.key}>
              <h2 className="mb-2 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.08em] text-[#6b6b6b]">
                {section.key === 'none' ? (
                  <FolderOutlineIconSmall className="text-[#78716c]" />
                ) : (
                  <FolderIconSmall className="text-[#b45309]" />
                )}
                {section.title}
              </h2>
              <ul className="divide-y divide-[#ececec] overflow-hidden rounded-xl border border-[#d8d8d8] bg-white">
                {section.items.length === 0 ? (
                  <li className="flex items-start gap-3 border border-dashed border-[#e8dcc8] bg-[#fffbf7] px-4 py-4 text-[13px] text-[#6b6b6b]">
                    <span className="mt-0.5 text-[#d4b896]">
                      <FolderIconLarge className="h-8 w-8" />
                    </span>
                    <span>
                      <span className="font-medium text-[#121212]">This folder is empty.</span>
                      <span className="mt-1 block">
                        {canManage && !archiveOnly && section.key !== 'none' ? (
                          <>
                            <Link
                              href={`/resources/new?folder=${section.key}`}
                              className="font-medium text-[#121212] underline"
                            >
                              Upload a file
                            </Link>{' '}
                            to fill this folder.
                          </>
                        ) : (
                          'No files yet.'
                        )}
                      </span>
                    </span>
                  </li>
                ) : (
                  section.items.map((r) => <ResourceRow key={r.id} r={r} />)
                )}
              </ul>
            </div>
          ))}
        </div>
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

function FolderIconSmall({ className }: { className?: string }) {
  return (
    <svg className={`h-4 w-4 ${className ?? ''}`} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
    </svg>
  );
}

function FolderOutlineIconSmall({ className }: { className?: string }) {
  return (
    <svg
      className={`h-4 w-4 ${className ?? ''}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 7.5V18a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-7.5L9.22 4.72A2 2 0 007.78 4H5a2 2 0 00-2 2v1.5z"
      />
    </svg>
  );
}

function FolderIconLarge({ className }: { className?: string }) {
  return (
    <svg className={`h-8 w-8 ${className ?? ''}`} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
    </svg>
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
