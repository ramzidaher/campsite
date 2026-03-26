'use client';

import { isBroadcastDraftOnlyRole, type ProfileRole } from '@campsite/types';
import { canComposeBroadcast } from '@campsite/types';
import type { ReactNode, SelectHTMLAttributes } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

import type { DeptRow } from './dept-scope';

import type { SupabaseClient } from '@supabase/supabase-js';

type CatRow = { id: string; name: string; dept_id: string };

type DeptBroadcastCaps = {
  send_org_wide: boolean;
  mandatory_broadcast: boolean;
  pin_broadcasts: boolean;
};

function parseDeptBroadcastCaps(raw: unknown): DeptBroadcastCaps {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    send_org_wide: Boolean(o.send_org_wide),
    mandatory_broadcast: Boolean(o.mandatory_broadcast),
    pin_broadcasts: Boolean(o.pin_broadcasts),
  };
}

function formatSupabaseWriteError(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) {
    const o = e as { message: string; details?: string; hint?: string; code?: string };
    const parts = [o.message, o.details, o.hint].filter((x): x is string => Boolean(x && x.trim()));
    return parts.length ? parts.join(' — ') : 'Request failed';
  }
  return e instanceof Error ? e.message : 'Request failed';
}

/** Map keys from BroadcastsClient are lowercased dept UUIDs. */
function categoriesForDepartment(map: Map<string, CatRow[]>, deptId: string): CatRow[] {
  if (!deptId) return [];
  return map.get(deptId.trim().toLowerCase()) ?? [];
}

type Props = {
  supabase: SupabaseClient;
  orgId: string;
  userId: string;
  role: ProfileRole;
  departments: DeptRow[];
  categoriesByDept: Map<string, CatRow[]>;
  onCreated?: () => void;
};

const TITLE_MAX = 120;

/**
 * Broadcasts shell uses a fixed light palette; CSS theme vars follow OS dark mode and made
 * compose fields look like solid black boxes. Match feed/search inputs instead.
 */
const COMPOSE_INPUT_CLASS =
  'w-full rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-sm text-[#121212] shadow-sm outline-none transition placeholder:text-[#9b9b9b] focus:border-[#121212] focus:ring-[3px] focus:ring-[#121212]/10';

/** No opacity hack on disabled — it made the category placeholder invisible in WebKit. */
const SELECT_FIELD_CLASS =
  'w-full rounded-lg border border-[#d8d8d8] px-3 py-2 pr-11 text-sm shadow-sm transition-colors focus:border-[#121212] focus:outline-none focus:ring-[3px] focus:ring-[#121212]/10 disabled:cursor-not-allowed disabled:bg-[#f5f4f1] disabled:text-[#9b9b9b]';

/** WebKit needs explicit color/background or the closed select can paint empty when appearance is none. */
const SELECT_FIELD_STYLE = {
  appearance: 'none' as const,
  WebkitAppearance: 'none' as const,
  color: '#121212',
  backgroundColor: '#ffffff',
};

function SelectWithChevron({
  children,
  className,
  style,
  ...selectProps
}: SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
  return (
    <div className="relative w-full">
      <select
        {...selectProps}
        className={[SELECT_FIELD_CLASS, className].filter(Boolean).join(' ')}
        style={{ ...SELECT_FIELD_STYLE, ...style }}
      >
        {children}
      </select>
      <span
        className="pointer-events-none absolute inset-y-0 right-0 flex w-11 items-center justify-center text-[#6b6b6b]"
        aria-hidden
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.25"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="shrink-0"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </span>
    </div>
  );
}

export function BroadcastComposer({
  supabase,
  orgId,
  userId,
  role,
  departments,
  categoriesByDept,
  onCreated,
}: Props) {
  const [deptId, setDeptId] = useState<string>('');
  const [catId, setCatId] = useState<string>('');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [schedule, setSchedule] = useState(false);
  const [scheduledAt, setScheduledAt] = useState('');
  const [draftId, setDraftId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [caps, setCaps] = useState<DeptBroadcastCaps | null>(null);
  const [capsLoading, setCapsLoading] = useState(false);
  const [isOrgWide, setIsOrgWide] = useState(false);
  const [isMandatory, setIsMandatory] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const dirty = useRef(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  /** Avoid invalid <select value> when props load after mount (fixes React #418 / broken category dropdown). */
  const displayDeptId = useMemo(() => {
    if (departments.some((d) => d.id === deptId)) return deptId;
    return departments[0]?.id ?? '';
  }, [departments, deptId]);

  const cats = useMemo(
    () => categoriesForDepartment(categoriesByDept, displayDeptId),
    [categoriesByDept, displayDeptId]
  );

  const displayCatId = useMemo(() => {
    if (cats.some((c) => c.id === catId)) return catId;
    return cats[0]?.id ?? '';
  }, [cats, catId]);

  useEffect(() => {
    dirty.current = true;
  }, [title, body, displayDeptId, displayCatId, schedule, scheduledAt, isOrgWide, isMandatory, isPinned]);

  useEffect(() => {
    let cancelled = false;
    if (!displayDeptId) {
      setCaps(null);
      setCapsLoading(false);
      return;
    }
    setIsOrgWide(false);
    setIsMandatory(false);
    setIsPinned(false);
    setCaps(null);
    setCapsLoading(true);
    void supabase
      .rpc('get_my_dept_broadcast_caps', { p_dept_id: displayDeptId })
      .then((res) => {
        if (cancelled) return;
        setCapsLoading(false);
        if (res.error) {
          setCaps({ send_org_wide: false, mandatory_broadcast: false, pin_broadcasts: false });
          return;
        }
        setCaps(parseDeptBroadcastCaps(res.data));
      });
    return () => {
      cancelled = true;
    };
  }, [displayDeptId, supabase]);

  const minScheduleIso = useMemo(() => {
    const t = new Date(Date.now() + 5 * 60 * 1000);
    t.setSeconds(0, 0);
    return t.toISOString().slice(0, 16);
  }, [schedule, scheduledAt]);

  const persistDraft = useCallback(async (): Promise<boolean> => {
    if (!canComposeBroadcast(role) || !displayDeptId || !displayCatId || !title.trim()) return true;
    const catRow = cats.find((c) => c.id === displayCatId);
    if (!catRow || String(catRow.dept_id).trim().toLowerCase() !== displayDeptId.trim().toLowerCase()) {
      setError('This category does not belong to the selected department. Refresh the page or pick the category again.');
      return false;
    }
    setSaving(true);
    setError(null);
    try {
      const row = {
        org_id: orgId,
        dept_id: displayDeptId,
        cat_id: displayCatId,
        title: title.trim().slice(0, TITLE_MAX),
        body: body ?? '',
        status: 'draft' as const,
        created_by: userId,
        is_org_wide: isOrgWide,
        is_mandatory: isMandatory,
        is_pinned: isPinned,
      };
      if (draftId) {
        const { error: ue } = await supabase.from('broadcasts').update(row).eq('id', draftId).eq('created_by', userId);
        if (ue) throw ue;
      } else {
        const { data, error: e } = await supabase.from('broadcasts').insert(row).select('id');
        if (e) throw e;
        const id = data?.[0]?.id as string | undefined;
        if (id) setDraftId(id);
      }
      dirty.current = false;
      return true;
    } catch (e: unknown) {
      setError(formatSupabaseWriteError(e));
      return false;
    } finally {
      setSaving(false);
    }
  }, [
    role,
    displayDeptId,
    displayCatId,
    title,
    body,
    orgId,
    userId,
    supabase,
    draftId,
    cats,
    isOrgWide,
    isMandatory,
    isPinned,
  ]);

  useEffect(() => {
    if (!canComposeBroadcast(role)) return;
    const t = window.setInterval(() => {
      if (dirty.current && title.trim().length) void persistDraft();
    }, 30_000);
    return () => window.clearInterval(t);
  }, [persistDraft, role, title]);

  const wrapSelection = (before: string, after: string) => {
    const ta = bodyRef.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const sel = body.slice(start, end) || 'text';
    const next = body.slice(0, start) + before + sel + after + body.slice(end);
    setBody(next);
    requestAnimationFrame(() => {
      ta.focus();
      const pos = start + before.length + sel.length + after.length;
      ta.setSelectionRange(start + before.length, start + before.length + sel.length);
    });
  };

  const submit = async (mode: 'draft' | 'pending' | 'send' | 'schedule') => {
    if (!displayDeptId || !displayCatId || !title.trim()) {
      setError('Title, department, and category are required.');
      return;
    }
    const catRow = cats.find((c) => c.id === displayCatId);
    if (!catRow || String(catRow.dept_id).trim().toLowerCase() !== displayDeptId.trim().toLowerCase()) {
      setError('This category does not belong to the selected department. Refresh the page or pick the category again.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (mode === 'draft') {
        const saved = await persistDraft();
        if (saved) onCreated?.();
        return;
      }

      if (isBroadcastDraftOnlyRole(role)) {
        const row = {
          org_id: orgId,
          dept_id: displayDeptId,
          cat_id: displayCatId,
          title: title.trim().slice(0, TITLE_MAX),
          body: body ?? '',
          status: 'pending_approval' as const,
          created_by: userId,
          is_org_wide: false,
          is_mandatory: false,
          is_pinned: false,
        };
        const { error: e } = await supabase.from('broadcasts').insert(row);
        if (e) throw e;
        setTitle('');
        setBody('');
        setDraftId(null);
        onCreated?.();
        return;
      }

      if (mode === 'schedule') {
        if (!scheduledAt) {
          setError('Pick a scheduled date and time.');
          return;
        }
        const when = new Date(scheduledAt);
        if (when.getTime() < Date.now() + 5 * 60 * 1000) {
          setError('Schedule at least 5 minutes from now.');
          return;
        }
        const row = {
          org_id: orgId,
          dept_id: displayDeptId,
          cat_id: displayCatId,
          title: title.trim().slice(0, TITLE_MAX),
          body: body ?? '',
          status: 'scheduled' as const,
          scheduled_at: when.toISOString(),
          created_by: userId,
          is_org_wide: isOrgWide,
          is_mandatory: isMandatory,
          is_pinned: isPinned,
        };
        const { error: e } = await supabase.from('broadcasts').insert(row);
        if (e) throw e;
        setTitle('');
        setBody('');
        setSchedule(false);
        setScheduledAt('');
        setIsOrgWide(false);
        setIsMandatory(false);
        setIsPinned(false);
        onCreated?.();
        return;
      }

      /* send now */
      const row = {
        org_id: orgId,
        dept_id: displayDeptId,
        cat_id: displayCatId,
        title: title.trim().slice(0, TITLE_MAX),
        body: body ?? '',
        status: 'sent' as const,
        sent_at: new Date().toISOString(),
        created_by: userId,
        is_org_wide: isOrgWide,
        is_mandatory: isMandatory,
        is_pinned: isPinned,
      };
      const { error: e } = await supabase.from('broadcasts').insert(row);
      if (e) throw e;
      setTitle('');
      setBody('');
      setIsOrgWide(false);
      setIsMandatory(false);
      setIsPinned(false);
      onCreated?.();
    } catch (e: unknown) {
      setError(formatSupabaseWriteError(e));
    } finally {
      setSaving(false);
    }
  };

  if (!canComposeBroadcast(role)) {
    return <p className="text-sm text-[#6b6b6b]">Your role cannot compose broadcasts.</p>;
  }

  const showDeliveryOptions =
    !isBroadcastDraftOnlyRole(role) &&
    caps &&
    (caps.send_org_wide || caps.mandatory_broadcast || caps.pin_broadcasts);

  return (
    <div className="mx-auto max-w-2xl space-y-5 rounded-xl border border-[#d8d8d8] bg-[#faf9f6] p-5 sm:p-6">
      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      <div>
        <label className="mb-1 block text-sm font-medium text-[#121212]">Title</label>
        <input
          className={COMPOSE_INPUT_CLASS}
          maxLength={TITLE_MAX}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Short headline for the feed"
        />
        <div className="mt-1 text-right text-xs text-[#6b6b6b]">
          {title.length}/{TITLE_MAX}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-[#121212]">Department</label>
          <SelectWithChevron
            value={displayDeptId}
            onChange={(e) => setDeptId(e.target.value)}
            disabled={!departments.length}
          >
            {!departments.length ? (
              <option value="">Loading departments…</option>
            ) : null}
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </SelectWithChevron>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-[#121212]">Category</label>
          <SelectWithChevron
            value={displayCatId}
            onChange={(e) => setCatId(e.target.value)}
            disabled={!cats.length}
            aria-describedby={!cats.length ? 'compose-category-hint' : undefined}
          >
            {!cats.length ? (
              <option value="">No categories for this department</option>
            ) : null}
            {cats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </SelectWithChevron>
          {!cats.length ? (
            <p id="compose-category-hint" className="mt-1.5 text-[12px] leading-snug text-[#6b6b6b]">
              Add broadcast categories in{' '}
              <span className="font-medium text-[#121212]">Admin → Departments</span> for &ldquo;
              {departments.find((d) => d.id === displayDeptId)?.name ?? 'this department'}
              &rdquo;, then refresh this page.
            </p>
          ) : null}
        </div>
      </div>

      {!isBroadcastDraftOnlyRole(role) && displayDeptId ? (
        <div className="rounded-lg border border-[#d8d8d8] bg-white p-3">
          <p className="text-sm font-medium text-[#121212]">Delivery options</p>
          <p className="mt-1 text-[12px] leading-snug text-[#6b6b6b]">
            Shown when your role and department toggles allow org-wide reach, mandatory delivery, or pinning.
          </p>
          {capsLoading ? (
            <p className="mt-2 text-xs text-[#6b6b6b]">Loading options…</p>
          ) : showDeliveryOptions ? (
            <div className="mt-3 space-y-2.5">
              {caps.send_org_wide ? (
                <label className="flex cursor-pointer items-start gap-2 text-sm text-[#121212]">
                  <input
                    type="checkbox"
                    className="mt-0.5 rounded border-[#d8d8d8]"
                    checked={isOrgWide}
                    onChange={(e) => setIsOrgWide(e.target.checked)}
                  />
                  <span>
                    <span className="font-medium">Org-wide</span>
                    <span className="mt-0.5 block text-[12px] text-[#6b6b6b]">
                      Send with organisation-wide intent. Subscribers still filter by category unless you also use
                      mandatory.
                    </span>
                  </span>
                </label>
              ) : null}
              {caps.mandatory_broadcast ? (
                <label className="flex cursor-pointer items-start gap-2 text-sm text-[#121212]">
                  <input
                    type="checkbox"
                    className="mt-0.5 rounded border-[#d8d8d8]"
                    checked={isMandatory}
                    onChange={(e) => setIsMandatory(e.target.checked)}
                  />
                  <span>
                    <span className="font-medium">Mandatory</span>
                    <span className="mt-0.5 block text-[12px] text-[#6b6b6b]">
                      Deliver to everyone in the target audience regardless of category subscription.
                    </span>
                  </span>
                </label>
              ) : null}
              {caps.pin_broadcasts ? (
                <label className="flex cursor-pointer items-start gap-2 text-sm text-[#121212]">
                  <input
                    type="checkbox"
                    className="mt-0.5 rounded border-[#d8d8d8]"
                    checked={isPinned}
                    onChange={(e) => setIsPinned(e.target.checked)}
                  />
                  <span>
                    <span className="font-medium">Pin to top</span>
                    <span className="mt-0.5 block text-[12px] text-[#6b6b6b]">
                      Show this post before non-pinned items in the feed.
                    </span>
                  </span>
                </label>
              ) : null}
            </div>
          ) : (
            <p className="mt-2 text-[12px] text-[#6b6b6b]">
              No extra delivery options for this department. An org admin can enable them under Admin → Departments.
            </p>
          )}
        </div>
      ) : null}

      <div>
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-[#121212]">Message</span>
          <span className="text-[12px] text-[#6b6b6b]">Use the buttons or type normally — preview updates as you go.</span>
        </div>
        <div className="mb-2 flex flex-wrap gap-1.5">
          <button
            type="button"
            className="rounded-full border border-[#d8d8d8] bg-white px-2.5 py-1 text-xs font-medium text-[#121212] transition hover:bg-[#f5f4f1]"
            onClick={() => wrapSelection('**', '**')}
          >
            Bold
          </button>
          <button
            type="button"
            className="rounded-full border border-[#d8d8d8] bg-white px-2.5 py-1 text-xs font-medium text-[#121212] transition hover:bg-[#f5f4f1]"
            onClick={() => wrapSelection('*', '*')}
          >
            Italic
          </button>
          <button
            type="button"
            className="rounded-full border border-[#d8d8d8] bg-white px-2.5 py-1 text-xs font-medium text-[#121212] transition hover:bg-[#f5f4f1]"
            onClick={() => {
              const ta = bodyRef.current;
              if (!ta) return;
              const start = ta.selectionStart;
              const lineStart = body.lastIndexOf('\n', start - 1) + 1;
              const next = body.slice(0, lineStart) + '- ' + body.slice(lineStart);
              setBody(next);
            }}
          >
            Bullet list
          </button>
        </div>
        <textarea
          ref={bodyRef}
          className={`${COMPOSE_INPUT_CLASS} min-h-[160px] resize-y leading-relaxed`}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Write your message…"
        />
        <div className="mt-3 rounded-lg border border-[#d8d8d8] bg-white p-3">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#9b9b9b]">Preview</p>
          {body.trim() ? (
            <div className="max-w-none text-sm leading-relaxed text-[#121212] [&_a]:text-emerald-700 [&_a]:underline [&_li]:my-0.5 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
            </div>
          ) : (
            <p className="text-sm text-[#9b9b9b]">Recipients will see your message here once you start typing.</p>
          )}
        </div>
      </div>

      {!isBroadcastDraftOnlyRole(role) ? (
        <div className="flex flex-col gap-2 rounded-lg border border-[#d8d8d8] bg-white p-3">
          <label className="flex items-center gap-2 text-sm text-[#121212]">
            <input type="checkbox" checked={schedule} onChange={(e) => setSchedule(e.target.checked)} />
            Schedule send
          </label>
          {schedule ? (
            <input
              type="datetime-local"
              min={minScheduleIso}
              value={scheduledAt}
              onChange={(e) => setScheduledAt(e.target.value)}
              className={`${COMPOSE_INPUT_CLASS} max-w-xs`}
            />
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={saving}
          className="rounded-lg border border-[#d8d8d8] bg-white px-4 py-2 text-sm font-medium text-[#121212] transition hover:bg-[#f5f4f1]"
          onClick={() => void submit('draft')}
        >
          Save draft
        </button>
        {isBroadcastDraftOnlyRole(role) ? (
          <button
            type="button"
            disabled={saving}
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
            onClick={() => void submit('pending')}
          >
            Submit for approval
          </button>
        ) : schedule ? (
          <button
            type="button"
            disabled={saving}
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
            onClick={() => void submit('schedule')}
          >
            Schedule
          </button>
        ) : (
          <button
            type="button"
            disabled={saving}
            className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
            onClick={() => void submit('send')}
          >
            Send now
          </button>
        )}
      </div>
    </div>
  );
}
