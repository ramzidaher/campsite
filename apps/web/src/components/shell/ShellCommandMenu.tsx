'use client';

import { useRouter } from 'next/navigation';
import { createPortal } from 'react-dom';
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Search } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { getCommandPaletteShortcutHint } from '@/lib/platform/commandPaletteShortcut';
import type { ShellCommandPaletteItem, ShellCommandPaletteSection } from '@/lib/shell/shellCommandPaletteSections';

type SearchHitRow =
  | {
      kind: 'person';
      id: string;
      label: string;
      sub?: string;
      href: string;
      avatarUrl: string | null;
      initials: string;
    }
  | { kind: 'resource'; id: string; label: string; sub: string; href: string }
  | { kind: 'broadcast'; id: string; label: string; sub: string; href: string };

type FlatRow =
  | { type: 'heading'; key: string; text: string }
  | { type: 'item'; key: string; href: string; label: string; highlight: boolean; row: SearchHitRow | null };

function initialsFromName(name: string | null): string {
  const p = (name ?? '?').trim().split(/\s+/).filter(Boolean);
  if (p.length === 0) return '?';
  if (p.length === 1) return p[0]!.slice(0, 2).toUpperCase();
  return (p[0]![0]! + p[p.length - 1]![0]!).toUpperCase();
}

function itemMatchesQuery(item: ShellCommandPaletteItem, query: string): boolean {
  const t = query.trim().toLowerCase();
  if (!t) return true;
  const hay = [item.label, item.href.replace(/[/?&=]/g, ' '), ...(item.keywords ?? [])].join(' ').toLowerCase();
  return t.split(/\s+/).every((w) => w.length > 0 && hay.includes(w));
}

function HighlightText({ text, query }: { text: string; query: string }) {
  const q = query.trim().toLowerCase();
  if (!q) return <>{text}</>;
  const lower = text.toLowerCase();
  const idx = lower.indexOf(q);
  if (idx < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, idx)}
      <strong className="font-semibold text-campsite-text">{text.slice(idx, idx + q.length)}</strong>
      {text.slice(idx + q.length)}
    </>
  );
}

export function ShellCommandMenu({
  sections,
  orgId,
  showMemberSearch,
  orgName,
}: {
  sections: ShellCommandPaletteSection[];
  orgId: string | null;
  showMemberSearch: boolean;
  /** Shown as a small scope chip in the palette footer. */
  orgName: string;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const titleId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  const [open, setOpen] = useState(false);
  /** Default matches SSR; `useLayoutEffect` syncs to the real OS (Chromebook, Windows, Mac, …). */
  const [kbdHint, setKbdHint] = useState('Ctrl+K');
  const [q, setQ] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const [searchBusy, setSearchBusy] = useState(false);
  const [broadcastHits, setBroadcastHits] = useState<
    { id: string; title: string; status: string; created_at: string }[]
  >([]);
  const [resourceHits, setResourceHits] = useState<{ id: string; title: string; updated_at: string }[]>([]);
  const [memberHits, setMemberHits] = useState<
    { id: string; full_name: string | null; email: string | null; avatar_url: string | null }[]
  >([]);

  useLayoutEffect(() => {
    setKbdHint(getCommandPaletteShortcutHint());
  }, []);

  const filteredSections = useMemo(() => {
    return sections
      .map((sec) => ({
        ...sec,
        items: sec.items.filter((it) => itemMatchesQuery(it, q)),
      }))
      .filter((sec) => sec.items.length > 0);
  }, [sections, q]);

  const term = q.trim();
  const searchActive = term.length >= 2 && Boolean(orgId);

  useEffect(() => {
    if (!open || !searchActive) {
      setSearchBusy(false);
      setBroadcastHits([]);
      setResourceHits([]);
      setMemberHits([]);
      return;
    }

    let cancelled = false;
    setSearchBusy(true);
    const timer = window.setTimeout(async () => {
      let bQuery = supabase
        .from('broadcasts')
        .select('id, title, status, created_at')
        .ilike('title', `%${term}%`)
        .order('created_at', { ascending: false })
        .limit(5);
      bQuery = bQuery.eq('org_id', orgId!);

      const mQuery = supabase
        .from('profiles')
        .select('id, full_name, preferred_name, pronouns, show_pronouns, email, avatar_url')
        .eq('status', 'active')
        .or(`full_name.ilike.%${term}%,email.ilike.%${term}%`)
        .order('full_name', { ascending: true })
        .limit(5);
      const scopedMQuery = mQuery.eq('org_id', orgId!);

      const resQuery = supabase.rpc('search_staff_resources', { q: term, limit_n: 5 });

      const [bRes, mRes, resRes] = await Promise.all([
        bQuery,
        scopedMQuery,
        resQuery,
      ]);
      if (cancelled) return;
      setBroadcastHits((bRes.data ?? []) as { id: string; title: string; status: string; created_at: string }[]);
      setMemberHits(
        (mRes.data ?? []) as { id: string; full_name: string | null; email: string | null; avatar_url: string | null }[],
      );
      const rawRes = resRes.error
        ? []
        : ((resRes.data ?? []) as { id: string; title: string; updated_at: string }[]);
      setResourceHits(rawRes.map((r) => ({ id: r.id, title: r.title, updated_at: r.updated_at })));
      setSearchBusy(false);
    }, 160);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [open, searchActive, term, supabase, orgId]);

  const searchHitRows: SearchHitRow[] = useMemo(() => {
    if (!searchActive) return [];
    const rows: SearchHitRow[] = [];
    for (const m of memberHits) {
      rows.push({
        kind: 'person',
        id: m.id,
        label: m.full_name || 'Unnamed member',
        sub: m.email ?? undefined,
        href: `/hr/records/${m.id}`,
        avatarUrl: m.avatar_url,
        initials: initialsFromName(m.full_name),
      });
    }
    for (const r of resourceHits) {
      rows.push({
        kind: 'resource',
        id: r.id,
        label: r.title,
        sub: `Updated ${new Date(r.updated_at).toLocaleDateString()}`,
        href: `/resources/${r.id}`,
      });
    }
    for (const b of broadcastHits) {
      rows.push({
        kind: 'broadcast',
        id: b.id,
        label: b.title,
        sub: `${b.status.replaceAll('_', ' ')} · ${new Date(b.created_at).toLocaleDateString()}`,
        href: `/broadcasts/${b.id}`,
      });
    }
    return rows;
  }, [searchActive, memberHits, resourceHits, broadcastHits]);

  const flatRows: FlatRow[] = useMemo(() => {
    const rows: FlatRow[] = [];
    for (const sec of filteredSections) {
      rows.push({ type: 'heading', key: `h-${sec.id}`, text: sec.heading });
      for (const it of sec.items) {
        rows.push({
          type: 'item',
          key: it.id,
          href: it.href,
          label: it.label,
          highlight: true,
          row: null,
        });
      }
    }
    if (searchActive) {
      rows.push({ type: 'heading', key: 'h-search', text: 'Search this organisation' });
      if (searchBusy) {
        rows.push({
          type: 'item',
          key: 'search-loading',
          href: '#',
          label: 'Searching…',
          highlight: false,
          row: null,
        });
      } else if (searchHitRows.length === 0) {
        rows.push({
          type: 'item',
          key: 'search-empty',
          href: '#',
          label: 'No people, files, or broadcasts match — try another word',
          highlight: false,
          row: null,
        });
      } else {
        for (const hit of searchHitRows) {
          rows.push({
            type: 'item',
            key: `hit-${hit.kind}-${hit.id}`,
            href: hit.href,
            label: hit.label,
            highlight: true,
            row: hit,
          });
        }
      }
    }
    return rows;
  }, [filteredSections, searchActive, searchBusy, searchHitRows]);

  const flatRowsRef = useRef<FlatRow[]>([]);
  flatRowsRef.current = flatRows;

  const selectableIndices = useMemo(() => {
    const idx: number[] = [];
    flatRows.forEach((r, i) => {
      if (r.type === 'item' && r.href !== '#') idx.push(i);
    });
    return idx;
  }, [flatRows]);

  const safeSelected = useMemo(() => {
    if (selectableIndices.length === 0) return -1;
    const pos = selectableIndices.indexOf(selectedIndex);
    if (pos >= 0) return selectedIndex;
    return selectableIndices[0]!;
  }, [selectableIndices, selectedIndex]);

  useLayoutEffect(() => {
    if (!open) return;
    const fr = flatRowsRef.current;
    const first = fr.findIndex((r) => r.type === 'item' && r.href !== '#');
    if (first >= 0) setSelectedIndex(first);
  }, [open, q]);

  useLayoutEffect(() => {
    if (!open) return;
    if (selectableIndices.length === 0) return;
    if (!selectableIndices.includes(selectedIndex)) {
      setSelectedIndex(selectableIndices[0]!);
    }
  }, [open, selectableIndices, selectedIndex]);

  useEffect(() => {
    if (!open) setQ('');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const goNavigate = useCallback(
    (href: string) => {
      if (!href || href === '#') return;
      setOpen(false);
      setQ('');
      router.push(href);
    },
    [router],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
        return;
      }
      if (!open) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (selectableIndices.length === 0) return;
        const cur = selectableIndices.indexOf(safeSelected);
        const next = cur < 0 ? 0 : (cur + 1) % selectableIndices.length;
        setSelectedIndex(selectableIndices[next]!);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (selectableIndices.length === 0) return;
        const cur = selectableIndices.indexOf(safeSelected);
        const next = cur <= 0 ? selectableIndices.length - 1 : cur - 1;
        setSelectedIndex(selectableIndices[next]!);
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (safeSelected < 0) return;
        const row = flatRowsRef.current[safeSelected];
        if (row?.type === 'item' && row.href !== '#') goNavigate(row.href);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, safeSelected, selectableIndices, goNavigate]);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.querySelector(`[data-cmd-index="${safeSelected}"]`) as HTMLElement | null;
    el?.scrollIntoView({ block: 'nearest' });
  }, [open, safeSelected, flatRows]);

  const palette = open ? (
    <div
      className="fixed inset-0 z-[200] flex items-start justify-center bg-black/35 px-3 pb-10 pt-[12vh] backdrop-blur-[2px]"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="flex max-h-[min(72vh,640px)] w-full max-w-[min(100vw-1.5rem,520px)] flex-col overflow-hidden rounded-2xl border border-campsite-border bg-campsite-elevated shadow-[0_24px_80px_rgba(0,0,0,0.18)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="sr-only">
          Command menu
        </h2>
        <div className="flex items-center gap-3 border-b border-[#eceae6] px-4 py-3">
          <Search className="h-[18px] w-[18px] shrink-0 text-campsite-text-muted" strokeWidth={2} aria-hidden />
          <input
            ref={inputRef}
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search CampSite, jump to a page, or find people and files…"
            className="min-w-0 flex-1 border-0 bg-transparent text-[15px] text-campsite-text outline-none placeholder:text-campsite-text-muted"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
          />
        </div>

        <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-1.5 py-2">
          {flatRows.length === 0 ? (
            <p className="px-3 py-6 text-center text-[13px] text-campsite-text-secondary">No matching pages or actions.</p>
          ) : (
            flatRows.map((row, i) => {
              if (row.type === 'heading') {
                return (
                  <div
                    key={row.key}
                    className="px-2.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.1em] text-campsite-text-muted"
                  >
                    {row.text}
                  </div>
                );
              }
              const active = i === safeSelected;
              const isDead = row.href === '#';
              return (
                <button
                  key={row.key}
                  type="button"
                  data-cmd-index={i}
                  disabled={isDead}
                  onMouseEnter={() => {
                    if (!isDead) setSelectedIndex(i);
                  }}
                  onClick={() => goNavigate(row.href)}
                  className={[
                    'flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2.5 text-left text-[13.5px] transition-colors',
                    isDead ? 'cursor-default text-campsite-text-secondary' : 'text-campsite-text',
                    active && !isDead ? 'bg-[#f0efeb]' : !isDead ? 'hover:bg-[#f7f6f2]' : '',
                  ].join(' ')}
                >
                  {row.row?.kind === 'person' ? (
                    row.row.avatarUrl ? (
                      <img src={row.row.avatarUrl} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
                    ) : (
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#e8e4dc] text-[10px] font-semibold text-[#5b5b5b]">
                        {row.row.initials}
                      </span>
                    )
                  ) : row.row?.kind === 'resource' ? (
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#e8f4f8] text-[12px]">
                      📄
                    </span>
                  ) : row.row?.kind === 'broadcast' ? (
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#f3e8ff] text-[12px]">
                      📣
                    </span>
                  ) : (
                    <span className="w-8 shrink-0" aria-hidden />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">
                      {row.highlight ? <HighlightText text={row.label} query={q} /> : row.label}
                    </span>
                    {row.row?.sub ? (
                      <span className="mt-0.5 block truncate text-[11.5px] text-campsite-text-secondary">{row.row.sub}</span>
                    ) : null}
                  </span>
                </button>
              );
            })
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#eceae6] px-4 py-2.5 text-[11px] text-campsite-text-muted">
          <span className="inline-flex items-center gap-1.5">
            <span className="rounded-md border border-campsite-border bg-campsite-bg px-1.5 py-0.5 font-medium text-campsite-text-secondary">
              ↑↓
            </span>
            navigate
            <span className="rounded-md border border-campsite-border bg-campsite-bg px-1.5 py-0.5 font-medium text-campsite-text-secondary">
              ↵
            </span>
            open
            <span className="rounded-md border border-campsite-border bg-campsite-bg px-1.5 py-0.5 font-medium text-campsite-text-secondary">
              esc
            </span>
            close
          </span>
          <span className="max-w-[55%] truncate rounded-full border border-[#eceae6] bg-campsite-bg px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-[0.06em] text-campsite-text-secondary">
            Org · {orgName}
          </span>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Open command palette (Ctrl+K — ⌘K on Mac)"
        aria-keyshortcuts="Meta+K Control+K"
        className="group flex h-9 w-full min-w-0 max-w-[min(100%,420px)] items-center gap-2.5 rounded-full border border-campsite-border bg-campsite-elevated px-3.5 text-left shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-[border-color,box-shadow] hover:border-[#c5c5c5] hover:shadow-[0_2px_8px_rgba(0,0,0,0.06)]"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <Search className="h-4 w-4 shrink-0 text-campsite-text-muted" strokeWidth={2} aria-hidden />
        <span className="min-w-0 flex-1 truncate text-[13px] text-campsite-text-muted">Search…</span>
        <kbd
          className="hidden shrink-0 rounded-md border border-[#e8e6e3] bg-campsite-surface px-1.5 py-0.5 font-sans text-[10px] font-medium text-campsite-text-secondary sm:inline-block"
          suppressHydrationWarning
        >
          {kbdHint}
        </kbd>
      </button>
      {typeof document !== 'undefined' && palette ? createPortal(palette, document.body) : null}
    </>
  );
}
