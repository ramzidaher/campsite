'use client';
import type { ReactNode, SelectHTMLAttributes } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  composeChannelExplainer,
  composeChannelLabel,
  composeManageChannelsInSettings,
  composeNoChannelsHint,
} from '@/lib/broadcasts/channelCopy';
import type { DeptRow } from './dept-scope';

import type { SupabaseClient } from '@supabase/supabase-js';
import Link from 'next/link';
import { useUiSound } from '@/lib/sound/useUiSound';

import {
  BroadcastBodyEditor,
  type BroadcastBodyEditorHandle,
} from '@/components/broadcasts/BroadcastBodyEditor';

type CatRow = { id: string; name: string; dept_id: string };

type DeptBroadcastCaps = {
  send_org_wide: boolean;
  mandatory_broadcast: boolean;
  pin_broadcasts: boolean;
};

type TeamRow = { id: string; name: string };

type DeliveryMode = 'org_wide' | 'specific';
let collabDepartmentsTableMissing = false;

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
    return parts.length ? parts.join(' - ') : 'Request failed';
  }
  return e instanceof Error ? e.message : 'Request failed';
}

function isMissingCollabDepartmentsTableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { code?: string; message?: string };
  const msg = (e.message ?? '').toLowerCase();
  return (
    e.code === '42P01' ||
    e.code === 'PGRST205' ||
    msg.includes('broadcast_collab_departments') ||
    msg.includes('does not exist')
  );
}

/** Map keys from BroadcastsClient are lowercased dept UUIDs. */
function categoriesForDepartment(map: Map<string, CatRow[]>, deptId: string): CatRow[] {
  if (!deptId) return [];
  return map.get(deptId.trim().toLowerCase()) ?? [];
}

export type BroadcastComposeOutcome =
  | 'draft_saved'
  | 'submitted_for_approval'
  | 'sent'
  | 'scheduled';

type Props = {
  supabase: SupabaseClient;
  orgId: string;
  userId: string;
  canCompose: boolean;
  draftOnly: boolean;
  canPublishWithoutApproval: boolean;
  departments: DeptRow[];
  categoriesByDept: Map<string, CatRow[]>;
  /** Called after a successful save/send; use to switch tabs or refresh lists. */
  onCreated?: (outcome: BroadcastComposeOutcome) => void;
};

const TITLE_MAX = 120;

/** `datetime-local` values are local wall time; never use `toISOString().slice` for min/value. */
function toDatetimeLocalValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const COMPOSE_INPUT_CLASS =
  'w-full rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-sm text-[#121212] shadow-sm outline-none transition placeholder:text-[#9b9b9b] focus:border-[#121212] focus:ring-[3px] focus:ring-[#121212]/10';

const SELECT_FIELD_CLASS =
  'w-full rounded-lg border border-[#d8d8d8] px-3 py-2 pr-11 text-sm shadow-sm transition-colors focus:border-[#121212] focus:outline-none focus:ring-[3px] focus:ring-[#121212]/10 disabled:cursor-not-allowed disabled:bg-[#f5f4f1] disabled:text-[#9b9b9b]';

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
  canCompose,
  draftOnly,
  canPublishWithoutApproval,
  departments,
  categoriesByDept,
  onCreated,
}: Props) {
  const playUiSound = useUiSound();
  const [deptId, setDeptId] = useState<string>('');
  const [catId, setCatId] = useState<string>('');
  const [authorityDeptId, setAuthorityDeptId] = useState<string>('');
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>('specific');
  const [orgWideDeptIds, setOrgWideDeptIds] = useState<string[]>([]);
  const [orgWideCapsLoading, setOrgWideCapsLoading] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [schedule, setSchedule] = useState(false);
  const [scheduledAt, setScheduledAt] = useState('');
  const [draftId, setDraftId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [caps, setCaps] = useState<DeptBroadcastCaps | null>(null);
  const [capsLoading, setCapsLoading] = useState(false);
  const [isMandatory, setIsMandatory] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const [teamId, setTeamId] = useState<string>('');
  const [collabDeptIds, setCollabDeptIds] = useState<string[]>([]);
  const [teamsForDept, setTeamsForDept] = useState<TeamRow[]>([]);
  const dirty = useRef(false);
  const bodyEditorRef = useRef<BroadcastBodyEditorHandle>(null);

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

  const displayAuthorityDeptId = useMemo(() => {
    if (orgWideDeptIds.includes(authorityDeptId)) return authorityDeptId;
    return orgWideDeptIds[0] ?? '';
  }, [authorityDeptId, orgWideDeptIds]);

  const isOrgWideActive = !draftOnly && deliveryMode === 'org_wide';

  useEffect(() => {
    dirty.current = true;
  }, [
    title,
    body,
    displayDeptId,
    displayCatId,
    schedule,
    scheduledAt,
    deliveryMode,
    displayAuthorityDeptId,
    isMandatory,
    isPinned,
    teamId,
    collabDeptIds,
  ]);

  useEffect(() => {
    if (draftOnly || !departments.length) {
      setOrgWideDeptIds([]);
      setOrgWideCapsLoading(false);
      return;
    }
    let cancelled = false;
    setOrgWideCapsLoading(true);
    void (async () => {
      const allowed: string[] = [];
      await Promise.all(
        departments.map(async (d) => {
          const { data, error: rpcErr } = await supabase.rpc('get_my_dept_broadcast_caps', {
            p_dept_id: d.id,
          });
          if (rpcErr || cancelled) return;
          const c = parseDeptBroadcastCaps(data);
          if (c.send_org_wide) allowed.push(d.id);
        })
      );
      if (cancelled) return;
      setOrgWideDeptIds(allowed);
      setOrgWideCapsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [departments, supabase, draftOnly]);

  useEffect(() => {
    if (!orgWideDeptIds.length || !isOrgWideActive) return;
    if (!orgWideDeptIds.includes(authorityDeptId)) {
      setAuthorityDeptId(orgWideDeptIds[0]!);
    }
  }, [orgWideDeptIds, authorityDeptId, isOrgWideActive]);

  const capsDeptId = isOrgWideActive ? displayAuthorityDeptId : displayDeptId;

  useEffect(() => {
    let cancelled = false;
    if (!capsDeptId) {
      setCaps(null);
      setCapsLoading(false);
      return;
    }
    setCapsLoading(true);
    void supabase.rpc('get_my_dept_broadcast_caps', { p_dept_id: capsDeptId }).then((res) => {
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
  }, [capsDeptId, supabase]);

  useEffect(() => {
    if (draftOnly || deliveryMode !== 'specific' || !displayDeptId) {
      setTeamsForDept([]);
      setTeamId('');
      return;
    }
    let cancelled = false;
    void supabase
      .from('department_teams')
      .select('id,name')
      .eq('dept_id', displayDeptId)
      .order('name')
      .then(({ data }) => {
        if (cancelled) return;
        setTeamsForDept((data as TeamRow[]) ?? []);
        setTeamId('');
      });
    return () => {
      cancelled = true;
    };
  }, [draftOnly, deliveryMode, displayDeptId, supabase]);

  useEffect(() => {
    if (isOrgWideActive) {
      setIsMandatory(false);
      setCollabDeptIds([]);
    }
  }, [isOrgWideActive]);

  const syncCollaborationDepartments = useCallback(
    async (broadcastId: string) => {
      if (collabDepartmentsTableMissing) return;
      const desired =
        draftOnly || isOrgWideActive || !displayDeptId
          ? []
          : [...new Set(collabDeptIds)].filter((id) => id !== displayDeptId);
      const { error: delErr } = await supabase
        .from('broadcast_collab_departments')
        .delete()
        .eq('broadcast_id', broadcastId);
      if (delErr && !isMissingCollabDepartmentsTableError(delErr)) throw delErr;
      if (delErr) {
        collabDepartmentsTableMissing = true;
        return;
      }
      if (!desired.length) return;
      const { error: insErr } = await supabase
        .from('broadcast_collab_departments')
        .insert(desired.map((dept_id) => ({ broadcast_id: broadcastId, dept_id })));
      if (insErr && !isMissingCollabDepartmentsTableError(insErr)) throw insErr;
      if (insErr) collabDepartmentsTableMissing = true;
    },
    [supabase, collabDeptIds, displayDeptId, draftOnly, isOrgWideActive]
  );

  const minScheduleLocal = useMemo(() => {
    const t = new Date(Date.now() + 5 * 60 * 1000);
    t.setSeconds(0, 0);
    return toDatetimeLocalValue(t);
  }, [schedule]);

  const persistDraft = useCallback(async (): Promise<boolean> => {
    if (!canCompose || !title.trim()) return true;

    if (draftOnly) {
      if (!displayDeptId || !displayCatId) return true;
    } else if (isOrgWideActive) {
      if (!displayAuthorityDeptId) return true;
    } else {
      if (!displayDeptId || !displayCatId) return true;
    }

    if (!draftOnly && !isOrgWideActive) {
      const catRow = cats.find((c) => c.id === displayCatId);
      if (!catRow || String(catRow.dept_id).trim().toLowerCase() !== displayDeptId.trim().toLowerCase()) {
        setError('This channel does not belong to the selected department. Refresh the page or pick the channel again.');
        return false;
      }
    }

    setSaving(true);
    setError(null);
    try {
      const row = {
        org_id: orgId,
        dept_id: draftOnly || !isOrgWideActive ? displayDeptId : displayAuthorityDeptId,
        channel_id: isOrgWideActive ? null : displayCatId,
        team_id: draftOnly || isOrgWideActive || !teamId ? null : teamId,
        title: title.trim().slice(0, TITLE_MAX),
        body: body ?? '',
        status: 'draft' as const,
        created_by: userId,
        is_org_wide: isOrgWideActive,
        is_mandatory: isOrgWideActive ? false : isMandatory,
        is_pinned: isPinned,
      };
      if (draftId) {
        const { error: ue } = await supabase.from('broadcasts').update(row).eq('id', draftId).eq('created_by', userId);
        if (ue) throw ue;
        await syncCollaborationDepartments(draftId);
      } else {
        const { data, error: e } = await supabase.from('broadcasts').insert(row).select('id');
        if (e) throw e;
        const id = data?.[0]?.id as string | undefined;
        if (id) {
          setDraftId(id);
          await syncCollaborationDepartments(id);
        }
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
    canCompose,
    draftOnly,
    isOrgWideActive,
    displayDeptId,
    displayCatId,
    displayAuthorityDeptId,
    title,
    body,
    orgId,
    userId,
    supabase,
    draftId,
    cats,
    isMandatory,
    isPinned,
    teamId,
    syncCollaborationDepartments,
  ]);

  useEffect(() => {
    if (!canCompose) return;
    const t = window.setInterval(() => {
      if (dirty.current && title.trim().length) void persistDraft();
    }, 30_000);
    return () => window.clearInterval(t);
  }, [persistDraft, canCompose, title]);

  const submit = async (mode: 'draft' | 'pending' | 'send' | 'schedule') => {
    if (draftOnly) {
      if (!displayDeptId || !displayCatId || !title.trim()) {
        setError('Title, department, and channel are required.');
        playUiSound('error_soft');
        return;
      }
      const catRow = cats.find((c) => c.id === displayCatId);
      if (!catRow || String(catRow.dept_id).trim().toLowerCase() !== displayDeptId.trim().toLowerCase()) {
        setError('This channel does not belong to the selected department. Refresh the page or pick the channel again.');
        playUiSound('error_soft');
        return;
      }
    } else if (isOrgWideActive) {
      if (!displayAuthorityDeptId || !title.trim()) {
        setError('Title and permission department are required for an org-wide broadcast.');
        playUiSound('error_soft');
        return;
      }
    } else {
      if (!displayDeptId || !displayCatId || !title.trim()) {
        setError('Title, department, and channel are required.');
        playUiSound('error_soft');
        return;
      }
      const catRow = cats.find((c) => c.id === displayCatId);
      if (!catRow || String(catRow.dept_id).trim().toLowerCase() !== displayDeptId.trim().toLowerCase()) {
        setError('This channel does not belong to the selected department. Refresh the page or pick the channel again.');
        playUiSound('error_soft');
        return;
      }
    }

    setSaving(true);
    setError(null);
    try {
      if (mode === 'draft') {
        const saved = await persistDraft();
        if (saved) {
          playUiSound('broadcast_draft_saved');
          onCreated?.('draft_saved');
        }
        return;
      }

      if (draftOnly) {
        const row = {
          org_id: orgId,
          dept_id: displayDeptId,
          channel_id: displayCatId,
          title: title.trim().slice(0, TITLE_MAX),
          body: body ?? '',
          status: 'pending_approval' as const,
          created_by: userId,
          is_org_wide: false,
          is_mandatory: false,
          is_pinned: false,
          team_id: null as string | null,
        };
        const { error: e } = await supabase.from('broadcasts').insert(row);
        if (e) throw e;
        setTitle('');
        setBody('');
        setDraftId(null);
        playUiSound('broadcast_submitted');
        onCreated?.('submitted_for_approval');
        return;
      }

      const baseDept = isOrgWideActive ? displayAuthorityDeptId : displayDeptId;
      const baseCat = isOrgWideActive ? null : displayCatId;
      const baseTeam = isOrgWideActive || !teamId ? null : teamId;
      const baseFlags = {
        is_org_wide: isOrgWideActive,
        is_mandatory: isOrgWideActive ? false : isMandatory,
        is_pinned: isPinned,
        team_id: baseTeam,
      };

      if (mode === 'schedule') {
        if (!scheduledAt) {
          setError('Pick a scheduled date and time.');
          playUiSound('error_soft');
          return;
        }
        const when = new Date(scheduledAt);
        if (when.getTime() < Date.now() + 5 * 60 * 1000) {
          setError('Schedule at least 5 minutes from now.');
          playUiSound('error_soft');
          return;
        }
        const row = {
          org_id: orgId,
          dept_id: baseDept,
          channel_id: baseCat,
          title: title.trim().slice(0, TITLE_MAX),
          body: body ?? '',
          status: 'scheduled' as const,
          scheduled_at: when.toISOString(),
          created_by: userId,
          ...baseFlags,
        };
        const { data, error: e } = await supabase.from('broadcasts').insert(row).select('id').single();
        if (e) throw e;
        if (data?.id) await syncCollaborationDepartments(data.id as string);
        setTitle('');
        setBody('');
        setSchedule(false);
        setScheduledAt('');
        setDeliveryMode('specific');
        setIsMandatory(false);
        setIsPinned(false);
        setTeamId('');
        setCollabDeptIds([]);
        playUiSound('broadcast_scheduled');
        onCreated?.('scheduled');
        return;
      }

      const row = {
        org_id: orgId,
        dept_id: baseDept,
        channel_id: baseCat,
        title: title.trim().slice(0, TITLE_MAX),
        body: body ?? '',
        status: 'sent' as const,
        sent_at: new Date().toISOString(),
        created_by: userId,
        ...baseFlags,
      };
      const { data, error: e } = await supabase.from('broadcasts').insert(row).select('id').single();
      if (e) throw e;
      if (data?.id) await syncCollaborationDepartments(data.id as string);
      setTitle('');
      setBody('');
      setDeliveryMode('specific');
      setIsMandatory(false);
      setIsPinned(false);
      setTeamId('');
      setCollabDeptIds([]);
      playUiSound('broadcast_sent');
      onCreated?.('sent');
    } catch (e: unknown) {
      setError(formatSupabaseWriteError(e));
      playUiSound('error_soft');
    } finally {
      setSaving(false);
    }
  };

  const authorityDeptOptions = useMemo(
    () => departments.filter((d) => orgWideDeptIds.includes(d.id)),
    [departments, orgWideDeptIds]
  );

  const showExtraDelivery =
    !draftOnly &&
    caps &&
    ((isOrgWideActive && caps.pin_broadcasts) ||
      (!isOrgWideActive && (caps.mandatory_broadcast || caps.pin_broadcasts)));

  if (!canCompose) {
    return <p className="text-sm text-[#6b6b6b]">Your role cannot compose broadcasts.</p>;
  }

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
          className={`${COMPOSE_INPUT_CLASS} text-lg font-semibold tracking-tight text-[#37352f] placeholder:font-normal placeholder:text-[#aeaca7]`}
          maxLength={TITLE_MAX}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Headline"
        />
        <div className="mt-1 text-right text-xs text-[#6b6b6b]">
          {title.length}/{TITLE_MAX}
        </div>
      </div>

      {!draftOnly ? (
        <div className="rounded-lg border border-[#d8d8d8] bg-white p-3">
          <p className="text-sm font-medium text-[#121212]">Audience</p>
          <p className="mt-1 text-[12px] leading-snug text-[#6b6b6b]">
            <span className="font-medium text-[#121212]">Org-wide</span> goes to everyone (no department, channel, or
            team). <span className="font-medium text-[#121212]">Specific</span> picks a department and channel; if
            that department has teams, you can narrow to one team or leave &ldquo;all members&rdquo;.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-[#d8d8d8] bg-[#faf9f6] p-3 text-sm text-[#121212] sm:flex-1">
              <input
                type="radio"
                name="delivery-mode"
                className="mt-0.5"
                checked={deliveryMode === 'specific'}
                onChange={() => setDeliveryMode('specific')}
              />
              <span>
                <span className="font-medium">Specific</span>
                <span className="mt-0.5 block text-[12px] text-[#6b6b6b]">
                  Choose department, then channel; team filter appears only when teams exist for that department.
                </span>
              </span>
            </label>
            <label
              className={[
                'flex cursor-pointer items-start gap-2 rounded-lg border p-3 text-sm sm:flex-1',
                orgWideDeptIds.length
                  ? 'border-[#d8d8d8] bg-[#faf9f6] text-[#121212]'
                  : 'cursor-not-allowed border-[#e8e8e8] bg-[#f5f4f1] text-[#9b9b9b]',
              ].join(' ')}
            >
              <input
                type="radio"
                name="delivery-mode"
                className="mt-0.5"
                disabled={!orgWideDeptIds.length || orgWideCapsLoading}
                checked={deliveryMode === 'org_wide'}
                onChange={() => setDeliveryMode('org_wide')}
              />
              <span>
                <span className="font-medium">Org-wide</span>
                <span className="mt-0.5 block text-[12px] text-[#6b6b6b]">
                  Everyone in the organisation. Requires permission from a department.
                </span>
              </span>
            </label>
          </div>
          {!orgWideDeptIds.length && !orgWideCapsLoading && !canPublishWithoutApproval ? (
            <p className="mt-2 text-[12px] text-[#9b9b9b]">
              You don&apos;t have org-wide send permission on any department. Ask an org admin to enable &ldquo;Send
              org-wide&rdquo; under Admin → Departments, or use Specific.
            </p>
          ) : null}
          {orgWideCapsLoading ? <p className="mt-2 text-[12px] text-[#6b6b6b]">Checking permissions...</p> : null}
        </div>
      ) : null}

      {!draftOnly && isOrgWideActive ? (
        <div>
          <label className="mb-1 block text-sm font-medium text-[#121212]">Permission department</label>
          <p className="mb-2 text-[12px] leading-snug text-[#6b6b6b]">
            Which department authorises this org-wide send (for approvals and audit). This is not the audience filter.
          </p>
          <SelectWithChevron
            value={displayAuthorityDeptId}
            onChange={(e) => setAuthorityDeptId(e.target.value)}
            disabled={!authorityDeptOptions.length}
          >
            {!authorityDeptOptions.length ? <option value="">No permitted departments</option> : null}
            {authorityDeptOptions.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </SelectWithChevron>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-[#121212]">Department</label>
            <p className="mb-2 text-[12px] leading-snug text-[#6b6b6b]">
              Recipients see this on the post (e.g. HR for a staff away day).
            </p>
            <SelectWithChevron
              value={displayDeptId}
              onChange={(e) => setDeptId(e.target.value)}
              disabled={!departments.length}
            >
              {!departments.length ? (
                <option value="">Loading departments...</option>
              ) : null}
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </SelectWithChevron>
          </div>
          <div>
            <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
              <label className="block text-sm font-medium text-[#121212]">{composeChannelLabel}</label>
              <Link
                href="/settings"
                className="text-[12px] font-medium text-[#6b6b6b] underline underline-offset-2 hover:text-[#121212]"
              >
                {composeManageChannelsInSettings}
              </Link>
            </div>
            <p className="mb-2 text-[12px] leading-snug text-[#6b6b6b]">{composeChannelExplainer}</p>
            <SelectWithChevron
              value={displayCatId}
              onChange={(e) => setCatId(e.target.value)}
              disabled={!cats.length}
              aria-describedby={!cats.length ? 'compose-category-hint' : undefined}
            >
              {!cats.length ? (
                <option value="">No channels for this department</option>
              ) : null}
              {cats.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </SelectWithChevron>
            {!cats.length ? (
              <p id="compose-category-hint" className="mt-1.5 text-[12px] leading-snug text-[#6b6b6b]">
                {composeNoChannelsHint(
                  departments.find((d) => d.id === displayDeptId)?.name ?? 'this department'
                )}
              </p>
            ) : null}
          </div>
        </div>
      )}

      {!draftOnly && deliveryMode === 'specific' && teamsForDept.length > 0 ? (
        <div>
          <label className="mb-1 block text-sm font-medium text-[#121212]">Team (optional)</label>
          <p className="mb-2 text-[12px] leading-snug text-[#6b6b6b]">
            Only people on the selected team get the post (mixed roles are fine).{' '}
            <span className="font-medium text-[#121212]">Org admins</span> and{' '}
            <span className="font-medium text-[#121212]">department managers</span> can target any team here without
            being on it. If you are only a <span className="font-medium text-[#121212]">team owner</span> and not a
            department member or manager, you must pick one of your teams. Manage teams under{' '}
            <span className="font-medium text-[#121212]">Admin → Teams</span> or{' '}
            <span className="font-medium text-[#121212]">Departments</span>. Leave &ldquo;All members in this
            department&rdquo; for channel-wide delivery (no team filter).
          </p>
          <SelectWithChevron value={teamId} onChange={(e) => setTeamId(e.target.value)}>
            <option value="">All members in this department</option>
            {teamsForDept.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </SelectWithChevron>
        </div>
      ) : null}

      {!draftOnly && deliveryMode === 'specific' ? (
        <div>
          <label className="mb-1 block text-sm font-medium text-[#121212]">
            Collaboration departments (optional)
          </label>
          <p className="mb-2 text-[12px] leading-snug text-[#6b6b6b]">
            Add extra departments to make this a cross-department broadcast. Members subscribed to channels
            in any selected collaboration department can also see this post.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {departments
              .filter((d) => d.id !== displayDeptId)
              .map((d) => (
                <label
                  key={d.id}
                  className="flex cursor-pointer items-center gap-2 rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-sm text-[#121212]"
                >
                  <input
                    type="checkbox"
                    checked={collabDeptIds.includes(d.id)}
                    onChange={(e) =>
                      setCollabDeptIds((prev) =>
                        e.target.checked ? [...new Set([...prev, d.id])] : prev.filter((id) => id !== d.id)
                      )
                    }
                  />
                  <span>{d.name}</span>
                </label>
              ))}
          </div>
        </div>
      ) : null}

      {!draftOnly && capsDeptId ? (
        <div className="rounded-lg border border-[#d8d8d8] bg-white p-3">
          <p className="text-sm font-medium text-[#121212]">Delivery options</p>
          <p className="mt-1 text-[12px] leading-snug text-[#6b6b6b]">
            {isOrgWideActive
              ? 'Org-wide posts reach all active members. You can still pin when allowed.'
              : 'Optional reach and ordering for this channel.'}
          </p>
          {capsLoading ? (
            <p className="mt-2 text-xs text-[#6b6b6b]">Loading options...</p>
          ) : showExtraDelivery ? (
            <div className="mt-3 space-y-2.5">
              {!isOrgWideActive && caps.mandatory_broadcast ? (
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
                      Deliver to everyone in the target audience regardless of channel subscription.
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
              No extra delivery options for this context. An org admin can enable toggles under Admin → Departments.
            </p>
          )}
        </div>
      ) : null}

      <div>
        <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-sm font-medium text-[#121212]">Write</p>
            <p className="mt-0.5 text-[12px] leading-snug text-[#6b6b6b]">
              Edit visually like Notion — content is stored as markdown for the feed. Select text for a quick format bar.
            </p>
          </div>
        </div>
        <div className="overflow-hidden rounded-2xl border border-[#e8e4df] bg-white shadow-[0_2px_12px_rgba(15,15,15,0.05)]">
          <div
            className="flex flex-wrap items-center gap-0.5 border-b border-[#f0ebe6] bg-[#faf9f7] px-2 py-1.5 sm:gap-1 sm:px-3"
            role="toolbar"
            aria-label="Text formatting"
          >
            <button
              type="button"
              className="rounded-md px-2.5 py-1.5 text-[13px] font-medium text-[#504e49] transition hover:bg-[#ebe8e3] active:bg-[#e3dfd9]"
              onClick={() => bodyEditorRef.current?.bold()}
            >
              Bold
            </button>
            <button
              type="button"
              className="rounded-md px-2.5 py-1.5 text-[13px] font-medium text-[#504e49] transition hover:bg-[#ebe8e3] active:bg-[#e3dfd9]"
              onClick={() => bodyEditorRef.current?.italic()}
            >
              Italic
            </button>
            <span className="mx-0.5 hidden h-4 w-px shrink-0 bg-[#ddd9d4] sm:block" aria-hidden />
            <button
              type="button"
              className="rounded-md px-2.5 py-1.5 text-[13px] font-medium text-[#504e49] transition hover:bg-[#ebe8e3] active:bg-[#e3dfd9]"
              onClick={() => bodyEditorRef.current?.bulletList()}
            >
              Bullet list
            </button>
            <button
              type="button"
              className="rounded-md px-2.5 py-1.5 text-[13px] font-medium text-[#504e49] transition hover:bg-[#ebe8e3] active:bg-[#e3dfd9]"
              onClick={() => bodyEditorRef.current?.orderedList()}
            >
              Numbered
            </button>
            <span className="mx-0.5 hidden h-4 w-px shrink-0 bg-[#ddd9d4] sm:block" aria-hidden />
            <button
              type="button"
              className="rounded-md px-2.5 py-1.5 text-[13px] font-medium text-[#504e49] transition hover:bg-[#ebe8e3] active:bg-[#e3dfd9]"
              onClick={() => bodyEditorRef.current?.undo()}
            >
              Undo
            </button>
            <button
              type="button"
              className="rounded-md px-2.5 py-1.5 text-[13px] font-medium text-[#504e49] transition hover:bg-[#ebe8e3] active:bg-[#e3dfd9]"
              onClick={() => bodyEditorRef.current?.redo()}
            >
              Redo
            </button>
          </div>
          <BroadcastBodyEditor
            ref={bodyEditorRef}
            markdown={body}
            onMarkdownChange={setBody}
            disabled={saving}
            placeholder="Write something for your organisation…"
          />
          <p className="border-t border-[#f0ebe6] px-5 py-2.5 text-[12px] leading-snug text-[#9b9b9b] sm:px-6">
            <kbd className="rounded bg-[#f0ebe6] px-1 py-0.5 font-sans text-[11px] text-[#504e49]">⌘/Ctrl+B</kbd> bold,{' '}
            <kbd className="rounded bg-[#f0ebe6] px-1 py-0.5 font-sans text-[11px] text-[#504e49]">⌘/Ctrl+I</kbd> italic,{' '}
            <kbd className="rounded bg-[#f0ebe6] px-1 py-0.5 font-sans text-[11px] text-[#504e49]">⌘/Ctrl+Z</kbd> undo. Type{' '}
            <kbd className="rounded bg-[#f0ebe6] px-1 py-0.5 font-sans text-[11px] text-[#504e49]">#</kbd> then space for a
            heading.
          </p>
        </div>
      </div>

      {!draftOnly ? (
        <div className="flex flex-col gap-2 rounded-lg border border-[#d8d8d8] bg-white p-3">
          <label className="flex items-center gap-2 text-sm text-[#121212]">
            <input type="checkbox" checked={schedule} onChange={(e) => setSchedule(e.target.checked)} />
            Schedule send
          </label>
          {schedule ? (
            <input
              type="datetime-local"
              min={minScheduleLocal}
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
        {draftOnly ? (
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
