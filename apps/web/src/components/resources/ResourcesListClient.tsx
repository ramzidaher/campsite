'use client';

import { ExperienceLensBar } from '@/components/experience/ExperienceLensBar';
import { createClient } from '@/lib/supabase/client';
import { isMissingArchivedAtColumn, isMissingFolderHierarchyColumn } from '@/lib/staffResourceArchiveCompat';
import { parseStaffResourceFolderEmbed } from '@/lib/staffResourceFolderEmbed';
import { MoreVertical } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { PostgrestError } from '@supabase/supabase-js';
import type { RefObject } from 'react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const RESOURCE_FILE_LENS_KEY = 'campsite_resources_file_lens';

export type StaffResourceFolderRow = {
  id: string;
  name: string;
  sort_order: number;
  /** Present when nested-folder migration is applied. */
  parent_id?: string | null;
  /** Present when folder archive migration is applied. */
  archived_at?: string | null;
};

function buildChildrenByParentId(folders: StaffResourceFolderRow[]): Map<string | null, string[]> {
  const m = new Map<string | null, string[]>();
  for (const f of folders) {
    const p = f.parent_id === undefined ? null : f.parent_id;
    if (!m.has(p)) m.set(p, []);
    m.get(p)!.push(f.id);
  }
  for (const ids of m.values()) {
    ids.sort((a, b) => a.localeCompare(b));
  }
  return m;
}

/** Descendants of `rootId` (not including `rootId`). */
function collectDescendantFolderIds(rootId: string, childrenByParent: Map<string | null, string[]>): Set<string> {
  const out = new Set<string>();
  const stack = [...(childrenByParent.get(rootId) ?? [])];
  while (stack.length) {
    const id = stack.pop()!;
    if (out.has(id)) continue;
    out.add(id);
    for (const c of childrenByParent.get(id) ?? []) stack.push(c);
  }
  return out;
}

function folderDisplayPath(folderId: string, byId: Map<string, StaffResourceFolderRow>): string {
  const segments: string[] = [];
  let cur: string | undefined = folderId;
  const seen = new Set<string>();
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    const row = byId.get(cur);
    if (!row) break;
    segments.unshift(row.name);
    const p = row.parent_id === undefined ? null : row.parent_id;
    cur = p ?? undefined;
  }
  return segments.join(' / ');
}

export type StaffResourceRow = {
  id: string;
  title: string;
  description: string;
  file_name: string;
  mime_type: string;
  byte_size: number;
  updated_at: string;
  folder_id: string | null;
  /** Needed to remove storage when deleting; optional if row came from a slim query. */
  storage_path?: string | null;
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
  /** Set false when `staff_resource_folders.parent_id` / folder `archived_at` are missing. */
  const [folderHierarchyOk, setFolderHierarchyOk] = useState(true);
  const [moveFileRow, setMoveFileRow] = useState<StaffResourceRow | null>(null);
  const [moveFolderId, setMoveFolderId] = useState<string | null>(null);
  const [fileLens, setFileLens] = useState<'list' | 'grid'>('list');
  const [newFolderPanelOpen, setNewFolderPanelOpen] = useState(false);
  const [folderMenuOpenId, setFolderMenuOpenId] = useState<string | null>(null);
  const [renameFolderId, setRenameFolderId] = useState<string | null>(null);
  const [renameFolderName, setRenameFolderName] = useState('');
  const [fileMenuOpenId, setFileMenuOpenId] = useState<string | null>(null);
  const [fileActionBusyId, setFileActionBusyId] = useState<string | null>(null);
  /**
   * Portaled ⋮ menus: fixed coords on `document.body` with an explicit z-index so they sit above
   * shell chrome (e.g. sticky `AppTopBar` z-50) and in-page rows that create stacking contexts.
   */
  const [dropdownPos, setDropdownPos] = useState<
    | { placement: 'below'; top: number; right: number }
    | { placement: 'above'; bottom: number; right: number }
    | null
  >(null);

  const DROPDOWN_PORTAL_Z = 10000;
  const RENAME_MODAL_Z = 10500;
  /** Approximate menu height for flip logic (folder menu can be taller than file menu). */
  const MENU_EST_HEIGHT_PX = 320;
  const folderMenuAnchorRef = useRef<HTMLButtonElement | null>(null);
  const fileMenuAnchorRef = useRef<HTMLButtonElement | null>(null);

  const router = useRouter();

  useLayoutEffect(() => {
    const anyOpen = Boolean(folderMenuOpenId || fileMenuOpenId);
    if (!anyOpen) {
      setDropdownPos(null);
      return;
    }
    let cancelled = false;
    let raf = 0;
    const update = () => {
      const el = folderMenuOpenId ? folderMenuAnchorRef.current : fileMenuAnchorRef.current;
      if (!el) {
        if (!cancelled) raf = window.requestAnimationFrame(update);
        return;
      }
      const rect = el.getBoundingClientRect();
      const right = window.innerWidth - rect.right;
      const gap = 6;
      const vh = window.innerHeight;
      const spaceBelow = vh - rect.bottom - gap;
      const roomAbove = rect.top - gap;
      /** Default: open below the trigger. Only flip above when there is not enough space below but enough above. */
      const openUp = spaceBelow < MENU_EST_HEIGHT_PX && roomAbove >= MENU_EST_HEIGHT_PX;
      if (openUp) {
        setDropdownPos({
          placement: 'above',
          bottom: vh - rect.top + gap,
          right,
        });
      } else {
        setDropdownPos({
          placement: 'below',
          top: rect.bottom + gap,
          right,
        });
      }
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      cancelled = true;
      window.cancelAnimationFrame(raf);
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [folderMenuOpenId, fileMenuOpenId]);

  useEffect(() => {
    setQ(initialSearch);
  }, [initialSearch]);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(RESOURCE_FILE_LENS_KEY);
      if (raw === 'list' || raw === 'grid') setFileLens(raw);
    } catch {
      /* ignore */
    }
  }, []);

  const persistFileLens = (next: 'list' | 'grid') => {
    setFileLens(next);
    try {
      window.localStorage.setItem(RESOURCE_FILE_LENS_KEY, next);
    } catch {
      /* ignore */
    }
  };

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

  const fetchFolderRows = useCallback(
    async (mode: 'match_view' | 'active_only'): Promise<StaffResourceFolderRow[]> => {
      const selectCols = folderHierarchyOk
        ? 'id, name, sort_order, parent_id, archived_at'
        : 'id, name, sort_order';
      let q = supabase.from('staff_resource_folders').select(selectCols).eq('org_id', orgId);
      if (folderHierarchyOk) {
        const wantArchivedFolders = mode === 'match_view' && archiveOnly;
        if (wantArchivedFolders) q = q.not('archived_at', 'is', null);
        else q = q.is('archived_at', null);
      }
      q = q.order('sort_order', { ascending: true }).order('name', { ascending: true });
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as unknown as StaffResourceFolderRow[];
    },
    [supabase, orgId, folderHierarchyOk, archiveOnly],
  );

  const load = useCallback(async () => {
    setBusy(true);
    setErr(null);
    try {
      let folderRows: StaffResourceFolderRow[] = [];
      try {
        folderRows = sortFolderRows(await fetchFolderRows('match_view'));
        setFolders(folderRows);
      } catch (e) {
        if (folderHierarchyOk && isMissingFolderHierarchyColumn(e as PostgrestError)) {
          setFolderHierarchyOk(false);
        }
        /* folders load failure — still try resources; keep prior folders */
      }

      const wantsArchiveList = Boolean(canManage && viewArchived);

      if (wantsArchiveList && archiveColumnOk) {
        let q = supabase
          .from('staff_resources')
          .select(
            'id, title, description, file_name, mime_type, byte_size, storage_path, updated_at, archived_at, folder_id, staff_resource_folders(id, name)',
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
              storage_path: r.storage_path != null && String(r.storage_path) !== '' ? String(r.storage_path) : null,
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
          storage_path: r.storage_path != null && String(r.storage_path) !== '' ? String(r.storage_path) : null,
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
            'id, title, description, file_name, mime_type, byte_size, storage_path, updated_at, folder_id, staff_resource_folders(id, name)',
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
              'id, title, description, file_name, mime_type, byte_size, storage_path, updated_at, folder_id, staff_resource_folders(id, name)',
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
            storage_path: r.storage_path != null && String(r.storage_path) !== '' ? String(r.storage_path) : null,
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
  }, [
    supabase,
    orgId,
    searchActive,
    debounced,
    folderFilter,
    fetchFolderRows,
    archiveOnly,
    archiveColumnOk,
    canManage,
    viewArchived,
    folderHierarchyOk,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!folderMenuOpenId && !fileMenuOpenId) return;
    function closeOnOutside(e: MouseEvent) {
      const t = e.target;
      if (!(t instanceof Element)) return;
      if (t.closest('[data-resource-folder-menu]') || t.closest('[data-resource-file-menu]')) return;
      setFolderMenuOpenId(null);
      setFileMenuOpenId(null);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setFolderMenuOpenId(null);
        setFileMenuOpenId(null);
      }
    }
    document.addEventListener('mousedown', closeOnOutside);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', closeOnOutside);
      document.removeEventListener('keydown', onKey);
    };
  }, [folderMenuOpenId, fileMenuOpenId]);

  useEffect(() => {
    if (!renameFolderId) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setRenameFolderId(null);
        setRenameFolderName('');
        setFolderErr(null);
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [renameFolderId]);

  useEffect(() => {
    if (!moveFileRow && !moveFolderId) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setMoveFileRow(null);
        setMoveFolderId(null);
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [moveFileRow, moveFolderId]);

  function sortFolderRows(list: StaffResourceFolderRow[]): StaffResourceFolderRow[] {
    const byId = new Map(list.map((f) => [f.id, f]));
    return [...list].sort((a, b) => {
      const pa = folderDisplayPath(a.id, byId);
      const pb = folderDisplayPath(b.id, byId);
      const pathCmp = pa.localeCompare(pb, undefined, { sensitivity: 'base' });
      if (pathCmp !== 0) return pathCmp;
      return a.sort_order - b.sort_order || a.name.localeCompare(b.name);
    });
  }

  async function addFolder(e: React.FormEvent) {
    e.preventDefault();
    const name = newFolderName.trim();
    if (!name || folderBusy) return;
    setFolderBusy(true);
    setFolderErr(null);
    setFolderMsg(null);
    try {
      const insertPayload: Record<string, unknown> = {
        org_id: orgId,
        name,
        sort_order: 0,
      };
      if (folderHierarchyOk) insertPayload.parent_id = null;
      const selectCols = folderHierarchyOk ? 'id, name, sort_order, parent_id, archived_at' : 'id, name, sort_order';
      const { data, error } = await supabase
        .from('staff_resource_folders')
        .insert(insertPayload)
        .select(selectCols)
        .single();
      if (error) throw error;
      if (!data) throw new Error('Could not create folder.');
      const row = data as unknown as StaffResourceFolderRow;
      setNewFolderName('');
      setFolderMsg(`“${name}” added.`);
      setFolders((prev) => sortFolderRows([...prev.filter((f) => f.id !== row.id), row]));
      void fetchFolderRows('active_only')
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

  async function duplicateFolderRow(source: StaffResourceFolderRow) {
    if (!canManage || folderBusy) return;
    setFolderBusy(true);
    setFolderErr(null);
    setFolderMsg(null);
    try {
      const names = new Set(folders.map((f) => f.name));
      let name = `${source.name} (copy)`;
      let n = 2;
      while (names.has(name)) {
        name = `${source.name} (copy ${n})`;
        n += 1;
      }
      const maxOrder = folders.length ? Math.max(...folders.map((x) => x.sort_order)) : 0;
      const dupPayload: Record<string, unknown> = {
        org_id: orgId,
        name,
        sort_order: maxOrder + 10,
      };
      if (folderHierarchyOk) {
        dupPayload.parent_id = source.parent_id ?? null;
      }
      const { error } = await supabase.from('staff_resource_folders').insert(dupPayload);
      if (error) throw error;
      setFolderMsg(`Folder “${name}” created (empty copy).`);
      setFolderMenuOpenId(null);
      await load();
    } catch (e) {
      setFolderErr(e instanceof Error ? e.message : 'Could not duplicate folder.');
    } finally {
      setFolderBusy(false);
    }
  }

  async function saveRenameFolder() {
    const trimmed = renameFolderName.trim();
    if (!trimmed || !renameFolderId || folderBusy) return;
    setFolderBusy(true);
    setFolderErr(null);
    try {
      const { error } = await supabase
        .from('staff_resource_folders')
        .update({ name: trimmed })
        .eq('id', renameFolderId);
      if (error) throw error;
      setRenameFolderId(null);
      setRenameFolderName('');
      await load();
    } catch (e) {
      setFolderErr(e instanceof Error ? e.message : 'Could not rename folder.');
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
      const wasViewing = folderFilter === id;
      setFolderMenuOpenId(null);
      await load();
      if (wasViewing) {
        router.replace(resourcesHref({ archived: archiveOnly }));
      }
    } catch (e) {
      setFolderErr(e instanceof Error ? e.message : 'Could not delete folder.');
    } finally {
      setFolderBusy(false);
    }
  }

  async function applyMoveFile(targetFolderId: string | null) {
    if (!canManage || !moveFileRow || fileActionBusyId) return;
    const row = moveFileRow;
    if (targetFolderId === row.folder_id) {
      setMoveFileRow(null);
      return;
    }
    setFileActionBusyId(row.id);
    setErr(null);
    try {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from('staff_resources')
        .update({ folder_id: targetFolderId, updated_at: now })
        .eq('id', row.id);
      if (error) throw error;
      setMoveFileRow(null);
      setFileMenuOpenId(null);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not move file.');
    } finally {
      setFileActionBusyId(null);
    }
  }

  async function applyMoveFolder(newParentId: string | null) {
    if (!canManage || !moveFolderId || !folderHierarchyOk || folderBusy) return;
    const folderRow = folders.find((f) => f.id === moveFolderId);
    if (!folderRow) {
      setMoveFolderId(null);
      return;
    }
    const curParent = folderRow.parent_id === undefined ? null : folderRow.parent_id;
    if (newParentId === curParent) {
      setMoveFolderId(null);
      return;
    }
    setFolderBusy(true);
    setFolderErr(null);
    try {
      const { error } = await supabase
        .from('staff_resource_folders')
        .update({ parent_id: newParentId })
        .eq('id', moveFolderId);
      if (error) throw error;
      setMoveFolderId(null);
      setFolderMenuOpenId(null);
      await load();
    } catch (e) {
      setFolderErr(e instanceof Error ? e.message : 'Could not move folder.');
    } finally {
      setFolderBusy(false);
    }
  }

  async function archiveFolderTree(id: string, label: string) {
    if (!canManage || !folderHierarchyOk || folderBusy) return;
    if (
      !window.confirm(
        `Archive folder “${label}” and everything inside it? Files in this folder will move to Archived.`,
      )
    ) {
      return;
    }
    setFolderBusy(true);
    setFolderErr(null);
    try {
      const { error } = await supabase.rpc('archive_staff_resource_folder_tree', { p_folder_id: id });
      if (error) throw error;
      setFolderMenuOpenId(null);
      const wasViewing = folderFilter === id;
      await load();
      if (wasViewing) {
        router.replace(resourcesHref({ archived: archiveOnly }));
      }
    } catch (e) {
      setFolderErr(e instanceof Error ? e.message : 'Could not archive folder.');
    } finally {
      setFolderBusy(false);
    }
  }

  async function restoreFolderTree(id: string, label: string) {
    if (!canManage || !folderHierarchyOk || folderBusy) return;
    if (!window.confirm(`Restore folder “${label}” and un-archive its files?`)) return;
    setFolderBusy(true);
    setFolderErr(null);
    try {
      const { error } = await supabase.rpc('restore_staff_resource_folder_tree', { p_folder_id: id });
      if (error) throw error;
      setFolderMenuOpenId(null);
      await load();
    } catch (e) {
      setFolderErr(e instanceof Error ? e.message : 'Could not restore folder.');
    } finally {
      setFolderBusy(false);
    }
  }

  async function archiveResourceRow(r: StaffResourceRow) {
    if (!canManage || !archiveColumnOk || fileActionBusyId) return;
    setErr(null);
    setFileActionBusyId(r.id);
    setFileMenuOpenId(null);
    try {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from('staff_resources')
        .update({ archived_at: now, updated_at: now })
        .eq('id', r.id);
      if (error) throw error;
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not archive file.');
    } finally {
      setFileActionBusyId(null);
    }
  }

  async function restoreResourceRow(r: StaffResourceRow) {
    if (!canManage || !archiveColumnOk || fileActionBusyId) return;
    setErr(null);
    setFileActionBusyId(r.id);
    setFileMenuOpenId(null);
    try {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from('staff_resources')
        .update({ archived_at: null, updated_at: now })
        .eq('id', r.id);
      if (error) throw error;
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not restore file.');
    } finally {
      setFileActionBusyId(null);
    }
  }

  async function deleteResourceRow(r: StaffResourceRow) {
    if (!canManage || fileActionBusyId) return;
    if (
      !window.confirm(
        `Permanently delete “${r.title}”? The file will be removed from storage and cannot be recovered.`,
      )
    ) {
      return;
    }
    setErr(null);
    setFileActionBusyId(r.id);
    setFileMenuOpenId(null);
    try {
      let storagePath = r.storage_path ?? null;
      if (!storagePath) {
        const { data, error: fetchErr } = await supabase
          .from('staff_resources')
          .select('storage_path')
          .eq('id', r.id)
          .single();
        if (!fetchErr && data && (data as { storage_path?: string }).storage_path) {
          storagePath = String((data as { storage_path: string }).storage_path);
        }
      }
      const { error: rowErr } = await supabase.from('staff_resources').delete().eq('id', r.id);
      if (rowErr) throw rowErr;
      if (storagePath) {
        const { error: stErr } = await supabase.storage.from('staff-resources').remove([storagePath]);
        if (stErr) console.warn('staff-resources storage remove:', stErr.message);
      }
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not delete file.');
    } finally {
      setFileActionBusyId(null);
    }
  }

  const folderById = useMemo(() => new Map(folders.map((f) => [f.id, f])), [folders]);
  const childrenByParent = useMemo(() => buildChildrenByParentId(folders), [folders]);
  const excludedFolderMoveTargets = useMemo(() => {
    if (!moveFolderId) return new Set<string>();
    const desc = collectDescendantFolderIds(moveFolderId, childrenByParent);
    return new Set<string>([moveFolderId, ...desc]);
  }, [moveFolderId, childrenByParent]);

  const currentFolderLabel =
    folderFilter && folderFilter !== 'none'
      ? folderDisplayPath(folderFilter, folderById)
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

  const showFolderStrip =
    !searchActive && (folders.length > 0 || (!archiveOnly && canManage));

  const outlineHeaderBtn =
    'inline-flex h-9 shrink-0 items-center rounded-xl border border-[color-mix(in_oklab,var(--org-brand-border)_90%,var(--org-brand-primary)_10%)] bg-[var(--org-brand-bg)] px-3.5 text-[13px] font-medium text-[var(--org-brand-text)] shadow-[0_1px_0_color-mix(in_oklab,var(--org-brand-border)_40%,transparent)] transition hover:bg-[color-mix(in_oklab,var(--org-brand-primary)_8%,var(--org-brand-bg))]';

  const filterChipBase =
    'inline-flex h-9 max-w-[260px] items-center gap-1.5 truncate rounded-full px-3.5 text-[12.5px] font-medium transition';
  const filterChipInactive = `${filterChipBase} border border-[color-mix(in_oklab,var(--org-brand-border)_100%,transparent)] bg-[var(--org-brand-bg)] text-[var(--org-brand-text)] hover:bg-[color-mix(in_oklab,var(--org-brand-primary)_7%,var(--org-brand-bg))]`;
  const filterChipActive = `${filterChipBase} border border-transparent text-white shadow-sm`;
  const filterActiveStyle = { background: 'var(--org-brand-primary)', color: '#fff' } as const;

  function openNewFolderPanel() {
    setNewFolderPanelOpen(true);
    window.setTimeout(() => document.getElementById('resource-new-folder-input')?.focus(), 0);
  }

  const folderForOpenMenu = folderMenuOpenId ? folders.find((x) => x.id === folderMenuOpenId) : null;
  const fileRowForOpenMenu = fileMenuOpenId ? rows.find((r) => r.id === fileMenuOpenId) : null;
  const movingFolderRow = moveFolderId ? (folders.find((f) => f.id === moveFolderId) ?? null) : null;

  return (
    <div className="mx-auto max-w-7xl px-5 py-8 sm:px-6">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-authSerif text-3xl leading-tight text-[var(--org-brand-text)]">
            Resource library
            {archiveOnly ? (
              <span className="ml-2 text-lg font-normal text-[var(--org-brand-muted)]">· Archived</span>
            ) : null}
          </h1>
          <p className="mt-1 text-[13px] text-[var(--org-brand-muted)]">
            {archiveOnly
              ? 'Documents hidden from the main library. Restore or delete them from the resource page.'
              : 'Policies, handbooks, and reference files for your organisation.'}
          </p>
        </div>
        {canManage ? (
          <div className="flex flex-wrap items-center justify-end gap-2">
            {!archiveOnly ? (
              <button type="button" className={outlineHeaderBtn} onClick={openNewFolderPanel}>
                New folder
              </button>
            ) : null}
            {archiveColumnOk ? (
              <Link href={archiveOnly ? '/resources' : '/resources?archived=1'} className={outlineHeaderBtn}>
                {archiveOnly ? 'Active library' : 'Archived'}
              </Link>
            ) : null}
            <Link
              href={uploadHref}
              className={`${outlineHeaderBtn} border-[color-mix(in_oklab,var(--org-brand-primary)_35%,var(--org-brand-border))]`}
            >
              Upload file
            </Link>
          </div>
        ) : null}
      </div>

      {archiveOnly ? (
        <p className="mb-6 rounded-lg border border-amber-100 bg-amber-50/80 px-3 py-2 text-[13px] text-[#5c4a21]">
          Full-text search applies to the <strong className="font-semibold">active</strong> library only. Switch to
          Active library to search, or browse archived files below.
        </p>
      ) : (
        <div className="relative mb-8">
          <span className="pointer-events-none absolute left-3 top-1/2 z-[1] -translate-y-1/2 text-[var(--org-brand-muted)]">
            <SearchIcon className="h-4 w-4" />
          </span>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search files…"
            className="h-11 w-full rounded-xl border border-[color-mix(in_oklab,var(--org-brand-border)_95%,transparent)] bg-[var(--org-brand-bg)] py-2 pl-10 pr-3 text-[13px] text-[var(--org-brand-text)] outline-none placeholder:text-[var(--org-brand-muted)] shadow-[0_1px_0_color-mix(in_oklab,var(--org-brand-border)_35%,transparent)] focus:border-[var(--org-brand-primary)] focus:ring-[3px] focus:ring-[color-mix(in_oklab,var(--org-brand-primary)_18%,transparent)]"
            aria-label="Search files"
          />
        </div>
      )}

      {showFolderStrip ? (
        <div className="mb-10" id="resource-new-folder-anchor">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--org-brand-muted)]">
            Folders
          </p>
          <div className="-mx-1 flex gap-3 overflow-x-auto pb-1 pt-0.5 [scrollbar-width:thin]">
            {folders.map((f) => {
              const n = fileCountByFolderId.get(f.id) ?? 0;
              const pathLabel = folderDisplayPath(f.id, folderById);
              const nested = pathLabel.includes(' / ');
              const selected = folderFilter === f.id && !searchActive;
              const menuOpen = folderMenuOpenId === f.id;
              return (
                <div
                  key={f.id}
                  className={`relative flex min-w-[200px] max-w-[280px] shrink-0 rounded-2xl border transition ${
                    selected
                      ? 'border-[var(--org-brand-primary)] bg-[color-mix(in_oklab,var(--org-brand-primary)_9%,var(--org-brand-bg))] shadow-[0_1px_0_color-mix(in_oklab,var(--org-brand-primary)_25%,transparent)]'
                      : 'border-[color-mix(in_oklab,var(--org-brand-border)_90%,transparent)] bg-[var(--org-brand-bg)] hover:border-[color-mix(in_oklab,var(--org-brand-primary)_45%,var(--org-brand-border))]'
                  }`}
                >
                  <Link
                    href={resourcesHref({ archived: archiveOnly, folder: f.id })}
                    title={pathLabel}
                    className="flex min-w-0 flex-1 items-start gap-3 p-4 pr-2"
                  >
                    <span
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ring-1 ${
                        selected
                          ? 'bg-[color-mix(in_oklab,var(--org-brand-primary)_16%,white)] text-[var(--org-brand-primary)] ring-[color-mix(in_oklab,var(--org-brand-primary)_35%,transparent)]'
                          : 'bg-[color-mix(in_oklab,var(--org-brand-surface)_80%,white)] text-[var(--org-brand-primary)] ring-[color-mix(in_oklab,var(--org-brand-border)_55%,transparent)]'
                      }`}
                    >
                      <FolderIconLarge className="h-6 w-6" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold leading-snug text-[var(--org-brand-text)]">
                        {f.name}
                      </span>
                      {nested ? (
                        <span className="mt-0.5 block truncate text-[11px] leading-snug text-[var(--org-brand-muted)]">
                          {pathLabel.split(' / ').slice(0, -1).join(' · ')}
                        </span>
                      ) : null}
                      <span className="mt-0.5 block text-[12px] text-[var(--org-brand-muted)]">
                        {n === 0 ? 'Empty' : `${n} file${n === 1 ? '' : 's'}`}
                      </span>
                    </span>
                  </Link>
                  {canManage ? (
                    <div className="relative shrink-0 py-2 pr-2" data-resource-folder-menu>
                      <button
                        ref={menuOpen ? folderMenuAnchorRef : undefined}
                        type="button"
                        aria-expanded={menuOpen}
                        aria-haspopup="menu"
                        aria-label={`Actions for folder ${f.name}`}
                        disabled={folderBusy}
                        className="flex h-9 w-9 items-center justify-center rounded-xl text-[var(--org-brand-muted)] transition hover:bg-[color-mix(in_oklab,var(--org-brand-primary)_10%,var(--org-brand-bg))] hover:text-[var(--org-brand-text)] disabled:opacity-50"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setFileMenuOpenId(null);
                          setFolderMenuOpenId(menuOpen ? null : f.id);
                        }}
                      >
                        <MoreVertical className="h-5 w-5" strokeWidth={2} />
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            })}
            {canManage ? (
              <button
                type="button"
                onClick={openNewFolderPanel}
                className="flex min-w-[200px] max-w-[260px] shrink-0 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[color-mix(in_oklab,var(--org-brand-border)_85%,var(--org-brand-primary)_15%)] bg-[color-mix(in_oklab,var(--org-brand-surface)_35%,var(--org-brand-bg))] px-4 py-6 text-[13px] font-medium text-[var(--org-brand-muted)] transition hover:border-[var(--org-brand-primary)] hover:text-[var(--org-brand-text)]"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-full border border-[color-mix(in_oklab,var(--org-brand-border)_70%,transparent)] bg-[var(--org-brand-bg)] text-[var(--org-brand-primary)]">
                  <PlusIcon className="h-5 w-5" />
                </span>
                New folder
              </button>
            ) : null}
          </div>

          {canManage && newFolderPanelOpen ? (
            <form
              onSubmit={addFolder}
              className="mt-4 flex flex-wrap items-end gap-2 rounded-2xl border border-[color-mix(in_oklab,var(--org-brand-border)_90%,transparent)] bg-[var(--org-brand-bg)] p-3.5 shadow-[0_1px_0_color-mix(in_oklab,var(--org-brand-border)_35%,transparent)]"
            >
              <div className="min-w-[200px] flex-1">
                <label className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-[var(--org-brand-muted)]">
                  Folder name
                </label>
                <input
                  id="resource-new-folder-input"
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder="e.g. Policies"
                  className="h-9 w-full rounded-xl border border-[color-mix(in_oklab,var(--org-brand-border)_95%,transparent)] bg-[color-mix(in_oklab,var(--org-brand-surface)_40%,var(--org-brand-bg))] px-3 text-[13px] text-[var(--org-brand-text)] outline-none focus:border-[var(--org-brand-primary)] focus:ring-[3px] focus:ring-[color-mix(in_oklab,var(--org-brand-primary)_15%,transparent)]"
                />
              </div>
              <button
                type="submit"
                disabled={folderBusy || !newFolderName.trim()}
                className="h-9 rounded-xl px-4 text-[13px] font-medium text-white shadow-[0_6px_16px_color-mix(in_oklab,var(--org-brand-primary)_35%,transparent)] disabled:opacity-50"
                style={{ background: 'var(--org-brand-primary)' }}
              >
                {folderBusy ? '…' : 'Add folder'}
              </button>
              <button
                type="button"
                className="h-9 rounded-xl border border-[color-mix(in_oklab,var(--org-brand-border)_90%,transparent)] px-3 text-[13px] font-medium text-[var(--org-brand-muted)] hover:bg-[color-mix(in_oklab,var(--org-brand-primary)_6%,var(--org-brand-bg))]"
                onClick={() => setNewFolderPanelOpen(false)}
              >
                Cancel
              </button>
              {folderMsg ? (
                <p className="w-full text-[12px] text-[#15803d]" role="status">
                  {folderMsg}
                </p>
              ) : null}
              {folderErr ? (
                <p className="w-full text-[12px] text-red-800" role="alert">
                  {folderErr}
                </p>
              ) : null}
            </form>
          ) : null}

        </div>
      ) : null}

      {renameFolderId && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="fixed inset-0 flex items-center justify-center p-4"
              style={{ zIndex: RENAME_MODAL_Z }}
              role="dialog"
              aria-modal="true"
              aria-labelledby="resource-rename-folder-title"
            >
              <button
                type="button"
                className="absolute inset-0 bg-black/40"
                aria-label="Close"
                onClick={() => {
                  setRenameFolderId(null);
                  setRenameFolderName('');
                  setFolderErr(null);
                }}
              />
              <div className="campsite-paper relative z-10 w-full max-w-md rounded-2xl border border-[color-mix(in_oklab,var(--org-brand-border)_90%,transparent)] bg-[var(--org-brand-bg)] p-5 shadow-[0_24px_64px_rgba(0,0,0,0.18)]">
                <h2 id="resource-rename-folder-title" className="text-lg font-semibold text-[var(--org-brand-text)]">
                  Rename folder
                </h2>
                <label
                  className="mt-3 block text-[12px] font-medium text-[var(--org-brand-muted)]"
                  htmlFor="resource-rename-folder-input"
                >
                  Name
                </label>
                <input
                  id="resource-rename-folder-input"
                  value={renameFolderName}
                  onChange={(e) => setRenameFolderName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') void saveRenameFolder();
                  }}
                  className="mt-1.5 h-10 w-full rounded-xl border border-[color-mix(in_oklab,var(--org-brand-border)_95%,transparent)] bg-[color-mix(in_oklab,var(--org-brand-surface)_40%,var(--org-brand-bg))] px-3 text-[13px] text-[var(--org-brand-text)] outline-none focus:border-[var(--org-brand-primary)] focus:ring-[3px] focus:ring-[color-mix(in_oklab,var(--org-brand-primary)_15%,transparent)]"
                  autoFocus
                />
                {folderErr ? (
                  <p className="mt-2 text-[12px] text-red-800" role="alert">
                    {folderErr}
                  </p>
                ) : null}
                <div className="mt-5 flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    className="h-9 rounded-xl border border-[color-mix(in_oklab,var(--org-brand-border)_90%,transparent)] px-4 text-[13px] font-medium text-[var(--org-brand-muted)] hover:bg-[color-mix(in_oklab,var(--org-brand-primary)_6%,var(--org-brand-bg))]"
                    onClick={() => {
                      setRenameFolderId(null);
                      setRenameFolderName('');
                      setFolderErr(null);
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={folderBusy || !renameFolderName.trim()}
                    className="h-9 rounded-xl px-4 text-[13px] font-medium text-white disabled:opacity-50"
                    style={{ background: 'var(--org-brand-primary)' }}
                    onClick={() => void saveRenameFolder()}
                  >
                    {folderBusy ? '…' : 'Save'}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {moveFileRow && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="fixed inset-0 flex items-center justify-center p-4"
              style={{ zIndex: RENAME_MODAL_Z }}
              role="dialog"
              aria-modal="true"
              aria-labelledby="resource-move-file-title"
            >
              <button
                type="button"
                className="absolute inset-0 bg-black/40"
                aria-label="Close"
                onClick={() => setMoveFileRow(null)}
              />
              <div className="campsite-paper relative z-10 flex max-h-[min(520px,85vh)] w-full max-w-md flex-col rounded-2xl border border-[color-mix(in_oklab,var(--org-brand-border)_90%,transparent)] bg-[var(--org-brand-bg)] shadow-[0_24px_64px_rgba(0,0,0,0.18)]">
                <div className="border-b border-[color-mix(in_oklab,var(--org-brand-border)_70%,transparent)] p-5 pb-3">
                  <h2 id="resource-move-file-title" className="text-lg font-semibold text-[var(--org-brand-text)]">
                    Move file
                  </h2>
                  <p className="mt-1 text-[13px] text-[var(--org-brand-muted)] line-clamp-2">{moveFileRow.title}</p>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
                  {moveFileRow.folder_id ? (
                    <button
                      type="button"
                      disabled={Boolean(fileActionBusyId)}
                      className="mb-1 flex w-full rounded-xl px-3 py-2.5 text-left text-[13px] text-[var(--org-brand-text)] hover:bg-[color-mix(in_oklab,var(--org-brand-primary)_8%,var(--org-brand-bg))] disabled:opacity-50"
                      onClick={() => void applyMoveFile(null)}
                    >
                      <span className="font-medium">Uncategorised</span>
                      <span className="ml-auto text-[12px] text-[var(--org-brand-muted)]">No folder</span>
                    </button>
                  ) : null}
                  {folders
                    .filter((f) => f.id !== moveFileRow.folder_id)
                    .map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        disabled={Boolean(fileActionBusyId)}
                        className="mb-1 flex w-full rounded-xl px-3 py-2.5 text-left text-[13px] text-[var(--org-brand-text)] hover:bg-[color-mix(in_oklab,var(--org-brand-primary)_8%,var(--org-brand-bg))] disabled:opacity-50"
                        onClick={() => void applyMoveFile(f.id)}
                      >
                        <span className="min-w-0 flex-1 truncate font-medium">{folderDisplayPath(f.id, folderById)}</span>
                      </button>
                    ))}
                </div>
                <div className="border-t border-[color-mix(in_oklab,var(--org-brand-border)_70%,transparent)] p-3">
                  <button
                    type="button"
                    className="h-9 w-full rounded-xl border border-[color-mix(in_oklab,var(--org-brand-border)_90%,transparent)] text-[13px] font-medium text-[var(--org-brand-muted)] hover:bg-[color-mix(in_oklab,var(--org-brand-primary)_6%,var(--org-brand-bg))]"
                    onClick={() => setMoveFileRow(null)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {moveFolderId && movingFolderRow && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="fixed inset-0 flex items-center justify-center p-4"
              style={{ zIndex: RENAME_MODAL_Z }}
              role="dialog"
              aria-modal="true"
              aria-labelledby="resource-move-folder-title"
            >
              <button
                type="button"
                className="absolute inset-0 bg-black/40"
                aria-label="Close"
                onClick={() => setMoveFolderId(null)}
              />
              <div className="campsite-paper relative z-10 flex max-h-[min(520px,85vh)] w-full max-w-md flex-col rounded-2xl border border-[color-mix(in_oklab,var(--org-brand-border)_90%,transparent)] bg-[var(--org-brand-bg)] shadow-[0_24px_64px_rgba(0,0,0,0.18)]">
                <div className="border-b border-[color-mix(in_oklab,var(--org-brand-border)_70%,transparent)] p-5 pb-3">
                  <h2 id="resource-move-folder-title" className="text-lg font-semibold text-[var(--org-brand-text)]">
                    Move folder into…
                  </h2>
                  <p className="mt-1 text-[13px] text-[var(--org-brand-muted)] line-clamp-2">
                    {folderDisplayPath(movingFolderRow.id, folderById)}
                  </p>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
                  {(movingFolderRow.parent_id ?? null) !== null ? (
                    <button
                      type="button"
                      disabled={folderBusy}
                      className="mb-1 flex w-full rounded-xl px-3 py-2.5 text-left text-[13px] text-[var(--org-brand-text)] hover:bg-[color-mix(in_oklab,var(--org-brand-primary)_8%,var(--org-brand-bg))] disabled:opacity-50"
                      onClick={() => void applyMoveFolder(null)}
                    >
                      <span className="font-medium">Top level</span>
                      <span className="ml-auto text-[12px] text-[var(--org-brand-muted)]">No parent</span>
                    </button>
                  ) : null}
                  {folders
                    .filter((f) => !excludedFolderMoveTargets.has(f.id))
                    .map((f) => {
                      const curParent = movingFolderRow.parent_id ?? null;
                      const isCurrent = curParent === f.id;
                      return (
                        <button
                          key={f.id}
                          type="button"
                          disabled={folderBusy || isCurrent}
                          className="mb-1 flex w-full rounded-xl px-3 py-2.5 text-left text-[13px] text-[var(--org-brand-text)] hover:bg-[color-mix(in_oklab,var(--org-brand-primary)_8%,var(--org-brand-bg))] disabled:cursor-not-allowed disabled:opacity-40"
                          onClick={() => void applyMoveFolder(f.id)}
                        >
                          <span className="min-w-0 flex-1 truncate font-medium">{folderDisplayPath(f.id, folderById)}</span>
                          {isCurrent ? (
                            <span className="ml-2 shrink-0 text-[11px] text-[var(--org-brand-muted)]">Current</span>
                          ) : null}
                        </button>
                      );
                    })}
                </div>
                <div className="border-t border-[color-mix(in_oklab,var(--org-brand-border)_70%,transparent)] p-3">
                  <button
                    type="button"
                    className="h-9 w-full rounded-xl border border-[color-mix(in_oklab,var(--org-brand-border)_90%,transparent)] text-[13px] font-medium text-[var(--org-brand-muted)] hover:bg-[color-mix(in_oklab,var(--org-brand-primary)_6%,var(--org-brand-bg))]"
                    onClick={() => setMoveFolderId(null)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {folderMenuOpenId && folderForOpenMenu && dropdownPos && typeof document !== 'undefined'
        ? createPortal(
            <div
              role="menu"
              data-resource-folder-menu
              className="campsite-paper min-w-[200px] rounded-xl border border-[color-mix(in_oklab,var(--org-brand-border)_90%,transparent)] bg-[var(--org-brand-bg)] py-1 shadow-[0_16px_50px_rgba(0,0,0,0.16)]"
              style={{
                position: 'fixed',
                zIndex: DROPDOWN_PORTAL_Z,
                right: dropdownPos.right,
                ...(dropdownPos.placement === 'below'
                  ? { top: dropdownPos.top }
                  : { bottom: dropdownPos.bottom }),
              }}
            >
              <button
                type="button"
                role="menuitem"
                className="flex w-full px-3 py-2 text-left text-[13px] text-[var(--org-brand-text)] hover:bg-[color-mix(in_oklab,var(--org-brand-primary)_8%,var(--org-brand-bg))]"
                onClick={() => {
                  setFolderErr(null);
                  setFileMenuOpenId(null);
                  setRenameFolderId(folderForOpenMenu.id);
                  setRenameFolderName(folderForOpenMenu.name);
                  setFolderMenuOpenId(null);
                }}
              >
                Rename…
              </button>
              {folderHierarchyOk ? (
                <button
                  type="button"
                  role="menuitem"
                  disabled={folderBusy}
                  className="flex w-full px-3 py-2 text-left text-[13px] text-[var(--org-brand-text)] hover:bg-[color-mix(in_oklab,var(--org-brand-primary)_8%,var(--org-brand-bg))] disabled:cursor-not-allowed disabled:opacity-40"
                  onClick={() => {
                    setFolderErr(null);
                    setMoveFolderId(folderForOpenMenu.id);
                    setFolderMenuOpenId(null);
                  }}
                >
                  Move into…
                </button>
              ) : null}
              {!archiveOnly ? (
                <button
                  type="button"
                  role="menuitem"
                  disabled={folderBusy}
                  className="flex w-full px-3 py-2 text-left text-[13px] text-[var(--org-brand-text)] hover:bg-[color-mix(in_oklab,var(--org-brand-primary)_8%,var(--org-brand-bg))] disabled:cursor-not-allowed disabled:opacity-40"
                  onClick={() => void duplicateFolderRow(folderForOpenMenu)}
                >
                  Duplicate folder
                </button>
              ) : null}
              {folderHierarchyOk && !archiveOnly ? (
                <button
                  type="button"
                  role="menuitem"
                  disabled={folderBusy}
                  className="flex w-full px-3 py-2 text-left text-[13px] text-[var(--org-brand-text)] hover:bg-[color-mix(in_oklab,var(--org-brand-primary)_8%,var(--org-brand-bg))] disabled:cursor-not-allowed disabled:opacity-40"
                  onClick={() => void archiveFolderTree(folderForOpenMenu.id, folderForOpenMenu.name)}
                >
                  Archive folder…
                </button>
              ) : null}
              {folderHierarchyOk && archiveOnly ? (
                <button
                  type="button"
                  role="menuitem"
                  disabled={folderBusy}
                  className="flex w-full px-3 py-2 text-left text-[13px] text-[var(--org-brand-text)] hover:bg-[color-mix(in_oklab,var(--org-brand-primary)_8%,var(--org-brand-bg))] disabled:cursor-not-allowed disabled:opacity-40"
                  onClick={() => void restoreFolderTree(folderForOpenMenu.id, folderForOpenMenu.name)}
                >
                  Restore folder…
                </button>
              ) : null}
              <button
                type="button"
                role="menuitem"
                className="flex w-full px-3 py-2 text-left text-[13px] font-medium text-red-700 hover:bg-red-50"
                onClick={() => void deleteFolder(folderForOpenMenu.id, folderForOpenMenu.name)}
              >
                Delete folder…
              </button>
            </div>,
            document.body,
          )
        : null}

      {fileMenuOpenId && fileRowForOpenMenu && dropdownPos && typeof document !== 'undefined'
        ? createPortal(
            <div
              role="menu"
              data-resource-file-menu
              className="campsite-paper min-w-[200px] rounded-xl border border-[color-mix(in_oklab,var(--org-brand-border)_90%,transparent)] bg-[var(--org-brand-bg)] py-1 shadow-[0_16px_50px_rgba(0,0,0,0.16)]"
              style={{
                position: 'fixed',
                zIndex: DROPDOWN_PORTAL_Z,
                right: dropdownPos.right,
                ...(dropdownPos.placement === 'below'
                  ? { top: dropdownPos.top }
                  : { bottom: dropdownPos.bottom }),
              }}
            >
              {!archiveOnly ? (
                <button
                  type="button"
                  role="menuitem"
                  disabled={Boolean(fileActionBusyId)}
                  className="flex w-full px-3 py-2 text-left text-[13px] text-[var(--org-brand-text)] hover:bg-[color-mix(in_oklab,var(--org-brand-primary)_8%,var(--org-brand-bg))] disabled:cursor-not-allowed disabled:opacity-40"
                  onClick={() => {
                    setMoveFileRow(fileRowForOpenMenu);
                    setFileMenuOpenId(null);
                  }}
                >
                  Move to folder…
                </button>
              ) : null}
              {!archiveOnly && archiveColumnOk ? (
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full px-3 py-2 text-left text-[13px] text-[var(--org-brand-text)] hover:bg-[color-mix(in_oklab,var(--org-brand-primary)_8%,var(--org-brand-bg))]"
                  onClick={() => void archiveResourceRow(fileRowForOpenMenu)}
                >
                  Archive
                </button>
              ) : null}
              {archiveOnly && archiveColumnOk ? (
                <button
                  type="button"
                  role="menuitem"
                  className="flex w-full px-3 py-2 text-left text-[13px] text-[var(--org-brand-text)] hover:bg-[color-mix(in_oklab,var(--org-brand-primary)_8%,var(--org-brand-bg))]"
                  onClick={() => void restoreResourceRow(fileRowForOpenMenu)}
                >
                  Restore
                </button>
              ) : null}
              <button
                type="button"
                role="menuitem"
                className="flex w-full px-3 py-2 text-left text-[13px] font-medium text-red-700 hover:bg-red-50"
                onClick={() => void deleteResourceRow(fileRowForOpenMenu)}
              >
                Delete permanently…
              </button>
            </div>,
            document.body,
          )
        : null}

      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--org-brand-muted)]">Files</p>
          {!busy ? (
            <span className="text-[12.5px] tabular-nums text-[var(--org-brand-muted)]">{rows.length} total</span>
          ) : null}
        </div>
        {!archiveOnly ? (
          <ExperienceLensBar
            ariaLabel="Resource files layout"
            value={fileLens}
            onChange={persistFileLens}
            choices={[
              { value: 'list', label: 'List' },
              { value: 'grid', label: 'Tiles' },
            ]}
            className="shrink-0 border-[color-mix(in_oklab,var(--org-brand-border)_90%,transparent)] bg-[color-mix(in_oklab,var(--org-brand-surface)_65%,var(--org-brand-bg))]"
          />
        ) : null}
      </div>

      {!archiveOnly ? (
        <div className="mb-4 flex flex-wrap gap-2">
          <Link
            href={resourcesHref({ archived: archiveOnly })}
            className={folderFilter === null && !searchActive ? filterChipActive : filterChipInactive}
            style={folderFilter === null && !searchActive ? filterActiveStyle : undefined}
          >
            <FolderIconSmall
              className={
                folderFilter === null && !searchActive ? 'text-white' : 'text-[var(--org-brand-primary)]'
              }
            />
            All
          </Link>
          <Link
            href={resourcesHref({ archived: archiveOnly, folder: 'none' })}
            className={folderFilter === 'none' && !searchActive ? filterChipActive : filterChipInactive}
            style={folderFilter === 'none' && !searchActive ? filterActiveStyle : undefined}
          >
            <FolderOutlineIconSmall
              className={
                folderFilter === 'none' && !searchActive ? 'text-white' : 'text-[var(--org-brand-muted)]'
              }
            />
            Uncategorised
          </Link>
          {folders.map((f) => {
            const chipPath = folderDisplayPath(f.id, folderById);
            return (
              <Link
                key={f.id}
                href={resourcesHref({ archived: archiveOnly, folder: f.id })}
                className={folderFilter === f.id && !searchActive ? filterChipActive : filterChipInactive}
                style={folderFilter === f.id && !searchActive ? filterActiveStyle : undefined}
                title={chipPath}
              >
                <FolderIconSmall
                  className={
                    folderFilter === f.id && !searchActive ? 'text-white' : 'text-[var(--org-brand-primary)]'
                  }
                />
                <span className="truncate">{chipPath}</span>
              </Link>
            );
          })}
        </div>
      ) : null}

      {currentFolderLabel && !searchActive && folderFilter !== null ? (
        <p className="mb-4 text-[13px] text-[var(--org-brand-muted)]">
          Viewing{' '}
          <span className="font-medium text-[var(--org-brand-text)]">{currentFolderLabel}</span>
          {' · '}
          <Link href={resourcesHref({ archived: archiveOnly })} className="text-[var(--org-brand-primary)] underline">
            Show all files
          </Link>
        </p>
      ) : null}

      {err ? (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-800">{err}</p>
      ) : null}

      {busy ? (
        <p className="text-[13px] text-[var(--org-brand-muted)]">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-[color-mix(in_oklab,var(--org-brand-border)_90%,transparent)] bg-[var(--org-brand-bg)] px-4 py-8 text-center text-[13px] text-[var(--org-brand-muted)] shadow-[0_1px_0_color-mix(in_oklab,var(--org-brand-border)_30%,transparent)]">
          {searchActive
            ? 'No resources match your search.'
            : archiveOnly
              ? 'No archived resources.'
              : 'No resources yet.'}
          {canManage && !searchActive && !archiveOnly ? (
            <>
              {' '}
              <Link href={uploadHref} className="font-medium text-[var(--org-brand-primary)] underline">
                Upload the first file
              </Link>
              .
            </>
          ) : null}
        </div>
      ) : fileLens === 'grid' ? (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((r) => {
            const folderCategory =
              r.folder_id && folderById.has(r.folder_id)
                ? folderDisplayPath(r.folder_id, folderById)
                : (r.staff_resource_folders?.name ?? 'Uncategorised');
            return (
              <li key={r.id}>
                <ResourceGridCard
                  r={r}
                  folderCategory={folderCategory}
                  canManage={canManage}
                  menuOpen={fileMenuOpenId === r.id}
                  actionBusy={fileActionBusyId === r.id}
                  menuAnchorRef={fileMenuOpenId === r.id ? fileMenuAnchorRef : undefined}
                  onToggleMenu={() => {
                    setFolderMenuOpenId(null);
                    setFileMenuOpenId((prev) => (prev === r.id ? null : r.id));
                  }}
                />
              </li>
            );
          })}
        </ul>
      ) : (
        <ul className="divide-y divide-[color-mix(in_oklab,var(--org-brand-border)_45%,transparent)] overflow-visible rounded-2xl border border-[color-mix(in_oklab,var(--org-brand-border)_90%,transparent)] bg-[var(--org-brand-bg)] shadow-[0_1px_0_color-mix(in_oklab,var(--org-brand-border)_35%,transparent)]">
          {rows.map((r) => {
            const folderCategory =
              r.folder_id && folderById.has(r.folder_id)
                ? folderDisplayPath(r.folder_id, folderById)
                : (r.staff_resource_folders?.name ?? 'Uncategorised');
            return (
              <ResourceRow
                key={r.id}
                r={r}
                folderCategory={folderCategory}
                canManage={canManage}
                menuOpen={fileMenuOpenId === r.id}
                actionBusy={fileActionBusyId === r.id}
                menuAnchorRef={fileMenuOpenId === r.id ? fileMenuAnchorRef : undefined}
                onToggleMenu={() => {
                  setFolderMenuOpenId(null);
                  setFileMenuOpenId((prev) => (prev === r.id ? null : r.id));
                }}
              />
            );
          })}
        </ul>
      )}
    </div>
  );
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path strokeLinecap="round" d="M20 20l-3.5-3.5" />
    </svg>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path strokeLinecap="round" d="M12 5v14M5 12h14" />
    </svg>
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

function ResourceGridCard({
  r,
  folderCategory,
  canManage,
  menuOpen,
  actionBusy,
  menuAnchorRef,
  onToggleMenu,
}: {
  r: StaffResourceRow;
  folderCategory: string;
  canManage: boolean;
  menuOpen: boolean;
  actionBusy: boolean;
  menuAnchorRef?: RefObject<HTMLButtonElement | null>;
  onToggleMenu: () => void;
}) {
  return (
    <div className="relative h-full min-h-[120px] rounded-2xl border border-[color-mix(in_oklab,var(--org-brand-border)_90%,transparent)] bg-[var(--org-brand-bg)] shadow-[0_1px_0_color-mix(in_oklab,var(--org-brand-border)_35%,transparent)] transition hover:-translate-y-px hover:border-[color-mix(in_oklab,var(--org-brand-primary)_35%,var(--org-brand-border))] hover:shadow-[0_10px_24px_color-mix(in_oklab,var(--org-brand-border)_45%,transparent)]">
      <Link
        href={`/resources/${r.id}`}
        className="flex h-full min-h-[120px] flex-col p-4 pr-12"
      >
        <p className="text-[14px] font-semibold leading-snug text-[var(--org-brand-text)]">{r.title}</p>
        {r.description ? (
          <p className="mt-1 line-clamp-3 text-[12.5px] leading-relaxed text-[var(--org-brand-muted)]">{r.description}</p>
        ) : null}
        <p className="mt-auto pt-3 text-[11.5px] text-[var(--org-brand-muted)]">
          {folderCategory !== 'Uncategorised' ? `${folderCategory} · ` : null}
          {formatBytes(r.byte_size)}
        </p>
      </Link>
      {canManage ? (
        <div className="absolute right-2 top-2" data-resource-file-menu>
          <button
            ref={menuAnchorRef}
            type="button"
            aria-expanded={menuOpen}
            aria-haspopup="menu"
            aria-label={`Actions for ${r.title}`}
            disabled={actionBusy}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-[var(--org-brand-muted)] transition hover:bg-[color-mix(in_oklab,var(--org-brand-primary)_10%,var(--org-brand-bg))] hover:text-[var(--org-brand-text)] disabled:opacity-50"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onToggleMenu();
            }}
          >
            <MoreVertical className="h-5 w-5" strokeWidth={2} />
          </button>
        </div>
      ) : null}
    </div>
  );
}

function fileKindLabel(mime: string, fileName: string): string {
  const ext = fileName.includes('.') ? fileName.split('.').pop() : '';
  if (ext && /^[a-zA-Z0-9]{1,5}$/.test(ext)) {
    const u = ext.toUpperCase();
    return u.length <= 4 ? u : u.slice(0, 4);
  }
  const m = mime.toLowerCase();
  if (m.includes('pdf')) return 'PDF';
  if (m.includes('png')) return 'PNG';
  if (m.includes('jpeg') || m.includes('jpg')) return 'JPG';
  if (m.includes('word') || m.includes('msword')) return 'DOC';
  if (m.includes('sheet') || m.includes('excel')) return 'XLS';
  if (m.includes('presentation') || m.includes('powerpoint')) return 'PPT';
  return 'FILE';
}

function ResourceRow({
  r,
  folderCategory,
  canManage,
  menuOpen,
  actionBusy,
  menuAnchorRef,
  onToggleMenu,
}: {
  r: StaffResourceRow;
  folderCategory: string;
  canManage: boolean;
  menuOpen: boolean;
  actionBusy: boolean;
  menuAnchorRef?: RefObject<HTMLButtonElement | null>;
  onToggleMenu: () => void;
}) {
  const category = folderCategory;
  const kind = fileKindLabel(r.mime_type, r.file_name);
  const updated = new Date(r.updated_at);
  const updatedLabel = Number.isNaN(updated.getTime())
    ? ''
    : `Updated ${updated.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}`;

  return (
    <li className="relative">
      <div className="flex items-stretch">
        <Link
          href={`/resources/${r.id}`}
          className="flex min-w-0 flex-1 items-start gap-3 px-4 py-3.5 pr-2 transition hover:bg-[color-mix(in_oklab,var(--org-brand-primary)_5%,var(--org-brand-bg))]"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-[color-mix(in_oklab,var(--org-brand-border)_75%,transparent)] bg-[color-mix(in_oklab,var(--org-brand-surface)_55%,var(--org-brand-bg))] text-[10px] font-bold tracking-wide text-[var(--org-brand-muted)]">
            {kind}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2 gap-y-1">
              <span className="text-[14px] font-semibold leading-snug text-[var(--org-brand-text)]">{r.title}</span>
              <span className="rounded-full border border-[color-mix(in_oklab,var(--org-brand-primary)_28%,var(--org-brand-border))] bg-[color-mix(in_oklab,var(--org-brand-primary)_10%,var(--org-brand-bg))] px-2 py-0.5 text-[11px] font-medium text-[var(--org-brand-primary)]">
                {category}
              </span>
            </span>
            <p className="mt-1 text-[12px] text-[var(--org-brand-muted)]">
              {r.file_name} · {formatBytes(r.byte_size)}
              {updatedLabel ? ` · ${updatedLabel}` : ''}
            </p>
          </span>
        </Link>
        {canManage ? (
          <div className="relative flex shrink-0 items-start py-2 pr-2" data-resource-file-menu>
            <button
              ref={menuAnchorRef}
              type="button"
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              aria-label={`Actions for ${r.title}`}
              disabled={actionBusy}
              className="flex h-9 w-9 items-center justify-center rounded-xl text-[var(--org-brand-muted)] transition hover:bg-[color-mix(in_oklab,var(--org-brand-primary)_10%,var(--org-brand-bg))] hover:text-[var(--org-brand-text)] disabled:opacity-50"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onToggleMenu();
              }}
            >
              <MoreVertical className="h-5 w-5" strokeWidth={2} />
            </button>
          </div>
        ) : null}
      </div>
    </li>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
