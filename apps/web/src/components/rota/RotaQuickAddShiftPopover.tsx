'use client';

import { queueEntityCalendarSync } from '@/lib/calendar/queueEntityCalendarSync';
import { createClient } from '@/lib/supabase/client';
import { friendlyDbError } from '@/lib/rota/friendlyDbError';
import {
  formatAvailabilityHint,
  staffAvailabilityHintForShift,
  type StaffAvailabilityHint,
  type StaffAvailabilityOverride,
  type StaffAvailabilityTemplate,
} from '@/lib/rota/staffAvailability';
import type { ProfileRole } from '@campsite/types';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

type RotaRow = { id: string; title: string; kind: string; dept_id: string | null; status: string };
type StaffOption = { id: string; full_name: string; role: string; dept_ids: string[] };

type Props = {
  orgId: string;
  profileId: string;
  /** When true, default assignee to you so new shifts appear under My schedule (that view only loads your `user_id`). */
  assignToSelfIfUnassigned: boolean;
  profileRole: ProfileRole;
  departments: { id: string; name: string }[];
  staff: StaffOption[];
  managedDeptIds: string[];
  rotas: RotaRow[];
  requireRota: boolean;
  availabilityTemplates: StaffAvailabilityTemplate[];
  availabilityOverrides: StaffAvailabilityOverride[];
  position: { top: number; left: number };
  startLocal: string;
  endLocal: string;
  onTimesChange: (startLocal: string, endLocal: string) => void;
  onClose: () => void;
  onCreated: () => void | Promise<void>;
  onMoreOptions: () => void;
};

export function RotaQuickAddShiftPopover({
  orgId,
  profileId,
  assignToSelfIfUnassigned,
  profileRole,
  departments,
  staff,
  managedDeptIds,
  rotas,
  requireRota,
  availabilityTemplates,
  availabilityOverrides,
  position,
  startLocal,
  endLocal,
  onTimesChange,
  onClose,
  onCreated,
  onMoreOptions,
}: Props) {
  const supabase = useMemo(() => createClient(), []);
  const cardRef = useRef<HTMLDivElement>(null);
  const [title, setTitle] = useState('');
  const [rotaId, setRotaId] = useState('');
  const [deptId, setDeptId] = useState('');
  const [userId, setUserId] = useState(() => (assignToSelfIfUnassigned ? profileId : ''));
  const [level, setLevel] = useState<'all' | 'csa' | 'dm'>('all');
  const [busyStaffIds, setBusyStaffIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [clampedPos, setClampedPos] = useState(position);

  useEffect(() => {
    if (profileRole === 'manager' && managedDeptIds.length === 1) {
      setDeptId(managedDeptIds[0]!);
    }
  }, [profileRole, managedDeptIds]);

  useEffect(() => {
    setClampedPos(position);
  }, [position]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    const clampToViewport = () => {
      const el = cardRef.current;
      if (!el) return;
      const margin = 12;
      const maxLeft = Math.max(margin, window.innerWidth - el.offsetWidth - margin);
      const maxTop = Math.max(margin, window.innerHeight - el.offsetHeight - margin);
      const next = {
        left: Math.min(Math.max(position.left, margin), maxLeft),
        top: Math.min(Math.max(position.top, margin), maxTop),
      };
      setClampedPos((prev) =>
        prev.left === next.left && prev.top === next.top ? prev : next
      );
    };
    clampToViewport();
    window.addEventListener('resize', clampToViewport);
    return () => window.removeEventListener('resize', clampToViewport);
  }, [position.left, position.top]);

  const deptOptions =
    profileRole === 'manager'
      ? departments.filter((d) => managedDeptIds.includes(d.id))
      : departments;

  const roleLevel = useCallback((role: string): 'csa' | 'dm' | 'other' => {
    const r = (role || '').toLowerCase();
    if (r === 'duty_manager') return 'dm';
    if (r === 'administrator' || r === 'csa') return 'csa';
    return 'other';
  }, []);

  useEffect(() => {
    if (!startLocal || !endLocal) return;
    const start = new Date(startLocal);
    const end = new Date(endLocal);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) return;
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from('rota_shifts')
        .select('user_id')
        .eq('org_id', orgId)
        .lt('start_time', end.toISOString())
        .gt('end_time', start.toISOString());
      if (cancelled) return;
      const ids = new Set((data ?? []).map((r) => r.user_id as string).filter(Boolean));
      setBusyStaffIds(ids);
    })();
    return () => {
      cancelled = true;
    };
  }, [supabase, orgId, startLocal, endLocal]);

  const eligibleStaff = useMemo(() => {
    return staff.filter((s) => {
      if (deptId && !s.dept_ids.includes(deptId)) return false;
      if (level !== 'all' && roleLevel(s.role) !== level) return false;
      return !busyStaffIds.has(s.id);
    });
  }, [staff, deptId, level, roleLevel, busyStaffIds]);

  useEffect(() => {
    if (userId && !eligibleStaff.some((s) => s.id === userId)) {
      setUserId('');
    }
  }, [eligibleStaff, userId]);

  const assigneeHintById = useMemo(() => {
    if (!startLocal || !endLocal) return new Map<string, StaffAvailabilityHint>();
    const start = new Date(startLocal);
    const end = new Date(endLocal);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
      return new Map<string, StaffAvailabilityHint>();
    }
    const m = new Map<string, StaffAvailabilityHint>();
    for (const s of eligibleStaff) {
      m.set(
        s.id,
        staffAvailabilityHintForShift(s.id, start, end, availabilityTemplates, availabilityOverrides),
      );
    }
    return m;
  }, [startLocal, endLocal, eligibleStaff, availabilityTemplates, availabilityOverrides]);

  const save = useCallback(async () => {
    setMsg(null);
    if (requireRota && !rotaId) {
      setMsg('Choose a rota.');
      return;
    }
    if (profileRole === 'manager' && !deptId) {
      setMsg('Choose a department.');
      return;
    }
    if (!startLocal || !endLocal) {
      setMsg('Start and end are required.');
      return;
    }
    const start = new Date(startLocal);
    const end = new Date(endLocal);
    if (end <= start) {
      setMsg('End must be after start.');
      return;
    }
    setSaving(true);
    const { data: shiftRow, error } = await supabase
      .from('rota_shifts')
      .insert({
        org_id: orgId,
        rota_id: rotaId || null,
        dept_id: deptId || null,
        user_id: userId || null,
        role_label: title.trim() || null,
        notes: null,
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        source: 'manual',
      })
      .select('id')
      .single();
    setSaving(false);
    if (error) {
      setMsg(friendlyDbError(error.message));
      return;
    }
    if (shiftRow?.id) {
      queueEntityCalendarSync({ type: 'shift', id: shiftRow.id as string, action: 'upsert' });
    }
    await Promise.resolve(onCreated());
    onClose();
  }, [
    requireRota,
    rotaId,
    profileRole,
    deptId,
    startLocal,
    endLocal,
    title,
    userId,
    orgId,
    supabase,
    onClose,
    onCreated,
  ]);

  const field =
    'w-full rounded-lg border border-[#e4e2dc] bg-white px-3 py-2 text-[13px] text-[#121212] shadow-sm outline-none transition-colors focus:border-[#121212] focus:ring-2 focus:ring-[#121212]/8';

  return (
    <>
      <button
        type="button"
        className="fixed inset-0 z-[60] cursor-default bg-transparent"
        aria-label="Close"
        onClick={onClose}
      />
      <div
        ref={cardRef}
        className="fixed z-[70] flex max-h-[calc(100dvh-24px)] w-[min(100vw-24px,380px)] flex-col overflow-hidden rounded-xl border border-[#e4e2dc] bg-[#faf9f6] shadow-[0_10px_40px_rgba(18,18,18,0.09),0_2px_8px_rgba(18,18,18,0.04)]"
        style={{ top: clampedPos.top, left: clampedPos.left }}
        role="dialog"
        aria-labelledby="rota-quick-add-heading"
      >
        <div className="flex items-center justify-between gap-3 border-b border-[#ebe9e4] bg-[#f5f4f1]/90 px-4 py-3">
          <h2 id="rota-quick-add-heading" className="font-authSerif text-[18px] tracking-tight text-[#121212]">
            New shift
          </h2>
          <button
            type="button"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[18px] leading-none text-[#6b6b6b] transition hover:bg-[#ebe9e4] hover:text-[#121212]"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <div className="overflow-y-auto px-4 pb-4 pt-4">
          <label className="sr-only" htmlFor="rota-quick-add-title-input">
            Title (optional)
          </label>
          <input
            id="rota-quick-add-title-input"
            className="mb-4 w-full border-0 border-b-2 border-[#d4d2cc] bg-transparent pb-2.5 text-[17px] font-medium text-[#121212] placeholder:text-[#9b9b9b] outline-none transition focus:border-[#121212]"
            placeholder="Add title (optional)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            autoFocus
          />

          <div className="mb-4 rounded-lg border border-[#ebe9e4] bg-white/90 p-3 shadow-sm">
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#9b9b9b]">When</div>
            <div className="grid grid-cols-2 gap-3">
              <label className="block text-[11px] font-medium text-[#6b6b6b]">
                Start
                <input
                  type="datetime-local"
                  className={`${field} mt-1.5`}
                  value={startLocal}
                  onChange={(e) => onTimesChange(e.target.value, endLocal)}
                />
              </label>
              <label className="block text-[11px] font-medium text-[#6b6b6b]">
                End
                <input
                  type="datetime-local"
                  className={`${field} mt-1.5`}
                  value={endLocal}
                  onChange={(e) => onTimesChange(startLocal, e.target.value)}
                />
              </label>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-[#9b9b9b]">
              Uses your device time zone - same as the week grid above.
            </p>
          </div>

          {deptOptions.length > 0 ? (
            <label className="mb-3 block text-[12px] font-medium text-[#121212]">
              Department{profileRole === 'manager' ? ' (required)' : ''}
              <select className={`${field} mt-1.5`} value={deptId} onChange={(e) => setDeptId(e.target.value)}>
                <option value="">-</option>
                {deptOptions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <label className="mb-3 block text-[12px] font-medium text-[#121212]">
            Level
            <select className={`${field} mt-1.5`} value={level} onChange={(e) => setLevel(e.target.value as 'all' | 'csa' | 'dm')}>
              <option value="all">All levels</option>
              <option value="csa">CSA</option>
              <option value="dm">DM</option>
            </select>
          </label>

          <label className="mb-3 block text-[12px] font-medium text-[#121212]">
            Assignee
            <select className={`${field} mt-1.5`} value={userId} onChange={(e) => setUserId(e.target.value)}>
              <option value="">Open slot</option>
              {eligibleStaff.map((s) => {
                const hint = assigneeHintById.get(s.id);
                const hintLabel = hint ? ` — ${formatAvailabilityHint(hint)}` : '';
                return (
                  <option key={s.id} value={s.id}>
                    {s.full_name}
                    {hintLabel}
                  </option>
                );
              })}
            </select>
          </label>

          <label className="mb-1 block text-[12px] font-medium text-[#121212]">
            Rota {requireRota ? '(required)' : '(optional)'}
            <select className={`${field} mt-1.5`} value={rotaId} onChange={(e) => setRotaId(e.target.value)}>
              <option value="">-</option>
              {rotas.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title}
                  {r.status === 'draft' ? ' (draft)' : ''}
                </option>
              ))}
            </select>
          </label>

          {msg ? (
            <p className="mt-3 rounded-lg border border-red-200/80 bg-red-50 px-3 py-2 text-[12px] text-red-900">{msg}</p>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#ebe9e4] bg-[#f5f4f1]/50 px-4 py-3">
          <div className="flex flex-wrap gap-4">
            <button
              type="button"
              className="text-[13px] font-medium text-[#6b6b6b] transition hover:text-[#121212]"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="button"
              className="text-[13px] font-medium text-[#6b6b6b] transition hover:text-[#121212]"
              onClick={onMoreOptions}
            >
              More options
            </button>
          </div>
          <button
            type="button"
            disabled={saving}
            className="rounded-xl bg-[#121212] px-5 py-2.5 text-[13px] font-semibold text-[#faf9f6] shadow-sm transition hover:bg-[#2d2d2d] disabled:opacity-50"
            onClick={() => void save()}
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </>
  );
}
