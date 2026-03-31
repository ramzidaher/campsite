import { useMemo } from 'react';
import {
  GestureResponderEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';

import {
  GRID_END_HOUR,
  GRID_HEIGHT_PX,
  GRID_START_HOUR,
  PX_PER_HOUR,
  layoutWeekShifts,
  snapMinutesFromMidnight,
} from '@/lib/rota/weekGridLayout';

const COL_WIDTH_MIN = 58;
const COL_WIDTH_MAX = 76;
const HOUR_COUNT = GRID_END_HOUR - GRID_START_HOUR;

export type GridShift = {
  id: string;
  start_time: string;
  end_time: string;
};

type ShiftVariant = { bg: string; border: string; text: string };

type Props<T extends GridShift> = {
  days: Date[];
  shifts: T[];
  shiftVariant: (key: string | null) => ShiftVariant;
  shiftLabel: (s: T) => { primary: string; secondary: string | null };
  overlapShiftIds: Set<string>;
  canEdit: boolean;
  onShiftPress: (s: T) => void;
  onBackgroundSlotPress?: (detail: { dayIndex: number; startMinutesFromMidnight: number }) => void;
};

export function RotaWeekGridMobile<T extends GridShift>({
  days,
  shifts,
  shiftVariant,
  shiftLabel,
  overlapShiftIds,
  canEdit,
  onShiftPress,
  onBackgroundSlotPress,
}: Props<T>) {
  const { width: windowW } = useWindowDimensions();
  const colWidth = useMemo(
    () => Math.round(Math.min(COL_WIDTH_MAX, Math.max(COL_WIDTH_MIN, (windowW - 56) / 5.2))),
    [windowW],
  );

  const layout = useMemo(
    () => layoutWeekShifts(shifts.map((s) => ({ id: s.id, start_time: s.start_time, end_time: s.end_time })), days),
    [shifts, days],
  );

  const shiftById = useMemo(() => new Map(shifts.map((s) => [s.id, s])), [shifts]);

  const handleColumnPressIn = (dayIndex: number) => (e: GestureResponderEvent) => {
    if (!onBackgroundSlotPress || !canEdit) return;
    const y = e.nativeEvent.locationY;
    const innerH = GRID_HEIGHT_PX;
    const frac = Math.min(Math.max(y / innerH, 0), 1);
    const spanMin = HOUR_COUNT * 60;
    const raw = GRID_START_HOUR * 60 + frac * spanMin;
    const snapped = snapMinutesFromMidnight(raw);
    onBackgroundSlotPress({ dayIndex, startMinutesFromMidnight: snapped });
  };

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator>
      <View style={{ flexDirection: 'row' }}>
        {days.map((day, dayIndex) => (
          <View key={day.toISOString()} style={{ width: colWidth, marginRight: 4 }}>
            <Text style={styles.dayHead} numberOfLines={1}>
              {day.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })}
            </Text>
            <Pressable
              onPressIn={handleColumnPressIn(dayIndex)}
              style={[styles.gridCol, { width: colWidth }]}
            >
              {Array.from({ length: HOUR_COUNT + 1 }).map((_, hi) => (
                <View
                  key={hi}
                  style={[
                    styles.hourLine,
                    { top: hi * PX_PER_HOUR - 0.5 },
                  ]}
                />
              ))}
              {layout
                .filter((l) => l.dayIndex === dayIndex)
                .map((l) => {
                  const s = shiftById.get(l.shiftId) as T | undefined;
                  if (!s) return null;
                  const v = shiftVariant((s as { dept_id?: string | null }).dept_id ?? s.id);
                  const { primary, secondary } = shiftLabel(s);
                  const laneW = colWidth / l.laneCount;
                  const left = l.lane * laneW;
                  return (
                    <Pressable
                      key={l.shiftId}
                      onPress={() => onShiftPress(s)}
                      style={[
                        styles.shiftBlock,
                        {
                          top: l.topPx,
                          height: l.heightPx,
                          left,
                          width: laneW - 2,
                          backgroundColor: v.bg,
                          borderColor: v.border,
                        },
                      ]}
                    >
                      <Text numberOfLines={2} style={[styles.shiftPri, { color: v.text }]}>
                        {primary}
                      </Text>
                      {secondary ? (
                        <Text numberOfLines={1} style={[styles.shiftSec, { color: v.text }]}>
                          {secondary}
                        </Text>
                      ) : null}
                      {overlapShiftIds.has(s.id) ? (
                        <Text style={styles.overlap} accessibilityLabel="Overlapping shift">
                          !
                        </Text>
                      ) : null}
                    </Pressable>
                  );
                })}
            </Pressable>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  dayHead: { fontSize: 10, fontWeight: '700', color: '#9b9b9b', textAlign: 'center', marginBottom: 4 },
  gridCol: {
    height: GRID_HEIGHT_PX,
    position: 'relative',
    backgroundColor: '#faf9f6',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#e4e2dc',
    overflow: 'hidden',
  },
  hourLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: '#ebe9e4',
  },
  shiftBlock: {
    position: 'absolute',
    borderRadius: 4,
    borderWidth: 1,
    padding: 2,
    overflow: 'hidden',
  },
  shiftPri: { fontSize: 10, fontWeight: '700' },
  shiftSec: { fontSize: 9, marginTop: 1, opacity: 0.88 },
  overlap: {
    fontSize: 11,
    fontWeight: '900',
    color: '#92400e',
    marginTop: 1,
  },
});
