'use client';

import { ResourceLibraryAssistant } from '@/components/resources/ResourceLibraryAssistant';
import { createClient } from '@/lib/supabase/client';
import { isMissingArchivedAtColumn, isMissingFolderHierarchyColumn } from '@/lib/staffResourceArchiveCompat';
import { parseStaffResourceFolderEmbed } from '@/lib/staffResourceFolderEmbed';
import { campusSurface } from '@campsite/ui/web';
import { FolderArchive, MoreVertical, Search, Upload, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import type { PostgrestError } from '@supabase/supabase-js';
import type { RefObject } from 'react';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

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
  initialScoutPrompt = '',
  initialFileSearch = '',
  viewArchived = false,
}: {
  orgId: string;
  canManage: boolean;
  /** `null` = all (grouped by folder); UUID = that folder; `none` = uncategorised only */
  folderFilter: string | null | 'none';
  /** Prefills Scout (URL `?q=`). */
  initialScoutPrompt?: string;
  /** Initial library file search (URL `?search=`). */
  initialFileSearch?: string;
  /** Managers only: show archived documents instead of the active library (from `?archived=1`). */
  viewArchived?: boolean;
}) {
  const supabase = useMemo(() => createClient(), []);
  const searchParams = useSearchParams() ?? new URLSearchParams();
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
  const urlFileSearch = searchParams.get('search') ?? '';

  const [fileSearchInput, setFileSearchInput] = useState(initialFileSearch);
  const [debouncedFileSearch, setDebouncedFileSearch] = useState(initialFileSearch.trim());

  useEffect(() => {
    setFileSearchInput(urlFileSearch);
    setDebouncedFileSearch(urlFileSearch.trim());
  }, [urlFileSearch]);

  useEffect(() => {
    const id = window.setTimeout(() => setDebouncedFileSearch(fileSearchInput.trim()), 300);
    return () => window.clearTimeout(id);
  }, [fileSearchInput]);

  const fileSearchActive = debouncedFileSearch.trim().length >= 2;
  const [fileSearchPanelOpen, setFileSearchPanelOpen] = useState(false);
  const fileSearchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (urlFileSearch.trim().length >= 2) setFileSearchPanelOpen(true);
  }, [urlFileSearch]);

  useEffect(() => {
    if (!fileSearchPanelOpen) return;
    const id = window.requestAnimationFrame(() => fileSearchInputRef.current?.focus());
    return () => window.cancelAnimationFrame(id);
  }, [fileSearchPanelOpen]);

  useEffect(() => {
    if (!fileSearchPanelOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setFileSearchPanelOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [fileSearchPanelOpen]);

  const syncFileSearchQueryParam = useCallback(
    (term: string) => {
      const p = new URLSearchParams(searchParams.toString());
      const t = term.trim();
      if (t.length >= 2) p.set('search', t);
      else p.delete('search');
      const s = p.toString();
      router.replace(s ? `/resources?${s}` : '/resources');
    },
    [router, searchParams],
  );

  useEffect(() => {
    const t = debouncedFileSearch.trim();
    const inUrl = (searchParams.get('search') ?? '').trim();
    const wantInUrl = t.length >= 2 ? t : '';
    if (inUrl === wantInUrl) return;
    syncFileSearchQueryParam(t);
  }, [debouncedFileSearch, searchParams, syncFileSearchQueryParam]);

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

  const archiveOnly = Boolean(canManage && viewArchived && archiveColumnOk);

  const resourcesHref = useCallback(
    (opts: { folder?: string | null | 'none'; archived?: boolean; clearFileSearch?: boolean } = {}) => {
      const p = new URLSearchParams(searchParams.toString());
      if (opts.archived !== undefined) {
        if (opts.archived) p.set('archived', '1');
        else p.delete('archived');
      }
      if (opts.folder !== undefined) {
        if (opts.folder === 'none') p.set('folder', 'none');
        else if (opts.folder === null) p.delete('folder');
        else p.set('folder', opts.folder);
      }
      if (opts.clearFileSearch) p.delete('search');
      const s = p.toString();
      return s ? `/resources?${s}` : '/resources';
    },
    [searchParams],
  );

  const fetchFolderRows = useCallback(
    async (mode: 'match_view' | 'active_only'): Promise<StaffResourceFolderRow[]> => {
      const q = folderHierarchyOk
        ? (() => {
            const wantArchivedFolders = mode === 'match_view' && archiveOnly;
            let base = supabase
              .from('staff_resource_folders')
              .select('id, name, sort_order, parent_id, archived_at')
              .eq('org_id', orgId);
            base = wantArchivedFolders
              ? base.not('archived_at', 'is', null)
              : base.is('archived_at', null);
            return base;
          })()
        : supabase
            .from('staff_resource_folders')
            .select('id, name, sort_order')
            .eq('org_id', orgId);
      const { data, error } = await q
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true });
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
        /* folders load failure  still try resources; keep prior folders */
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
      } else {
        const term = debouncedFileSearch.trim();
        if (!archiveOnly && term.length >= 2) {
          const { data, error } = await supabase.rpc('search_staff_resources', {
            q: term,
            limit_n: 80,
          });
          if (error) throw error;
          const raw = (data ?? []) as Record<string, unknown>[];
          const byFolderId = new Map(folderRows.map((f) => [f.id, f]));
          let list: StaffResourceRow[] = raw.map((r) => {
            const folderId = r.folder_id != null ? String(r.folder_id) : null;
            const folderMeta =
              folderId && byFolderId.has(folderId)
                ? { id: folderId, name: byFolderId.get(folderId)!.name }
                : null;
            return {
              id: String(r.id ?? ''),
              title: String(r.title ?? ''),
              description: r.description != null ? String(r.description) : '',
              file_name: String(r.file_name ?? ''),
              mime_type: String(r.mime_type ?? ''),
              byte_size: Number(r.byte_size ?? 0),
              updated_at: String(r.updated_at ?? ''),
              storage_path: r.storage_path != null && String(r.storage_path) !== '' ? String(r.storage_path) : null,
              archived_at: r.archived_at != null ? String(r.archived_at) : null,
              folder_id: folderId,
              staff_resource_folders: folderMeta,
            };
          });
          if (folderFilter === 'none') {
            list = list.filter((row) => !row.folder_id);
          } else if (folderFilter) {
            list = list.filter((row) => row.folder_id === folderFilter);
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
    folderFilter,
    fetchFolderRows,
    archiveOnly,
    archiveColumnOk,
    canManage,
    viewArchived,
    folderHierarchyOk,
    debouncedFileSearch,
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
        router.replace(resourcesHref({ folder: null, clearFileSearch: true }));
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
        router.replace(resourcesHref({ folder: null, clearFileSearch: true }));
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

  /** Sidebar + folder affordances stay visible while searching (matches library layout expectations). */
  const showFolderStrip = folders.length > 0 || (!archiveOnly && canManage);

  const outlineHeaderBtn =
    'inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-[#d8d8d8] bg-white px-4 text-[13px] font-medium text-[#121212] transition-colors hover:bg-[#f8f8f8]';

  const headerSearchIconBtn =
    'relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#d8d8d8] bg-white text-[#121212] transition-colors hover:bg-[#f8f8f8]';

  const primaryHeaderBtn =
    'inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg border border-transparent bg-[#121212] px-4 text-[13px] font-medium text-[#faf9f6] transition-opacity hover:opacity-90';

  const filterChipBase =
    'inline-flex h-9 max-w-[220px] items-center justify-center truncate rounded-full px-4 text-[12.5px] font-medium transition';
  const filterChipInactive = `${filterChipBase} border border-[color-mix(in_oklab,var(--org-brand-border)_100%,transparent)] bg-[var(--org-brand-bg)] text-[var(--org-brand-text)] hover:bg-[color-mix(in_oklab,var(--org-brand-border)_35%,var(--org-brand-bg))]`;
  const filterChipActive = `${filterChipBase} border border-transparent shadow-sm`;
  const filterActiveStyle = {
    background: 'var(--org-brand-text)',
    color: 'var(--org-brand-bg)',
  } as const;

  function openNewFolderPanel() {
    setNewFolderPanelOpen(true);
    window.setTimeout(() => document.getElementById('resource-new-folder-input')?.focus(), 0);
  }

  const folderForOpenMenu = folderMenuOpenId ? folders.find((x) => x.id === folderMenuOpenId) : null;
  const fileRowForOpenMenu = fileMenuOpenId ? rows.find((r) => r.id === fileMenuOpenId) : null;
  const movingFolderRow = moveFolderId ? (folders.find((f) => f.id === moveFolderId) ?? null) : null;

  return (
    <div className="font-sans mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-xl">
          <h1 className="campsite-title text-[var(--org-brand-text)]">
            Resource library
            {archiveOnly ? (
              <span className="ml-2 text-[var(--campsite-font-subheading)] font-normal text-[var(--org-brand-muted)]">
                · Archived
              </span>
            ) : null}
          </h1>
          <p className="campsite-body mt-2 text-[var(--org-brand-muted)]">
            {archiveOnly
              ? 'Documents hidden from the main library. Restore or delete them from the resource page.'
              : 'Search policies, handbooks, files, and internal knowledge in one place.'}
          </p>
        </div>
        {!archiveOnly || canManage ? (
          <div className="flex min-w-0 flex-wrap items-center justify-end gap-2.5">
            {!archiveOnly ? (
              <>
                {!fileSearchPanelOpen ? (
                  <button
                    type="button"
                    className={headerSearchIconBtn}
                    aria-label="Search files"
                    aria-expanded={false}
                    title="Search files"
                    onClick={() => setFileSearchPanelOpen(true)}
                  >
                    <Search className="size-[18px]" strokeWidth={2} aria-hidden />
                    {fileSearchActive ? (
                      <span
                        className="absolute right-2 top-2 size-2 rounded-full bg-[var(--org-brand-text)] ring-2 ring-[var(--org-brand-bg)]"
                        aria-hidden
                      />
                    ) : null}
                  </button>
                ) : (
                  <div className="flex min-w-0 max-w-full items-center gap-1.5 sm:max-w-none">
                    <div className="relative min-w-0 flex-1 sm:min-w-[16rem] sm:max-w-[20rem] sm:flex-none">
                      <Search
                        className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--org-brand-muted)]"
                        aria-hidden
                      />
                      <input
                        ref={fileSearchInputRef}
                        id="resource-file-search"
                        type="search"
                        autoComplete="off"
                        value={fileSearchInput}
                        onChange={(e) => setFileSearchInput(e.target.value)}
                        placeholder="Titles & indexed text…"
                        className="h-10 w-full min-w-[12rem] rounded-lg border border-[#d8d8d8] bg-white py-0 pl-10 pr-[3.25rem] text-[13px] text-[#121212] outline-none ring-0 transition placeholder:text-[var(--org-brand-muted)] focus:border-[#121212] sm:min-w-[16rem]"
                      />
                      {fileSearchInput.trim() ? (
                        <button
                          type="button"
                          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full px-2 py-1 text-[11px] font-medium text-[var(--org-brand-muted)] hover:text-[var(--org-brand-text)]"
                          onClick={() => setFileSearchInput('')}
                          aria-label="Clear file search"
                        >
                          Clear
                        </button>
                      ) : null}
                    </div>
                    <button
                      type="button"
                      className={`${headerSearchIconBtn} shrink-0`}
                      aria-label="Close file search"
                      title="Close"
                      onClick={() => setFileSearchPanelOpen(false)}
                    >
                      <X className="size-[18px]" strokeWidth={2} aria-hidden />
                    </button>
                  </div>
                )}
              </>
            ) : null}
            {canManage ? (
              <>
                {archiveColumnOk ? (
                  <Link
                    href={
                      archiveOnly
                        ? resourcesHref({ archived: false, clearFileSearch: true })
                        : resourcesHref({ archived: true, clearFileSearch: true })
                    }
                    className={outlineHeaderBtn}
                  >
                    <FolderArchive className="h-4 w-4" aria-hidden />
                    {archiveOnly ? 'Active library' : 'Archived'}
                  </Link>
                ) : null}
                <Link href={uploadHref} className={primaryHeaderBtn}>
                  <Upload className="h-4 w-4" aria-hidden />
                  Upload file
                </Link>
              </>
            ) : null}
          </div>
        ) : null}
      </div>

      {archiveOnly ? (
        <p className="mb-6 rounded-full border border-amber-200/80 bg-amber-50/90 px-4 py-2.5 text-[13px] text-[#5c4a21]">
          Full-text search applies to the <strong className="font-semibold">active</strong> library only. Switch to
          Active library to search, or browse archived files below.
        </p>
      ) : (
        <div className="mb-8">
          <ResourceLibraryAssistant variant="topBar" initialPrompt={initialScoutPrompt} />
          {fileSearchPanelOpen && fileSearchActive ? (
            <p className="mt-3 text-[12px] text-[var(--org-brand-muted)]">
              Matching titles and full-text in the active library
              {folderFilter ? ' (folder filter applied).' : '.'}
            </p>
          ) : null}
        </div>
      )}

      <div
        className={
          showFolderStrip
            ? 'lg:grid lg:grid-cols-[minmax(220px,280px)_minmax(0,1fr)] lg:items-start lg:gap-12'
            : 'min-w-0'
        }
      >
        {showFolderStrip ? (
          <aside className="mb-10 shrink-0 lg:mb-0" id="resource-new-folder-anchor">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--org-brand-muted)]">
              Folders
            </p>
            <ul className="flex flex-col gap-1">
              {folders.map((f) => {
                const n = fileCountByFolderId.get(f.id) ?? 0;
                const pathLabel = folderDisplayPath(f.id, folderById);
                const nested = pathLabel.includes(' / ');
                const selected = folderFilter === f.id;
                const menuOpen = folderMenuOpenId === f.id;
                return (
                  <li key={f.id} className="relative">
                    <Link
                      href={resourcesHref({ archived: archiveOnly, folder: f.id, clearFileSearch: true })}
                      title={pathLabel}
                      className={`flex min-w-0 items-center gap-2.5 rounded-full py-2 pl-3 pr-11 transition ${
                        selected
                          ? 'bg-[color-mix(in_oklab,var(--org-brand-border)_55%,var(--org-brand-bg))]'
                          : 'hover:bg-[color-mix(in_oklab,var(--org-brand-border)_35%,var(--org-brand-bg))]'
                      }`}
                    >
                      <FolderIconSmall className="shrink-0 text-[var(--org-brand-muted)]" />
                      <span className="min-w-0 flex-1 truncate text-[14px] font-medium leading-snug text-[var(--org-brand-text)]">
                        {f.name}
                      </span>
                      {nested ? (
                        <span className="sr-only">{pathLabel}</span>
                      ) : null}
                      <span className="shrink-0 tabular-nums text-[12.5px] text-[var(--org-brand-muted)]">{n}</span>
                    </Link>
                    {canManage ? (
                      <div className="absolute right-1 top-1/2 -translate-y-1/2" data-resource-folder-menu>
                        <button
                          ref={menuOpen ? folderMenuAnchorRef : undefined}
                          type="button"
                          aria-expanded={menuOpen}
                          aria-haspopup="menu"
                          aria-label={`Actions for folder ${f.name}`}
                          disabled={folderBusy}
                          className="flex h-8 w-8 items-center justify-center rounded-full text-[var(--org-brand-muted)] transition hover:bg-[color-mix(in_oklab,var(--org-brand-border)_50%,var(--org-brand-bg))] hover:text-[var(--org-brand-text)] disabled:opacity-50"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setFileMenuOpenId(null);
                            setFolderMenuOpenId(menuOpen ? null : f.id);
                          }}
                        >
                          <MoreVertical className="h-4 w-4" strokeWidth={2} />
                        </button>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            {canManage ? (
              <button
                type="button"
                onClick={openNewFolderPanel}
                className="mt-2 flex w-full items-center gap-2 rounded-full py-2 pl-3 text-left text-[13px] font-medium text-[var(--org-brand-muted)] transition hover:bg-[color-mix(in_oklab,var(--org-brand-border)_35%,var(--org-brand-bg))] hover:text-[var(--org-brand-text)]"
              >
                <PlusIcon className="h-4 w-4 shrink-0" />
                New folder
              </button>
            ) : null}

            {canManage && newFolderPanelOpen ? (
              <form
                onSubmit={addFolder}
                className="mt-4 space-y-3 rounded-2xl border border-[color-mix(in_oklab,var(--org-brand-border)_88%,transparent)] bg-[var(--org-brand-bg)] p-4 shadow-[0_1px_0_color-mix(in_oklab,var(--org-brand-border)_30%,transparent)]"
              >
                <div>
                  <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-[var(--org-brand-muted)]">
                    Folder name
                  </label>
                  <input
                    id="resource-new-folder-input"
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    placeholder="e.g. Policies"
                    className="h-10 w-full rounded-xl border border-[color-mix(in_oklab,var(--org-brand-border)_95%,transparent)] bg-[color-mix(in_oklab,var(--org-brand-surface)_40%,var(--org-brand-bg))] px-3 text-[13px] text-[var(--org-brand-text)] outline-none focus:border-[var(--org-brand-text)] focus:ring-[3px] focus:ring-[color-mix(in_oklab,var(--org-brand-text)_10%,transparent)]"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="submit"
                    disabled={folderBusy || !newFolderName.trim()}
                    className="h-9 rounded-full px-4 text-[13px] font-medium text-[var(--org-brand-bg)] disabled:opacity-50"
                    style={{ background: 'var(--org-brand-text)' }}
                  >
                    {folderBusy ? '…' : 'Add folder'}
                  </button>
                  <button
                    type="button"
                    className="h-9 rounded-full border border-[color-mix(in_oklab,var(--org-brand-border)_90%,transparent)] px-4 text-[13px] font-medium text-[var(--org-brand-muted)] hover:bg-[color-mix(in_oklab,var(--org-brand-border)_30%,var(--org-brand-bg))]"
                    onClick={() => setNewFolderPanelOpen(false)}
                  >
                    Cancel
                  </button>
                </div>
                {folderMsg ? (
                  <p className="text-[12px] text-[var(--campsite-success)]" role="status">
                    {folderMsg}
                  </p>
                ) : null}
                {folderErr ? (
                  <p className="text-[12px] text-red-800" role="alert">
                    {folderErr}
                  </p>
                ) : null}
              </form>
            ) : null}
          </aside>
        ) : null}

        <section className="min-w-0">
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
                    className="h-9 rounded-xl px-4 text-[13px] font-medium text-[var(--org-brand-on-primary)] disabled:opacity-50"
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

      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--org-brand-muted)]">Files</p>
          {!busy ? (
            <span className="text-[12.5px] tabular-nums text-[var(--org-brand-muted)]">{rows.length} total</span>
          ) : null}
        </div>
      </div>

      {!archiveOnly ? (
        <div className="mb-5 flex flex-wrap gap-2">
          <Link
            href={resourcesHref({ archived: archiveOnly, folder: null, clearFileSearch: true })}
            className={folderFilter === null ? filterChipActive : filterChipInactive}
            style={folderFilter === null ? filterActiveStyle : undefined}
          >
            All
          </Link>
          <Link
            href={resourcesHref({ archived: archiveOnly, folder: 'none', clearFileSearch: true })}
            className={folderFilter === 'none' ? filterChipActive : filterChipInactive}
            style={folderFilter === 'none' ? filterActiveStyle : undefined}
          >
            Uncategorised
          </Link>
          {folders.map((f) => {
            const chipPath = folderDisplayPath(f.id, folderById);
            return (
              <Link
                key={f.id}
                href={resourcesHref({ archived: archiveOnly, folder: f.id, clearFileSearch: true })}
                className={folderFilter === f.id ? filterChipActive : filterChipInactive}
                style={folderFilter === f.id ? filterActiveStyle : undefined}
                title={chipPath}
              >
                <span className="truncate">{chipPath}</span>
              </Link>
            );
          })}
        </div>
      ) : null}

      {currentFolderLabel && folderFilter !== null ? (
        <p className="mb-4 text-[13px] text-[var(--org-brand-muted)]">
          Viewing{' '}
          <span className="font-medium text-[var(--org-brand-text)]">{currentFolderLabel}</span>
          {' · '}
          <Link
            href={resourcesHref({ archived: archiveOnly, folder: null, clearFileSearch: true })}
            className="text-[var(--org-brand-text)] underline decoration-[color-mix(in_oklab,var(--org-brand-border)_80%,transparent)] underline-offset-2"
          >
            Show all files
          </Link>
        </p>
      ) : null}

      {err ? (
        <p className="status-banner-error mb-4 rounded-lg px-3 py-2 text-[13px]">{err}</p>
      ) : null}

      {busy ? (
        <p className="text-[13px] text-[var(--org-brand-muted)]">Loading…</p>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-[color-mix(in_oklab,var(--org-brand-border)_90%,transparent)] bg-[var(--org-brand-bg)] px-4 py-8 text-center text-[13px] text-[var(--org-brand-muted)] shadow-[0_1px_0_color-mix(in_oklab,var(--org-brand-border)_30%,transparent)]">
          {archiveOnly
            ? 'No archived resources.'
            : fileSearchActive
              ? 'No resources match your file search. Try different words or clear the search.'
              : 'No resources yet.'}
          {canManage && !archiveOnly ? (
            <>
              {' '}
              <Link href={uploadHref} className="font-medium text-[var(--org-brand-text)] underline underline-offset-2">
                Upload the first file
              </Link>
              .
            </>
          ) : null}
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
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
        </section>
      </div>
    </div>
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
    : `Updated ${updated.toLocaleDateString('en-GB', { timeZone: 'UTC',  day: 'numeric', month: 'short', year: 'numeric' })}`;

  return (
    <li>
      <div
        className={`group flex items-stretch overflow-hidden rounded-2xl border border-[color-mix(in_oklab,var(--org-brand-border)_88%,transparent)] bg-[var(--org-brand-bg)] shadow-[0_1px_0_color-mix(in_oklab,var(--org-brand-border)_28%,transparent)] ${campusSurface.interactiveSheetRow}`}
      >
        <Link
          href={`/resources/${r.id}`}
          className="flex min-w-0 flex-1 items-start gap-3.5 px-4 py-4 pr-2 outline-none ring-inset ring-transparent ring-offset-0 transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-[color-mix(in_oklab,var(--org-brand-text)_22%,transparent)]"
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-[color-mix(in_oklab,var(--org-brand-border)_72%,transparent)] bg-[color-mix(in_oklab,var(--org-brand-surface)_48%,var(--org-brand-bg))] text-[10px] font-bold tracking-wide text-[var(--org-brand-muted)]">
            {kind}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2 gap-y-1">
              <span className="text-[15px] font-semibold leading-snug text-[var(--org-brand-text)]">{r.title}</span>
              <span className="rounded-full bg-[color-mix(in_oklab,var(--org-brand-border)_32%,var(--org-brand-bg))] px-2.5 py-0.5 text-[11px] font-medium text-[var(--org-brand-text)]">
                {category}
              </span>
            </span>
            <p className="mt-1.5 text-[12px] text-[var(--org-brand-muted)]">
              {r.file_name} · {formatBytes(r.byte_size)}
              {updatedLabel ? ` · ${updatedLabel}` : ''}
            </p>
          </span>
        </Link>
        {canManage ? (
          <div className="relative flex shrink-0 items-start py-2 pr-2.5 pt-3" data-resource-file-menu>
            <button
              ref={menuAnchorRef}
              type="button"
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              aria-label={`Actions for ${r.title}`}
              disabled={actionBusy}
              className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--org-brand-muted)] transition-colors duration-150 hover:bg-[color-mix(in_oklab,var(--org-brand-text)_8%,transparent)] hover:text-[var(--org-brand-text)] disabled:opacity-50"
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
