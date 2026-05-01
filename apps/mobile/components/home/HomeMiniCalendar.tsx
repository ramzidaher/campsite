import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { mainShell, mainShellText } from '@/constants/mainShell';
import type { HomeUpcomingEvent } from '@/lib/mobileHomeData';

const weekdays = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

function monthMatrix(year: number, month: number) {
  const first = new Date(year, month, 1);
  const startPad = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: { d: number; inMonth: boolean }[] = [];
  const prevDays = new Date(year, month, 0).getDate();
  for (let i = 0; i < startPad; i++) {
    cells.push({ d: prevDays - startPad + i + 1, inMonth: false });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ d, inMonth: true });
  }
  let n = 1;
  while (cells.length % 7 !== 0) {
    cells.push({ d: n++, inMonth: false });
  }
  return cells;
}

function formatEventWhen(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const isToday = d.toDateString() === now.toDateString();
  const isTomorrow = d.toDateString() === tomorrow.toDateString();
  const time = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  if (isToday) return `Today · ${time}`;
  if (isTomorrow) return `Tomorrow · ${time}`;
  return `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · ${time}`;
}

type Props = {
  eventDays: number[];
  initialYear: number;
  initialMonth: number;
  todayY: number;
  todayM: number;
  todayD: number;
  upcomingEvents: HomeUpcomingEvent[];
  onPressOpenCalendar?: () => void;
};

export function HomeMiniCalendar({
  eventDays,
  initialYear,
  initialMonth,
  todayY,
  todayM,
  todayD,
  upcomingEvents,
  onPressOpenCalendar,
}: Props) {
  const [cursor, setCursor] = useState({ y: initialYear, m: initialMonth });
  const matrix = useMemo(() => monthMatrix(cursor.y, cursor.m), [cursor.y, cursor.m]);
  const eventSet = useMemo(() => {
    if (cursor.y !== initialYear || cursor.m !== initialMonth) return new Set<number>();
    return new Set(eventDays);
  }, [cursor.y, cursor.m, initialYear, initialMonth, eventDays]);

  const label = new Date(cursor.y, cursor.m, 1).toLocaleString(undefined, {
    month: 'long',
    year: 'numeric',
  });

  const preview = upcomingEvents.slice(0, 3);

  return (
    <View style={styles.card}>
      <View style={styles.calHeader}>
        <Text style={styles.monthLabel}>{label}</Text>
        <View style={styles.monthNav}>
          <Pressable
            onPress={() =>
              setCursor((c) => {
                const nm = c.m - 1;
                if (nm < 0) return { y: c.y - 1, m: 11 };
                return { y: c.y, m: nm };
              })
            }
            style={styles.navBtn}
            accessibilityLabel="Previous month"
          >
            <Text style={styles.navBtnText}>‹</Text>
          </Pressable>
          <Pressable
            onPress={() =>
              setCursor((c) => {
                const nm = c.m + 1;
                if (nm > 11) return { y: c.y + 1, m: 0 };
                return { y: c.y, m: nm };
              })
            }
            style={styles.navBtn}
            accessibilityLabel="Next month"
          >
            <Text style={styles.navBtnText}>›</Text>
          </Pressable>
        </View>
      </View>
      <View style={styles.gridPad}>
        <View style={styles.weekRow}>
          {weekdays.map((w) => (
            <Text key={w} style={styles.weekday}>
              {w}
            </Text>
          ))}
        </View>
        <View style={styles.daysGrid}>
          {Array.from({ length: Math.ceil(matrix.length / 7) }, (_, row) => (
            <View key={row} style={styles.dayRow}>
              {matrix.slice(row * 7, row * 7 + 7).map((cell, col) => {
                const i = row * 7 + col;
                const isToday =
                  cell.inMonth && cursor.y === todayY && cursor.m === todayM && cell.d === todayD;
                const hasEvent = cell.inMonth && eventSet.has(cell.d);
                return (
                  <View key={i} style={styles.dayCell}>
                    <View style={[styles.dayInner, isToday && styles.dayToday]}>
                      <Text
                        style={[
                          styles.dayNum,
                          !cell.inMonth && styles.dayMuted,
                          isToday && styles.dayNumToday,
                        ]}
                      >
                        {cell.d}
                      </Text>
                      {hasEvent ? (
                        <View
                          style={[styles.eventDot, isToday && styles.eventDotOnToday]}
                          accessibilityElementsHidden
                        />
                      ) : null}
                    </View>
                  </View>
                );
              })}
            </View>
          ))}
        </View>
      </View>

      <View style={styles.upcomingSection}>
        <Text style={styles.upcomingLabel}>UPCOMING</Text>
        {preview.length === 0 ? (
          <Text style={styles.noEvents}>No upcoming events</Text>
        ) : (
          preview.map((ev) => (
            <Pressable
              key={ev.id}
              onPress={onPressOpenCalendar}
              style={({ pressed }) => [styles.eventRow, pressed && { opacity: 0.85 }]}
            >
              <View style={[styles.eventSwatch, { backgroundColor: ev.color }]} />
              <View style={styles.eventTextCol}>
                <Text style={styles.eventTitle} numberOfLines={2}>
                  {ev.title}
                </Text>
                <Text style={styles.eventWhen}>{formatEventWhen(ev.start_time)}</Text>
              </View>
            </Pressable>
          ))
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    overflow: 'hidden',
    borderRadius: mainShell.spacing.sm,
    borderWidth: 1,
    borderColor: mainShell.border,
    backgroundColor: '#ffffff',
  },
  calHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: mainShell.spacing.lg - 2,
    paddingVertical: mainShell.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: mainShell.border,
  },
  monthLabel: {
    ...mainShellText.subheading,
    color: mainShell.pageText,
    fontFamily: 'Georgia',
  },
  monthNav: { flexDirection: 'row', gap: mainShell.spacing.xxs },
  navBtn: {
    width: 30,
    height: 30,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: mainShell.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navBtnText: { fontSize: mainShell.type.subheading + 1, color: mainShell.textSecondary, lineHeight: 18 },
  gridPad: { padding: mainShell.spacing.sm },
  weekRow: { flexDirection: 'row', marginBottom: mainShell.spacing.xxs },
  weekday: {
    flex: 1,
    textAlign: 'center',
    ...mainShellText.overline,
    color: mainShell.textMuted,
  },
  daysGrid: { gap: 0 },
  dayRow: { flexDirection: 'row' },
  dayCell: { flex: 1, aspectRatio: 1, padding: 2 },
  dayInner: {
    flex: 1,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  dayToday: { backgroundColor: mainShell.pageText },
  dayNum: { ...mainShellText.caption, color: mainShell.textSecondary },
  dayMuted: { color: `${mainShell.textMuted}73` },
  dayNumToday: { color: mainShell.sidebarText, fontWeight: '600' },
  eventDot: {
    position: 'absolute',
    bottom: 3,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#44403c',
  },
  eventDotOnToday: { backgroundColor: mainShell.sidebarText },
  upcomingSection: {
    borderTopWidth: 1,
    borderTopColor: mainShell.border,
    paddingHorizontal: mainShell.spacing.sm + 2,
    paddingTop: mainShell.spacing.sm,
    paddingBottom: mainShell.spacing.sm - 2,
  },
  upcomingLabel: {
    ...mainShellText.overline,
    color: mainShell.textMuted,
    marginBottom: mainShell.spacing.xs - 2,
  },
  noEvents: {
    textAlign: 'center',
    ...mainShellText.caption,
    color: mainShell.textMuted,
    paddingVertical: mainShell.spacing.md,
  },
  eventRow: {
    flexDirection: 'row',
    gap: mainShell.spacing.xs + 2,
    paddingVertical: mainShell.spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: mainShell.border,
  },
  eventSwatch: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 5,
  },
  eventTextCol: { flex: 1, minWidth: 0 },
  eventTitle: { ...mainShellText.caption, fontWeight: '500', color: mainShell.pageText },
  eventWhen: { fontSize: 11, lineHeight: 14, color: mainShell.textMuted, marginTop: 2 },
});
