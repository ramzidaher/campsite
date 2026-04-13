import { addDays, startOfDayLocal } from '@/lib/calendarDatetime';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
} from 'react-native';

type GridCalItem = {
  key: string;
  title: string;
  start: Date;
  end: Date | null;
  allDay: boolean;
  source: 'rota' | 'broadcast' | 'manual' | 'one_on_one';
};

const PX_PER_HOUR = 40;
const DAY_MINUTES = 24 * 60;
const SNAP_MIN = 30;

function minutesSinceMidnight(d: Date): number {
  return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
}

function snapMinutes(m: number): number {
  return Math.round(m / SNAP_MIN) * SNAP_MIN;
}

function chipColors(source: GridCalItem['source']): { bg: string; border: string; text: string } {
  if (source === 'rota') return { bg: '#dcfce7', border: '#bbf7d0', text: '#166534' };
  if (source === 'broadcast') return { bg: '#e7e5e4', border: '#d6d3d1', text: '#44403c' };
  if (source === 'one_on_one') return { bg: '#e0f2fe', border: '#bae6fd', text: '#0369a1' };
  return { bg: '#f3e8ff', border: '#e9d5ff', text: '#6d28d9' };
}

export function TimeGridMobile({
  days,
  items,
  draftRange,
  canManage,
  onBackgroundPress,
  onOpenItem,
  tokens,
}: {
  days: Date[];
  items: GridCalItem[];
  draftRange: { start: Date; end: Date } | null;
  canManage: boolean;
  onBackgroundPress: (dayStart: Date, start: Date, end: Date) => void;
  onOpenItem: (it: GridCalItem) => void;
  tokens: { border: string; textPrimary: string; textSecondary: string; textMuted: string };
}) {
  const totalPx = 24 * PX_PER_HOUR;
  const colW = Math.max(72, 320 / Math.max(1, days.length));

  function itemsForColumn(dayStart: Date) {
    const dayEnd = addDays(dayStart, 1);
    return items.filter((it) => {
      if (it.allDay) {
        return (
          it.start.getFullYear() === dayStart.getFullYear() &&
          it.start.getMonth() === dayStart.getMonth() &&
          it.start.getDate() === dayStart.getDate()
        );
      }
      return it.start < dayEnd && (it.end ?? new Date(it.start.getTime() + 3600000)) > dayStart;
    });
  }

  function handleColPress(dayStart: Date, e: GestureResponderEvent) {
    if (!canManage) return;
    const y = e.nativeEvent.locationY;
    const clamped = Math.max(0, Math.min(y, totalPx));
    const rawMin = (clamped / totalPx) * DAY_MINUTES;
    const m = snapMinutes(rawMin);
    const start = new Date(dayStart);
    start.setHours(0, 0, 0, 0);
    start.setMinutes(m);
    const end = new Date(start.getTime() + 3600000);
    onBackgroundPress(dayStart, start, end);
  }

  return (
    <ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator>
      <View style={{ flexDirection: 'row' }}>
        <View style={{ width: 36, paddingTop: 28 }}>
          {Array.from({ length: 24 }, (_, h) => (
            <View key={h} style={{ height: PX_PER_HOUR, justifyContent: 'flex-start' }}>
              <Text style={{ fontSize: 9, color: tokens.textMuted, textAlign: 'right' }}>
                {String(h).padStart(2, '0')}:00
              </Text>
            </View>
          ))}
        </View>
        {days.map((day) => {
          const dayStart = startOfDayLocal(day);
          const colItems = itemsForColumn(dayStart);
          const timed = colItems.filter((it) => !it.allDay);
          const allDay = colItems.filter((it) => it.allDay);
          const draft =
            draftRange && draftRange.start < addDays(dayStart, 1) && draftRange.end > dayStart
              ? (() => {
                  const s = draftRange.start < dayStart ? dayStart : draftRange.start;
                  const e = draftRange.end > addDays(dayStart, 1) ? addDays(dayStart, 1) : draftRange.end;
                  if (e <= s) return null;
                  const top = (minutesSinceMidnight(s) / DAY_MINUTES) * totalPx;
                  const h = Math.max(
                    ((e.getTime() - s.getTime()) / (DAY_MINUTES * 60 * 1000)) * totalPx,
                    18,
                  );
                  return { top, height: h };
                })()
              : null;

          return (
            <View key={dayStart.toISOString()} style={{ width: colW, borderLeftWidth: 1, borderLeftColor: tokens.border }}>
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: '700',
                  textAlign: 'center',
                  color: tokens.textSecondary,
                  paddingVertical: 6,
                }}
                numberOfLines={2}
              >
                {dayStart.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })}
              </Text>
              {allDay.length > 0 ? (
                <View style={{ paddingHorizontal: 2, marginBottom: 4, gap: 4 }}>
                  {allDay.map((it) => {
                    const c = chipColors(it.source);
                    return (
                      <Pressable
                        key={it.key}
                        onPress={() => onOpenItem(it)}
                        style={{ borderRadius: 4, borderWidth: 1, borderColor: c.border, backgroundColor: c.bg, padding: 4 }}
                      >
                        <Text style={{ fontSize: 9, color: c.text }} numberOfLines={2}>
                          {it.title}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ) : null}
              <ScrollView nestedScrollEnabled style={{ maxHeight: 420 }}>
                <Pressable style={{ height: totalPx, position: 'relative' }} onPress={(e) => handleColPress(dayStart, e)}>
                  {Array.from({ length: 24 }, (_, h) => (
                    <View
                      key={h}
                      style={{
                        position: 'absolute',
                        left: 0,
                        right: 0,
                        top: h * PX_PER_HOUR,
                        height: PX_PER_HOUR,
                        borderTopWidth: 1,
                        borderTopColor: '#f0f0f0',
                      }}
                    />
                  ))}
                  {timed.map((it) => {
                    const dayEnd = addDays(dayStart, 1);
                    const start = it.start < dayStart ? dayStart : it.start;
                    const endRaw = it.end ?? new Date(it.start.getTime() + 3600000);
                    const end = endRaw > dayEnd ? dayEnd : endRaw;
                    const top = (minutesSinceMidnight(start) / DAY_MINUTES) * totalPx;
                    const h = Math.max(
                      ((end.getTime() - start.getTime()) / (DAY_MINUTES * 60 * 1000)) * totalPx,
                      16,
                    );
                    const c = chipColors(it.source);
                    return (
                      <Pressable
                        key={it.key}
                        onPress={() => onOpenItem(it)}
                        style={{
                          position: 'absolute',
                          left: 2,
                          right: 2,
                          top,
                          height: h,
                          borderRadius: 4,
                          borderWidth: 1,
                          borderColor: c.border,
                          backgroundColor: c.bg,
                          padding: 2,
                          zIndex: 2,
                        }}
                      >
                        <Text style={{ fontSize: 9, color: c.text }} numberOfLines={4}>
                          {it.title}
                        </Text>
                      </Pressable>
                    );
                  })}
                  {draft ? (
                    <View
                      pointerEvents="none"
                      style={[
                        styles.draft,
                        {
                          top: draft.top,
                          height: draft.height,
                        },
                      ]}
                    >
                      <Text style={{ fontSize: 9, color: '#5b21b6' }}>New</Text>
                    </View>
                  ) : null}
                </Pressable>
              </ScrollView>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  draft: {
    position: 'absolute',
    left: 2,
    right: 2,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#7C3AED',
    backgroundColor: 'rgba(124,58,237,0.18)',
    borderRadius: 4,
    padding: 2,
    zIndex: 1,
  },
});
