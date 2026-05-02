'use client';

import {
  GRID_END_HOUR,
  GRID_HEIGHT_PX,
  GRID_START_HOUR,
  gridBandMinutesForShiftOnStartDay,
  layoutWeekShifts,
  localYmd,
  movedShiftRange,
  PX_PER_HOUR,
  SNAP_MINUTES,
  slotHighlightPx,
  snappedResizeShiftEnd,
  snappedResizeShiftStart,
  snapMinutesFromMidnight,
} from '@/lib/rota/weekGridLayout';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const DRAG_THRESHOLD_PX = 10;
const TAP_THRESHOLD_PX = 10;
const SLOT_SELECT_TAP_PX = 8;

export type WeekGridShiftBase = {
  id: string;
  start_time: string;
  end_time: string;
  dept_id: string | null;
  user_id: string | null;
  role_label: string | null;
  notes: string | null;
};

type ShiftTitleFn<T extends WeekGridShiftBase> = (s: T) => {
  time: string;
  primary: string;
  secondary: string | null;
};

type Props<T extends WeekGridShiftBase> = {
  days: Date[];
  shifts: T[];
  shiftVariant: (key: string | null) => { bg: string; border: string; text: string };
  shiftTitleLines: ShiftTitleFn<T>;
  overlapShiftIds: Set<string>;
  canEdit: boolean;
  onShiftClick: (s: T) => void;
  onShiftTimesUpdated: (shiftId: string, startIso: string, endIso: string) => Promise<void>;
  onBackgroundSlotClick?: (detail: {
    dayIndex: number;
    startMinutesFromMidnight: number;
    endMinutesFromMidnight: number;
    clientX: number;
    clientY: number;
    /** Centre of day column + vertical position of selection midpoint (for popover placement). */
    popoverAnchorX: number;
    popoverAnchorY: number;
  }) => void;
  /** Draft block while quick-add is open (Google Calendar-style). */
  draftSlotHighlight?: {
    dayIndex: number;
    startMin: number;
    endMin: number;
    primary: string;
    secondary: string;
  } | null;
  /**
   * Org calendar busy blocks for the signed-in user (manual / broadcast events), drawn behind shifts.
   * Same coordinate system as shifts — use normalized `{ id, start_time, end_time }` from `calendarEventForWeekLayout`.
   */
  calendarBusyBlocks?: Array<{ id: string; title: string; start_time: string; end_time: string }>;
};

const HOUR_COUNT = GRID_END_HOUR - GRID_START_HOUR;

/** Nearest ancestor that scrolls horizontally (e.g. week grid `overflow-x-auto`). */
function horizontalScrollParent(el: HTMLElement | null): HTMLElement | null {
  let p: HTMLElement | null = el?.parentElement ?? null;
  while (p) {
    const ox = getComputedStyle(p).overflowX;
    if ((ox === 'auto' || ox === 'scroll') && p.scrollWidth > p.clientWidth + 1) return p;
    p = p.parentElement;
  }
  return null;
}

/** Viewport Y for a minute-of-day on the grid (centre of selection vertically). */
function viewportYForMinuteInColumn(columnEl: HTMLElement, minutesFromMidnight: number): number {
  const r = columnEl.getBoundingClientRect();
  const padTop = Number.parseFloat(getComputedStyle(columnEl).paddingTop) || 0;
  const innerH = Math.max(1, Math.min(GRID_HEIGHT_PX, r.height - padTop));
  const spanMin = HOUR_COUNT * 60;
  const base = GRID_START_HOUR * 60;
  const m = Math.min(Math.max(minutesFromMidnight, base), base + spanMin);
  const frac = (m - base) / spanMin;
  return r.top + padTop + frac * innerH;
}

type DragSession<T> = {
  shift: T;
  pointerId: number;
  startX: number;
  startY: number;
  moved: boolean;
  /** Viewport rect of the shift block at pointer-down (before this drag’s transform). */
  blockRect: { top: number; left: number; width: number; height: number };
  windowScrollY: number;
  windowScrollX: number;
  hScrollParent: HTMLElement | null;
  hScrollLeft0: number;
};

export function RotaWeekTimeGrid<T extends WeekGridShiftBase>({
  days,
  shifts,
  shiftVariant,
  shiftTitleLines,
  overlapShiftIds,
  canEdit,
  onShiftClick,
  onShiftTimesUpdated,
  onBackgroundSlotClick,
  draftSlotHighlight,
  calendarBusyBlocks,
}: Props<T>) {
  const colRefs = useRef<(HTMLDivElement | null)[]>([]);
  const [resizeLive, setResizeLive] = useState<{
    shiftId: string;
    start_time: string;
    end_time: string;
  } | null>(null);
  const [resizingShiftId, setResizingShiftId] = useState<string | null>(null);

  const shiftsForLayout = useMemo(() => {
    if (!resizeLive) return shifts;
    return shifts.map((row) =>
      row.id === resizeLive.shiftId
        ? ({ ...row, start_time: resizeLive.start_time, end_time: resizeLive.end_time } as T)
        : row,
    );
  }, [shifts, resizeLive]);

  const layout = useMemo(() => layoutWeekShifts(shiftsForLayout, days), [shiftsForLayout, days]);
  const calendarLayout = useMemo(
    () =>
      calendarBusyBlocks?.length
        ? layoutWeekShifts(
            calendarBusyBlocks.map((c) => ({ id: c.id, start_time: c.start_time, end_time: c.end_time })),
            days,
          )
        : [],
    [calendarBusyBlocks, days],
  );
  const calendarById = useMemo(
    () => new Map((calendarBusyBlocks ?? []).map((c) => [c.id, c])),
    [calendarBusyBlocks],
  );
  const shiftById = useMemo(() => new Map(shiftsForLayout.map((s) => [s.id, s])), [shiftsForLayout]);

  const resizeSessionRef = useRef<{
    edge: 'start' | 'end';
    shift: T;
    dayIndex: number;
    pointerId: number;
  } | null>(null);
  const resizeCleanupRef = useRef<(() => void) | null>(null);

  const dragSessionRef = useRef<DragSession<T> | null>(null);
  const dragCleanupRef = useRef<(() => void) | null>(null);
  const [draggingShiftId, setDraggingShiftId] = useState<string | null>(null);
  const [dragDelta, setDragDelta] = useState({ dx: 0, dy: 0 });

  const slotSelectCleanupRef = useRef<(() => void) | null>(null);
  const slotSelectSessionRef = useRef<{
    dayIndex: number;
    pointerId: number;
    anchorMin: number;
    startX: number;
    startY: number;
  } | null>(null);
  const [slotSelectionPreview, setSlotSelectionPreview] = useState<{
    dayIndex: number;
    startMin: number;
    endMin: number;
  } | null>(null);
  const [shiftDropPreview, setShiftDropPreview] = useState<{
    shiftId: string;
    dayIndex: number;
    startMin: number;
    endMin: number;
    label: string;
    lane: number;
    laneCount: number;
    variantKey: string | null;
  } | null>(null);
  /** Latest drag delta while moving a shift - used when scroll fires without pointermove. */
  const lastShiftDragDeltaRef = useRef({ dx: 0, dy: 0 });

  /** Map pointer Y to minutes; accounts for column padding (`pt-1`) so 6:00 aligns with the top grid line. */
  const minutesFromPointerInColumn = useCallback((clientY: number, columnEl: HTMLElement) => {
    const r = columnEl.getBoundingClientRect();
    const padTop = Number.parseFloat(getComputedStyle(columnEl).paddingTop) || 0;
    const innerH = Math.max(1, Math.min(GRID_HEIGHT_PX, r.height - padTop));
    const y = Math.min(Math.max(clientY - r.top - padTop, 0), innerH);
    const frac = y / innerH;
    const spanMin = HOUR_COUNT * 60;
    const raw = GRID_START_HOUR * 60 + frac * spanMin;
    return snapMinutesFromMidnight(raw);
  }, []);

  const columnIndexFromClientX = useCallback(
    (clientX: number): number => {
      for (let i = 0; i < days.length; i++) {
        const el = colRefs.current[i];
        if (!el) continue;
        const r = el.getBoundingClientRect();
        if (clientX >= r.left && clientX <= r.right) return i;
      }
      let best = 0;
      let bestDist = Infinity;
      for (let i = 0; i < days.length; i++) {
        const el = colRefs.current[i];
        if (!el) continue;
        const r = el.getBoundingClientRect();
        const mid = (r.left + r.right) / 2;
        const d = Math.abs(clientX - mid);
        if (d < bestDist) {
          bestDist = d;
          best = i;
        }
      }
      return best;
    },
    [days.length],
  );

  const endDragSession = useCallback(() => {
    dragCleanupRef.current?.();
    dragCleanupRef.current = null;
    dragSessionRef.current = null;
    setDraggingShiftId(null);
    setDragDelta({ dx: 0, dy: 0 });
    setShiftDropPreview(null);
  }, []);

  useEffect(() => () => endDragSession(), [endDragSession]);

  const endSlotSelectSession = useCallback(() => {
    slotSelectCleanupRef.current?.();
    slotSelectCleanupRef.current = null;
    slotSelectSessionRef.current = null;
    setSlotSelectionPreview(null);
  }, []);

  useEffect(() => () => endSlotSelectSession(), [endSlotSelectSession]);

  const endResizeSession = useCallback(() => {
    resizeCleanupRef.current?.();
    resizeCleanupRef.current = null;
    resizeSessionRef.current = null;
    setResizeLive(null);
    setResizingShiftId(null);
  }, []);

  useEffect(() => () => endResizeSession(), [endResizeSession]);

  const startResizeSession = useCallback(
    (edge: 'start' | 'end', shift: T, dayIndex: number, pointerId: number) => {
      endDragSession();
      endSlotSelectSession();
      resizeCleanupRef.current?.();
      resizeCleanupRef.current = null;
      resizeSessionRef.current = { edge, shift, dayIndex, pointerId };
      setResizingShiftId(shift.id);

      const onMove = (ev: PointerEvent) => {
        const sess = resizeSessionRef.current;
        if (!sess || ev.pointerId !== sess.pointerId) return;
        const col = colRefs.current[sess.dayIndex];
        if (!col) return;
        const day = days[sess.dayIndex];
        if (!day) return;
        const mins = minutesFromPointerInColumn(ev.clientY, col);
        const next =
          sess.edge === 'start'
            ? snappedResizeShiftStart(sess.shift, day, mins)
            : snappedResizeShiftEnd(sess.shift, day, mins);
        if (next) {
          setResizeLive({ shiftId: sess.shift.id, start_time: next.start_time, end_time: next.end_time });
        }
      };

      const onUp = async (ev: PointerEvent) => {
        const sess = resizeSessionRef.current;
        if (!sess || ev.pointerId !== sess.pointerId) return;
        const col = colRefs.current[sess.dayIndex];
        const day = days[sess.dayIndex];
        resizeCleanupRef.current?.();
        resizeCleanupRef.current = null;
        resizeSessionRef.current = null;
        setResizeLive(null);
        setResizingShiftId(null);

        if (!col || !day) return;

        const mins = minutesFromPointerInColumn(ev.clientY, col);
        const next =
          sess.edge === 'start'
            ? snappedResizeShiftStart(sess.shift, day, mins)
            : snappedResizeShiftEnd(sess.shift, day, mins);
        if (!next) return;
        if (next.start_time === sess.shift.start_time && next.end_time === sess.shift.end_time) return;
        await onShiftTimesUpdated(sess.shift.id, next.start_time, next.end_time);
      };

      const cleanup = () => {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        document.removeEventListener('pointercancel', onUp);
        resizeCleanupRef.current = null;
      };

      resizeCleanupRef.current = cleanup;
      document.addEventListener('pointermove', onMove, { passive: true });
      document.addEventListener('pointerup', onUp);
      document.addEventListener('pointercancel', onUp);
    },
    [
      days,
      endDragSession,
      endSlotSelectSession,
      minutesFromPointerInColumn,
      onShiftTimesUpdated,
    ],
  );

  const startDragSession = useCallback(
    (
      shift: T,
      pointerId: number,
      clientX: number,
      clientY: number,
      blockEl: HTMLElement,
      blockRect: { top: number; left: number; width: number; height: number },
    ) => {
      endResizeSession();
      endDragSession();
      const hScrollParent = horizontalScrollParent(blockEl);
      dragSessionRef.current = {
        shift,
        pointerId,
        startX: clientX,
        startY: clientY,
        moved: false,
        blockRect,
        windowScrollY: typeof window !== 'undefined' ? window.scrollY : 0,
        windowScrollX: typeof window !== 'undefined' ? window.scrollX : 0,
        hScrollParent,
        hScrollLeft0: hScrollParent?.scrollLeft ?? 0,
      };
      setDraggingShiftId(shift.id);
      setDragDelta({ dx: 0, dy: 0 });

      const viewportPointForDrag = (s: DragSession<T>, dx: number, dy: number) => {
        const dSY = (typeof window !== 'undefined' ? window.scrollY : 0) - s.windowScrollY;
        const dSX = (typeof window !== 'undefined' ? window.scrollX : 0) - s.windowScrollX;
        const dSL = s.hScrollParent ? s.hScrollParent.scrollLeft - s.hScrollLeft0 : 0;
        const br = s.blockRect;
        return {
          virtCenterX: br.left + br.width / 2 + dx - dSX - dSL,
          virtTopY: br.top + dy - dSY,
        };
      };

      const applyShiftDropPreview = (s: DragSession<T>, dx: number, dy: number) => {
        const { virtCenterX, virtTopY } = viewportPointForDrag(s, dx, dy);
        const dayIdx = columnIndexFromClientX(virtCenterX);
        const col = colRefs.current[dayIdx];
        const targetDay = days[dayIdx];
        if (!col || !targetDay) {
          setShiftDropPreview(null);
          return;
        }

        const mins = minutesFromPointerInColumn(virtTopY, col);
        const { start_time, end_time } = movedShiftRange(
          s.shift.start_time,
          s.shift.end_time,
          targetDay,
          mins,
        );
        const ds = new Date(start_time);
        const de = new Date(end_time);
        const { startMin, endMin } = gridBandMinutesForShiftOnStartDay(ds, de);
        const label = `${ds.toLocaleTimeString('en-GB', { timeZone: 'UTC',  hour: 'numeric', minute: '2-digit' })} - ${de.toLocaleTimeString('en-GB', { timeZone: 'UTC',  hour: 'numeric', minute: '2-digit' })}`;
        const le = layout.find((x) => x.shiftId === s.shift.id);
        const lane = le?.lane ?? 0;
        const laneCount = Math.max(1, le?.laneCount ?? 1);
        setShiftDropPreview({
          shiftId: s.shift.id,
          dayIndex: dayIdx,
          startMin,
          endMin,
          label,
          lane,
          laneCount,
          variantKey: s.shift.dept_id ?? s.shift.id,
        });
      };

      const onScrollDuringShiftDrag = () => {
        const s = dragSessionRef.current;
        if (!s?.moved) return;
        const { dx, dy } = lastShiftDragDeltaRef.current;
        applyShiftDropPreview(s, dx, dy);
      };

      const horizScrollOpts: AddEventListenerOptions = { passive: true };
      window.addEventListener('scroll', onScrollDuringShiftDrag, true);
      if (hScrollParent) {
        hScrollParent.addEventListener('scroll', onScrollDuringShiftDrag, horizScrollOpts);
      }

      const onMove = (ev: PointerEvent) => {
        const s = dragSessionRef.current;
        if (!s || ev.pointerId !== s.pointerId) return;
        const dx = ev.clientX - s.startX;
        const dy = ev.clientY - s.startY;
        if (Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) {
          s.moved = true;
        }
        setDragDelta({ dx, dy });

        if (!s.moved) {
          setShiftDropPreview(null);
          return;
        }

        lastShiftDragDeltaRef.current = { dx, dy };
        applyShiftDropPreview(s, dx, dy);
      };

      const onUp = async (ev: PointerEvent) => {
        const s = dragSessionRef.current;
        if (!s || ev.pointerId !== s.pointerId) return;

        const didDrag = s.moved;
        const shift = s.shift;
        const sid = shift.id;
        const dx = ev.clientX - s.startX;
        const dy = ev.clientY - s.startY;
        const { virtCenterX, virtTopY } = viewportPointForDrag(s, dx, dy);
        endDragSession();

        if (!didDrag) {
          onShiftClick(shift);
          return;
        }

        const dayIdx = columnIndexFromClientX(virtCenterX);
        const col = colRefs.current[dayIdx];
        if (!col) return;

        const mins = minutesFromPointerInColumn(virtTopY, col);
        const targetDay = days[dayIdx];
        if (!targetDay) return;

        const { start_time, end_time } = movedShiftRange(shift.start_time, shift.end_time, targetDay, mins);
        if (start_time === shift.start_time && end_time === shift.end_time) return;
        await onShiftTimesUpdated(sid, start_time, end_time);
      };

      const cleanup = () => {
        window.removeEventListener('scroll', onScrollDuringShiftDrag, true);
        hScrollParent?.removeEventListener('scroll', onScrollDuringShiftDrag, horizScrollOpts);
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        document.removeEventListener('pointercancel', onUp);
        dragCleanupRef.current = null;
      };

      dragCleanupRef.current = cleanup;
      document.addEventListener('pointermove', onMove, { passive: true });
      document.addEventListener('pointerup', onUp);
      document.addEventListener('pointercancel', onUp);
    },
    [
      days,
      endDragSession,
      endResizeSession,
      columnIndexFromClientX,
      layout,
      minutesFromPointerInColumn,
      onShiftClick,
      onShiftTimesUpdated,
    ],
  );

  const onPointerDownShift = useCallback(
    (e: React.PointerEvent, shift: T) => {
      if (!canEdit || e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      endResizeSession();
      endSlotSelectSession();
      const el = e.currentTarget as HTMLElement;
      const r = el.getBoundingClientRect();
      startDragSession(shift, e.pointerId, e.clientX, e.clientY, el, {
        top: r.top,
        left: r.left,
        width: r.width,
        height: r.height,
      });
    },
    [canEdit, endResizeSession, endSlotSelectSession, startDragSession],
  );

  const onPointerDownColumn = useCallback(
    (e: React.PointerEvent, dayIndex: number) => {
      if (!canEdit || !onBackgroundSlotClick || e.button !== 0) return;
      if (dragSessionRef.current) return;
      const t = e.target as HTMLElement;
      if (t.closest('[data-rota-shift-block="1"]')) return;

      e.preventDefault();
      endResizeSession();
      endSlotSelectSession();

      const col = colRefs.current[dayIndex];
      if (!col) return;
      const anchorMin = minutesFromPointerInColumn(e.clientY, col);

      slotSelectSessionRef.current = {
        dayIndex,
        pointerId: e.pointerId,
        anchorMin,
        startX: e.clientX,
        startY: e.clientY,
      };
      setSlotSelectionPreview({
        dayIndex,
        startMin: anchorMin,
        endMin: anchorMin,
      });

      const onMove = (ev: PointerEvent) => {
        const s = slotSelectSessionRef.current;
        if (!s || ev.pointerId !== s.pointerId) return;
        const c = colRefs.current[s.dayIndex];
        if (!c) return;
        const cur = minutesFromPointerInColumn(ev.clientY, c);
        const lo = Math.min(s.anchorMin, cur);
        const hi = Math.max(s.anchorMin, cur);
        setSlotSelectionPreview({
          dayIndex: s.dayIndex,
          startMin: lo,
          endMin: hi,
        });
      };

      const onUp = (ev: PointerEvent) => {
        const s = slotSelectSessionRef.current;
        if (!s || ev.pointerId !== s.pointerId) return;
        if (!onBackgroundSlotClick) {
          endSlotSelectSession();
          return;
        }

        const c = colRefs.current[s.dayIndex];
        if (!c) {
          endSlotSelectSession();
          return;
        }

        const cur = minutesFromPointerInColumn(ev.clientY, c);
        const moved = Math.hypot(ev.clientX - s.startX, ev.clientY - s.startY) >= SLOT_SELECT_TAP_PX;

        let startMin: number;
        let endMin: number;
        if (!moved && cur === s.anchorMin) {
          startMin = s.anchorMin;
          endMin = startMin + 60;
        } else {
          startMin = Math.min(s.anchorMin, cur);
          endMin = Math.max(s.anchorMin, cur);
          if (endMin <= startMin) {
            endMin = startMin + 60;
          } else if (endMin - startMin < SNAP_MINUTES) {
            endMin = startMin + SNAP_MINUTES;
          }
        }

        endSlotSelectSession();
        const cr = c.getBoundingClientRect();
        const midMin = (startMin + endMin) / 2;
        const popoverAnchorX = cr.left + cr.width / 2;
        const popoverAnchorY = viewportYForMinuteInColumn(c, midMin);
        onBackgroundSlotClick({
          dayIndex: s.dayIndex,
          startMinutesFromMidnight: startMin,
          endMinutesFromMidnight: endMin,
          clientX: ev.clientX,
          clientY: ev.clientY,
          popoverAnchorX,
          popoverAnchorY,
        });
      };

      const cleanup = () => {
        document.removeEventListener('pointermove', onMove);
        document.removeEventListener('pointerup', onUp);
        document.removeEventListener('pointercancel', onUp);
        slotSelectCleanupRef.current = null;
      };

      slotSelectCleanupRef.current = cleanup;
      document.addEventListener('pointermove', onMove, { passive: true });
      document.addEventListener('pointerup', onUp);
      document.addEventListener('pointercancel', onUp);
    },
    [canEdit, endResizeSession, endSlotSelectSession, minutesFromPointerInColumn, onBackgroundSlotClick],
  );

  return (
    <div className="min-w-[720px] select-none">
      <p className="mb-2 text-[12px] leading-relaxed text-[#6b6b6b]">
        {calendarBusyBlocks && calendarBusyBlocks.length > 0 ? (
          <span className="mb-1 block">
            <strong className="font-medium text-[#121212]">Lavender blocks</strong> are calendar events (from your org
            calendar) so you can see other commitments alongside shifts.
          </span>
        ) : null}
        {canEdit ? (
          <>
            <strong className="font-medium text-[#121212]">Drag</strong> on an empty slot to select a time range (highlight
            preview), then release to add a shift; a short click still defaults to one hour.{' '}
            <strong className="font-medium text-[#121212]">Drag</strong> an existing block to move it - a dashed
            outline shows where it will land (duration unchanged).{' '}
            <strong className="font-medium text-[#121212]">Drag the top or bottom edge</strong> of a block to change
            start or end time. <strong className="font-medium text-[#121212]">Tap</strong> a block to edit.
          </>
        ) : null}
      </p>
      <div className="grid grid-cols-[52px_repeat(7,minmax(0,1fr))] gap-x-1 gap-y-0">
        <div aria-hidden className="min-h-[1px]" />
        {days.map((d) => {
          const now = new Date();
          const dayIsToday =
            d.getFullYear() === now.getFullYear() &&
            d.getMonth() === now.getMonth() &&
            d.getDate() === now.getDate();
          return (
            <div key={d.toISOString()} className="rounded-t-lg bg-[#f5f4f1] px-1 py-2 text-center">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-[#9b9b9b]">
                {d.toLocaleDateString('en-GB', { timeZone: 'UTC',  weekday: 'short' })}
              </div>
              {dayIsToday ? (
                <div className="mx-auto mt-0.5 flex h-[28px] w-[28px] items-center justify-center rounded-full bg-[#121212] font-authSerif text-[18px] text-[#faf9f6]">
                  {d.getDate()}
                </div>
              ) : (
                <div className="mt-0.5 font-authSerif text-[18px] text-[#121212]">{d.getDate()}</div>
              )}
            </div>
          );
        })}

        <div
          className="relative flex flex-col border-r border-[#ebe9e4] pr-1 pt-1"
          style={{ height: GRID_HEIGHT_PX }}
        >
          {Array.from({ length: HOUR_COUNT }, (_, i) => GRID_START_HOUR + i).map((h) => (
            <div
              key={h}
              className="flex shrink-0 items-start justify-end border-b border-[#ebe9e4] text-[10px] text-[#9b9b9b]"
              style={{ height: PX_PER_HOUR }}
            >
              {String(h).padStart(2, '0')}:00
            </div>
          ))}
          <div className="pointer-events-none absolute bottom-0 right-1 translate-y-1/2 text-[10px] text-[#9b9b9b]">
            {String(GRID_END_HOUR).padStart(2, '0')}:00
          </div>
        </div>

        {days.map((d, dayIndex) => (
          <div
            key={`col-${localYmd(d)}`}
            ref={(el) => {
              colRefs.current[dayIndex] = el;
            }}
            data-rota-day-index={dayIndex}
            className={[
              'relative rounded-b-lg border border-t-0 border-[#ebe9e4] bg-[#faf9f6]/80 pt-1',
              canEdit && onBackgroundSlotClick ? 'cursor-cell' : '',
            ].join(' ')}
            style={{ height: GRID_HEIGHT_PX, touchAction: canEdit ? 'manipulation' : undefined }}
            onPointerDown={(e) => onPointerDownColumn(e, dayIndex)}
            role="presentation"
          >
            {Array.from({ length: HOUR_COUNT }, (_, i) => GRID_START_HOUR + i).map((h) => (
              <div
                key={h}
                className="pointer-events-none absolute left-0 right-0 border-b border-[#e8e6e0]"
                style={{ top: (h - GRID_START_HOUR) * PX_PER_HOUR, height: PX_PER_HOUR }}
              />
            ))}

            {calendarLayout
              .filter((l) => l.dayIndex === dayIndex)
              .map((l) => {
                const c = calendarById.get(l.shiftId);
                const label = c?.title?.trim() ? c.title : 'Calendar';
                return (
                  <div
                    key={`cal-${l.shiftId}`}
                    className="pointer-events-none absolute z-[2] box-border overflow-hidden rounded-md border border-[#c4b5fd]/90 bg-[repeating-linear-gradient(135deg,rgba(124,58,237,0.12),rgba(124,58,237,0.12)_6px,rgba(124,58,237,0.06)_6px,rgba(124,58,237,0.06)_12px)] px-1 py-0.5 text-[9px] text-[#5b21b6]/95 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.35)]"
                    style={{
                      top: l.topPx,
                      height: l.heightPx,
                      left: 'calc(2px)',
                      width: 'calc(100% - 4px)',
                    }}
                    title={label}
                    role="img"
                    aria-label={`Calendar: ${label}`}
                  >
                    <div className="truncate font-semibold leading-tight">{label}</div>
                  </div>
                );
              })}

            {(() => {
              const draft =
                draftSlotHighlight && draftSlotHighlight.dayIndex === dayIndex ? draftSlotHighlight : null;
              const slotPrev =
                !draft && slotSelectionPreview && slotSelectionPreview.dayIndex === dayIndex
                  ? slotSelectionPreview
                  : null;
              const shiftDropBand =
                !draft &&
                !slotPrev &&
                shiftDropPreview &&
                shiftDropPreview.dayIndex === dayIndex
                  ? shiftDropPreview
                  : null;
              const band = draft ?? slotPrev ?? shiftDropBand;
              if (!band) return null;
              const { topPx, heightPx } = slotHighlightPx(band.startMin, band.endMin);
              const isSlotPrev = Boolean(slotPrev);
              const isShiftDrop = Boolean(shiftDropBand);
              const dropV = isShiftDrop && shiftDropBand ? shiftVariant(shiftDropBand.variantKey) : null;
              const dropW = shiftDropBand ? 100 / shiftDropBand.laneCount : 100;
              const dropLeft = shiftDropBand ? shiftDropBand.lane * dropW : 0;
              return (
                <div
                  key={
                    draft ? 'rota-draft-slot' : isShiftDrop ? 'rota-shift-drop' : 'rota-select-preview'
                  }
                  className={[
                    'pointer-events-none absolute box-border overflow-hidden rounded-md px-1 py-0.5 text-[10px] shadow-sm',
                    isSlotPrev
                      ? 'z-[15] border border-dashed border-[#78716c] bg-[#e7e5e4]/70 text-[#44403c] ring-1 ring-[#d6d3d1]/60'
                      : isShiftDrop && dropV
                        ? [
                            'z-[36] border-2 border-dashed opacity-85 ring-2 ring-[#121212]/10',
                            dropV.bg,
                            dropV.border,
                            dropV.text,
                          ].join(' ')
                        : 'z-[15] border border-[#a8a29e] bg-[#e7e5e4]/90 text-[#44403c] ring-1 ring-[#d6d3d1]/80',
                  ].join(' ')}
                  style={{
                    top: topPx,
                    height: heightPx,
                    left: isShiftDrop && shiftDropBand ? `calc(${dropLeft}% + 2px)` : 'calc(2px)',
                    width: isShiftDrop && shiftDropBand ? `calc(${dropW}% - 4px)` : 'calc(100% - 4px)',
                  }}
                >
                  {draft ? (
                    <>
                      <div className="font-semibold leading-tight">{draft.primary}</div>
                      <div className="mt-0.5 truncate text-[9px] font-medium leading-snug opacity-90">
                        {draft.secondary}
                      </div>
                    </>
                  ) : isShiftDrop && shiftDropBand ? (
                    <>
                      <div className="font-semibold leading-tight">{shiftDropBand.label}</div>
                      <div className="mt-0.5 text-[9px] font-medium opacity-70">Release to place</div>
                    </>
                  ) : (
                    <>
                      <div className="font-semibold leading-tight opacity-80">New shift</div>
                      <div className="mt-0.5 text-[9px] font-medium opacity-70">Release to set time</div>
                    </>
                  )}
                </div>
              );
            })()}

            {layout
              .filter((l) => l.dayIndex === dayIndex)
              .map((l) => {
                const s = shiftById.get(l.shiftId);
                if (!s) return null;
                const v = shiftVariant(s.dept_id ?? s.id);
                const { time, primary, secondary } = shiftTitleLines(s);
                const title = [primary, secondary, s.notes].filter(Boolean).join(' - ');
                const isDragging = draggingShiftId === l.shiftId;
                const isResizing = resizingShiftId === l.shiftId;
                const wPct = 100 / l.laneCount;
                const leftPct = l.lane * wPct;
                const dx = isDragging ? dragDelta.dx : 0;
                const dy = isDragging ? dragDelta.dy : 0;
                return (
                  <div
                    key={l.shiftId}
                    data-rota-shift-block="1"
                    title={title}
                    className={[
                      'absolute box-border overflow-hidden rounded-md border px-1 py-0.5 text-[10px] shadow-sm transition-shadow',
                      canEdit ? 'cursor-grab touch-none active:cursor-grabbing' : 'cursor-default',
                      v.bg,
                      v.border,
                      v.text,
                      isDragging ? 'z-[40] opacity-95 shadow-lg ring-2 ring-[#121212]/20' : 'z-10',
                      isResizing && !isDragging ? 'z-[35] ring-2 ring-[#121212]/15' : '',
                    ].join(' ')}
                    style={{
                      top: l.topPx,
                      height: l.heightPx,
                      left: `calc(${leftPct}% + 2px)`,
                      width: `calc(${wPct}% - 4px)`,
                      transform: isDragging ? `translate(${dx}px, ${dy}px)` : undefined,
                      touchAction: 'none',
                    }}
                    onPointerDown={(e) => onPointerDownShift(e, s)}
                  >
                    {canEdit ? (
                      <>
                        <div
                          className="absolute left-0 right-0 top-0 z-20 h-2.5 cursor-ns-resize touch-none hover:bg-black/10"
                          title="Drag to change start time"
                          onPointerDown={(e) => {
                            if (e.button !== 0) return;
                            e.preventDefault();
                            e.stopPropagation();
                            try {
                              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                            } catch {
                              /* ignore */
                            }
                            startResizeSession('start', s, dayIndex, e.pointerId);
                          }}
                        />
                        <div
                          className="absolute bottom-0 left-0 right-0 z-20 h-2.5 cursor-ns-resize touch-none hover:bg-black/10"
                          title="Drag to change end time"
                          onPointerDown={(e) => {
                            if (e.button !== 0) return;
                            e.preventDefault();
                            e.stopPropagation();
                            try {
                              (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
                            } catch {
                              /* ignore */
                            }
                            startResizeSession('end', s, dayIndex, e.pointerId);
                          }}
                        />
                      </>
                    ) : null}
                    <div
                      className={[
                        'pointer-events-none font-semibold leading-tight',
                        canEdit ? 'pt-1' : '',
                      ].join(' ')}
                    >
                      {isDragging && shiftDropPreview && shiftDropPreview.shiftId === s.id
                        ? shiftDropPreview.label
                        : time}
                    </div>
                    <div className="pointer-events-none mt-0.5 truncate leading-snug">
                      {primary}
                      {overlapShiftIds.has(s.id) ? (
                        <span className="ml-0.5 inline-block rounded bg-amber-200/90 px-0.5 text-[8px] font-bold text-amber-950">
                          !
                        </span>
                      ) : null}
                    </div>
                    {secondary && l.heightPx > 36 ? (
                      <div className="pointer-events-none truncate pb-1 text-[9px] opacity-90">{secondary}</div>
                    ) : canEdit ? (
                      <div className="pointer-events-none pb-1" aria-hidden />
                    ) : null}
                  </div>
                );
              })}
          </div>
        ))}
      </div>
    </div>
  );
}
