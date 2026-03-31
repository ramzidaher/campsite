import { canManageCalendarManualEvents, type ProfileRole } from '@campsite/types';
import { useCampsiteTheme } from '@campsite/ui';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Linking from 'expo-linking';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';

import { TabSafeScreen } from '@/components/shell/TabSafeScreen';
import {
  addMonths,
  addWeeks,
  endOfWeekExclusive,
  formatDateTimeRangeLocal,
  formatDayLabel,
  monthCalendarWeeks,
  startOfMonth,
  startOfWeekMonday,
} from '@/lib/calendarDatetime';
import type { ProfileRow } from '@/lib/AuthContext';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';

type CalKind = 'shift' | 'event';

export type CalItem = {
  key: string;
  kind: CalKind;
  id: string;
  title: string;
  description: string | null;
  start: Date;
  end: Date | null;
  allDay: boolean;
  source: 'rota' | 'broadcast' | 'manual';
  googleEventId: string | null;
  broadcastId: string | null;
};

type ViewMode = 'month' | 'week' | 'day';

const ROTA_CHIP = { bg: '#dcfce7', border: '#bbf7d0', text: '#166534' };
const BROADCAST_CHIP = { bg: '#e7e5e4', border: '#d6d3d1', text: '#44403c' };
const MANUAL_CHIP = { bg: '#f3e8ff', border: '#e9d5ff', text: '#6d28d9' };

function sourceChipStyle(source: CalItem['source'], todayCell: boolean) {
  if (todayCell) {
    return { bg: 'rgba(255,255,255,0.2)', text: 'rgba(250,249,246,0.95)' };
  }
  if (source === 'rota') return { bg: ROTA_CHIP.bg, text: ROTA_CHIP.text };
  if (source === 'broadcast') return { bg: BROADCAST_CHIP.bg, text: BROADCAST_CHIP.text };
  return { bg: MANUAL_CHIP.bg, text: MANUAL_CHIP.text };
}

function localDayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function isSameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function googleCalendarUrl(item: CalItem): string {
  const fmt = (d: Date) =>
    d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '').slice(0, 15) + 'Z';
  const start = item.allDay ? item.start : item.start;
  const end = item.allDay
    ? new Date(item.start.getFullYear(), item.start.getMonth(), item.start.getDate() + 1)
    : item.end ?? new Date(item.start.getTime() + 3600000);
  const text = encodeURIComponent(item.title);
  const details = encodeURIComponent(item.description ?? '');
  if (item.allDay) {
    const ds = item.start.toISOString().slice(0, 10).replace(/-/g, '');
    const de = end.toISOString().slice(0, 10).replace(/-/g, '');
    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${text}&dates=${ds}/${de}&details=${details}`;
  }
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${text}&dates=${fmt(start)}/${fmt(end)}&details=${details}`;
}

function firstRotaTitle(
  rotas: { title?: string } | { title?: string }[] | null | undefined
): { title?: string } | null {
  if (rotas == null) return null;
  if (Array.isArray(rotas)) return (rotas[0] as { title?: string }) ?? null;
  return rotas as { title?: string };
}

export function CalendarScreen({ profile }: { profile: ProfileRow & { org_timezone?: string | null } }) {
  const { tokens } = useCampsiteTheme();
  const qc = useQueryClient();
  const orgTz = profile.org_timezone ?? null;
  const canManage = canManageCalendarManualEvents(profile.role as ProfileRole);

  const [view, setView] = useState<ViewMode>('month');
  const [anchor, setAnchor] = useState(() => startOfMonth(new Date()));
  const [selectedDay, setSelectedDay] = useState(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  });
  const [detail, setDetail] = useState<CalItem | null>(null);
  const [eventFormOpen, setEventFormOpen] = useState(false);

  const range = useMemo(() => {
    if (view === 'month') {
      const start = startOfMonth(anchor);
      const end = addMonths(start, 1);
      return { from: start, to: end };
    }
    if (view === 'week') {
      const start = startOfWeekMonday(anchor);
      return { from: start, to: endOfWeekExclusive(start) };
    }
    const start = new Date(selectedDay);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { from: start, to: end };
  }, [view, anchor, selectedDay]);

  const fromIso = range.from.toISOString();
  const toIso = range.to.toISOString();

  const departmentsQuery = useQuery({
    queryKey: ['mobile-calendar-depts', profile.org_id],
    enabled: Boolean(profile.org_id && isSupabaseConfigured()),
    queryFn: async () => {
      const supabase = getSupabase();
      const { data, error } = await supabase
        .from('departments')
        .select('id,name')
        .eq('org_id', profile.org_id!);
      if (error) throw error;
      return (data ?? []) as { id: string; name: string }[];
    },
  });

  const calendarQuery = useQuery({
    queryKey: ['mobile-calendar-items', profile.org_id, fromIso, toIso],
    enabled: Boolean(profile.org_id && isSupabaseConfigured()),
    queryFn: async () => {
      const supabase = getSupabase();
      const [deptRes, shRes, evRes] = await Promise.all([
        supabase.from('departments').select('id,name').eq('org_id', profile.org_id!),
        supabase
          .from('rota_shifts')
          .select('id, start_time, end_time, role_label, notes, dept_id, rotas(title,kind)')
          .eq('org_id', profile.org_id!)
          .gte('start_time', fromIso)
          .lt('start_time', toIso)
          .order('start_time'),
        supabase
          .from('calendar_events')
          .select(
            'id, title, description, start_time, end_time, all_day, source, broadcast_id, google_event_id'
          )
          .eq('org_id', profile.org_id!)
          .in('source', ['broadcast', 'manual'])
          .gte('start_time', fromIso)
          .lt('start_time', toIso)
          .order('start_time'),
      ]);
      if (deptRes.error) throw deptRes.error;
      if (shRes.error) throw shRes.error;
      if (evRes.error) throw evRes.error;

      const dm = new Map((deptRes.data ?? []).map((d) => [d.id as string, d.name as string]));
      const shiftItems: CalItem[] = (shRes.data ?? []).map((r) => {
        const start = new Date(r.start_time as string);
        const end = new Date(r.end_time as string);
        const dept = r.dept_id ? dm.get(r.dept_id as string) : null;
        const role = r.role_label as string | null;
        const rota = firstRotaTitle(
          r.rotas as { title?: string } | { title?: string }[] | null | undefined
        );
        const rotaBit = rota?.title?.trim() ? rota.title : null;
        const title =
          rotaBit || dept || role
            ? `Shift - ${rotaBit ?? dept ?? 'Dept'}${role ? ` (${role})` : ''}`
            : 'Shift';
        return {
          key: `shift-${r.id}`,
          kind: 'shift' as const,
          id: r.id as string,
          title,
          description: (r.notes as string | null) ?? 'Campsite shift.',
          start,
          end,
          allDay: false,
          source: 'rota' as const,
          googleEventId: null,
          broadcastId: null,
        };
      });

      const eventItems: CalItem[] = (evRes.data ?? []).map((r) => {
        const src = r.source as 'broadcast' | 'manual';
        return {
          key: `evt-${r.id}`,
          kind: 'event' as const,
          id: r.id as string,
          title: r.title as string,
          description: (r.description as string | null) ?? null,
          start: new Date(r.start_time as string),
          end: r.end_time ? new Date(r.end_time as string) : null,
          allDay: !!(r.all_day as boolean),
          source: src === 'broadcast' ? 'broadcast' : 'manual',
          googleEventId: (r.google_event_id as string | null) ?? null,
          broadcastId: (r.broadcast_id as string | null) ?? null,
        };
      });

      return [...shiftItems, ...eventItems].sort((a, b) => a.start.getTime() - b.start.getTime());
    },
  });

  const items = useMemo(() => calendarQuery.data ?? [], [calendarQuery.data]);
  const loading = calendarQuery.isPending || departmentsQuery.isPending;

  const monthWeeks = useMemo(() => monthCalendarWeeks(anchor), [anchor]);

  const todayStart = useMemo(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  }, []);

  const itemsForDay = useCallback(
    (day: Date) => {
      const k = localDayKey(day);
      return items.filter((it) => localDayKey(it.start) === k);
    },
    [items],
  );

  const weekDays = useMemo(() => {
    const s = startOfWeekMonday(view === 'week' ? anchor : selectedDay);
    const days: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(s);
      d.setDate(d.getDate() + i);
      days.push(d);
    }
    return days;
  }, [view, anchor, selectedDay]);

  const cardTitleLabel =
    view === 'month'
      ? anchor.toLocaleString(undefined, { month: 'long', year: 'numeric' })
      : view === 'week'
        ? `Week of ${formatDayLabel(startOfWeekMonday(anchor))}`
        : selectedDay.toLocaleDateString(undefined, {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            year: 'numeric',
          });

  function goPrev() {
    if (view === 'month') setAnchor((a) => addMonths(a, -1));
    else if (view === 'week') setAnchor((a) => addWeeks(a, -1));
    else
      setSelectedDay((d) => {
        const x = new Date(d);
        x.setDate(x.getDate() - 1);
        return x;
      });
  }

  function goNext() {
    if (view === 'month') setAnchor((a) => addMonths(a, 1));
    else if (view === 'week') setAnchor((a) => addWeeks(a, 1));
    else
      setSelectedDay((d) => {
        const x = new Date(d);
        x.setDate(x.getDate() + 1);
        return x;
      });
  }

  function goToday() {
    const t = new Date();
    setAnchor(startOfMonth(t));
    setSelectedDay(() => {
      const x = new Date(t);
      x.setHours(0, 0, 0, 0);
      return x;
    });
  }

  const invalidate = () => void qc.invalidateQueries({ queryKey: ['mobile-calendar-items'] });

  if (!profile.org_id) {
    return (
      <TabSafeScreen>
        <View style={[styles.center, { backgroundColor: tokens.background }]}>
          <Text style={{ color: tokens.textSecondary }}>Sign in to view your calendar.</Text>
        </View>
      </TabSafeScreen>
    );
  }

  return (
    <TabSafeScreen>
      <ScrollView
        style={{ flex: 1, backgroundColor: tokens.background }}
        contentContainerStyle={styles.scrollPad}
        refreshControl={
          <RefreshControl
            refreshing={calendarQuery.isRefetching || departmentsQuery.isRefetching}
            onRefresh={() => {
              void departmentsQuery.refetch();
              void calendarQuery.refetch();
            }}
            tintColor={tokens.textPrimary}
            colors={[tokens.textPrimary]}
          />
        }
      >
        <View style={styles.rowBtns}>
          <Pressable
            style={[styles.outlineBtn, { borderColor: tokens.border }]}
            onPress={() => Alert.alert('Google Calendar', 'Google Calendar sync is coming soon.')}
          >
            <Text style={{ color: tokens.textSecondary, fontSize: 13 }}>Sync Google Calendar</Text>
          </Pressable>
          {canManage ? (
            <Pressable
              style={[styles.primaryBtn, { backgroundColor: tokens.textPrimary }]}
              onPress={() => setEventFormOpen((o) => !o)}
            >
              <Text style={{ color: tokens.background, fontSize: 13, fontWeight: '600' }}>
                {eventFormOpen ? 'Hide new event' : '+ Add event'}
              </Text>
            </Pressable>
          ) : null}
        </View>

        <View style={[styles.card, { borderColor: tokens.border, backgroundColor: tokens.surface }]}>
          <View style={[styles.cardHeader, { borderBottomColor: tokens.border }]}>
            <Pressable style={[styles.navBtn, { borderColor: tokens.border }]} onPress={goPrev}>
              <Text style={{ color: tokens.textSecondary }}>‹</Text>
            </Pressable>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text style={[styles.cardTitle, { color: tokens.textPrimary }]}>{cardTitleLabel}</Text>
              <Pressable onPress={goToday}>
                <Text style={{ color: tokens.textSecondary, fontSize: 12, textDecorationLine: 'underline' }}>
                  Today
                </Text>
              </Pressable>
            </View>
            <Pressable style={[styles.navBtn, { borderColor: tokens.border }]} onPress={goNext}>
              <Text style={{ color: tokens.textSecondary }}>›</Text>
            </Pressable>
          </View>

          <View style={styles.segmentRow}>
            {(
              [
                { mode: 'month' as const, label: 'Month' },
                { mode: 'week' as const, label: 'Week' },
                { mode: 'day' as const, label: 'Agenda' },
              ] as const
            ).map(({ mode, label }, i, arr) => (
              <Pressable
                key={mode}
                onPress={() => {
                  if (mode === 'week') setAnchor(startOfWeekMonday(selectedDay));
                  if (mode === 'month') setAnchor(startOfMonth(selectedDay));
                  setView(mode);
                }}
                style={[
                  styles.segment,
                  i < arr.length - 1 && { borderRightWidth: 1, borderRightColor: tokens.border },
                  view === mode && { backgroundColor: tokens.textPrimary },
                ]}
              >
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: '600',
                    color: view === mode ? tokens.background : tokens.textSecondary,
                  }}
                >
                  {label}
                </Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.legendRow}>
            <LegendDot color="#059669" label="Rota shift" textColor={tokens.textSecondary} />
            <LegendDot color="#44403c" label="Broadcast" textColor={tokens.textSecondary} />
            <LegendDot color="#7C3AED" label="Manual" textColor={tokens.textSecondary} />
          </View>

          <View style={{ padding: 16 }}>
            {loading ? (
              <ActivityIndicator color={tokens.textPrimary} />
            ) : view === 'month' ? (
              <MonthGrid
                monthWeeks={monthWeeks}
                anchor={anchor}
                selectedDay={selectedDay}
                todayStart={todayStart}
                itemsForDay={itemsForDay}
                onSelectDay={(d) => {
                  setSelectedDay(d);
                  setView('day');
                }}
              />
            ) : view === 'week' ? (
              <WeekColumns
                weekDays={weekDays}
                itemsForDay={itemsForDay}
                onSelectDay={(d) => {
                  setSelectedDay(d);
                  setView('day');
                }}
                onOpenItem={setDetail}
                tokens={tokens}
              />
            ) : (
              <DayAgenda items={itemsForDay(selectedDay)} onOpen={setDetail} tokens={tokens} />
            )}
          </View>
        </View>

        {canManage ? (
          <ManualEventFormMobile
            profile={profile}
            departments={departmentsQuery.data ?? []}
            defaultDay={selectedDay}
            open={eventFormOpen}
            onOpenChange={setEventFormOpen}
            onSaved={invalidate}
            tokens={tokens}
          />
        ) : null}
      </ScrollView>

      <DetailModalMobile
        visible={detail !== null}
        item={detail}
        orgTimezone={orgTz}
        onClose={() => setDetail(null)}
        tokens={tokens}
      />
    </TabSafeScreen>
  );
}

function LegendDot({
  color,
  label,
  textColor,
}: {
  color: string;
  label: string;
  textColor: string;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
      <Text style={{ fontSize: 11, color: textColor }}>{label}</Text>
    </View>
  );
}

function MonthGrid({
  monthWeeks,
  anchor,
  selectedDay,
  todayStart,
  itemsForDay,
  onSelectDay,
}: {
  monthWeeks: Date[][];
  anchor: Date;
  selectedDay: Date;
  todayStart: Date;
  itemsForDay: (d: Date) => CalItem[];
  onSelectDay: (d: Date) => void;
}) {
  const headers = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  return (
    <View>
      <View style={styles.monthHeaderRow}>
        {headers.map((d) => (
          <Text key={d} style={styles.monthHeaderCell}>
            {d}
          </Text>
        ))}
      </View>
      {monthWeeks.map((row, ri) => (
        <View key={ri} style={styles.monthRow}>
          {row.map((day) => {
            const inMonth = day.getMonth() === anchor.getMonth();
            const list = itemsForDay(day);
            const isToday = isSameCalendarDay(day, todayStart);
            const isSelected = day.toDateString() === selectedDay.toDateString();
            return (
              <Pressable
                key={day.toISOString()}
                onPress={() => onSelectDay(day)}
                style={[
                  styles.monthCell,
                  !inMonth && { opacity: 0.4 },
                  isToday && { backgroundColor: '#121212' },
                  isSelected && !isToday && { borderWidth: 1, borderColor: '#12121255' },
                  !isToday && !isSelected && { backgroundColor: '#f5f4f1' },
                ]}
              >
                <Text
                  style={[
                    styles.monthDayNum,
                    isToday && { color: '#faf9f6' },
                    !isToday && { color: '#121212' },
                  ]}
                >
                  {day.getDate()}
                </Text>
                <View style={{ gap: 2, marginTop: 4 }}>
                  {list.slice(0, 3).map((it) => {
                    const st = sourceChipStyle(it.source, isToday);
                    return (
                      <Text
                        key={it.key}
                        numberOfLines={1}
                        style={{
                          fontSize: 9,
                          borderRadius: 4,
                          paddingHorizontal: 4,
                          paddingVertical: 2,
                          backgroundColor: st.bg,
                          color: st.text,
                        }}
                      >
                        {it.title}
                      </Text>
                    );
                  })}
                  {list.length > 3 ? (
                    <Text style={{ fontSize: 9, color: isToday ? '#faf9f6aa' : '#9b9b9b' }}>
                      +{list.length - 3} more
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

function WeekColumns({
  weekDays,
  itemsForDay,
  onSelectDay,
  onOpenItem,
  tokens,
}: {
  weekDays: Date[];
  itemsForDay: (d: Date) => CalItem[];
  onSelectDay: (d: Date) => void;
  onOpenItem: (it: CalItem) => void;
  tokens: { border: string; textPrimary: string; textSecondary: string; surface: string };
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {weekDays.map((day) => {
          const list = itemsForDay(day);
          return (
            <View
              key={day.toISOString()}
              style={{
                width: 120,
                minHeight: 140,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: tokens.border,
                backgroundColor: '#f5f4f1',
                padding: 8,
              }}
            >
              <Pressable onPress={() => onSelectDay(day)}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: tokens.textSecondary }}>
                  {formatDayLabel(day)}
                </Text>
              </Pressable>
              <View style={{ marginTop: 8, gap: 4 }}>
                {list.map((it) => {
                  const st = sourceChipStyle(it.source, false);
                  return (
                    <Pressable
                      key={it.key}
                      onPress={() => onOpenItem(it)}
                      style={{
                        borderRadius: 4,
                        paddingHorizontal: 6,
                        paddingVertical: 4,
                        backgroundColor: st.bg,
                      }}
                    >
                      <Text numberOfLines={2} style={{ fontSize: 11, fontWeight: '600', color: st.text }}>
                        {it.title}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
}

function DayAgenda({
  items,
  onOpen,
  tokens,
}: {
  items: CalItem[];
  onOpen: (it: CalItem) => void;
  tokens: { border: string; textPrimary: string; textSecondary: string; surface: string };
}) {
  if (items.length === 0) {
    return <Text style={{ color: tokens.textSecondary, fontSize: 14 }}>Nothing scheduled this day.</Text>;
  }
  return (
    <View style={{ gap: 10 }}>
      {items.map((it) => {
        const st = sourceChipStyle(it.source, false);
        return (
          <Pressable
            key={it.key}
            onPress={() => onOpen(it)}
            style={{
              borderRadius: 12,
              borderWidth: 1,
              borderColor: tokens.border,
              backgroundColor: tokens.surface,
              padding: 14,
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <Text style={{ flex: 1, fontWeight: '600', color: tokens.textPrimary }} numberOfLines={2}>
              {it.title}
            </Text>
            <View
              style={{
                marginLeft: 8,
                borderRadius: 999,
                paddingHorizontal: 10,
                paddingVertical: 4,
                backgroundColor: st.bg,
              }}
            >
              <Text style={{ fontSize: 11, fontWeight: '600', color: st.text }}>{it.source}</Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

function DetailModalMobile({
  visible,
  item,
  orgTimezone,
  onClose,
  tokens,
}: {
  visible: boolean;
  item: CalItem | null;
  orgTimezone: string | null;
  onClose: () => void;
  tokens: { background: string; textPrimary: string; textSecondary: string; border: string };
}) {
  if (!item) return null;
  const timeLine =
    item.allDay
      ? item.start.toLocaleDateString()
      : item.source === 'rota'
        ? formatDateTimeRangeLocal(item.start, item.end ?? item.start, orgTimezone)
        : `${item.start.toLocaleString()} - ${(item.end ?? item.start).toLocaleString()}`;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalBackdrop} onPress={onClose}>
        <Pressable style={[styles.modalCard, { backgroundColor: tokens.background }]} onPress={(e) => e.stopPropagation()}>
          <Text style={[styles.modalTitle, { color: tokens.textPrimary }]}>{item.title}</Text>
          <Text style={{ fontSize: 11, fontWeight: '700', color: tokens.textSecondary, marginTop: 4 }}>
            {item.source}
          </Text>
          <Text style={{ fontSize: 14, color: tokens.textSecondary, marginTop: 12 }}>{timeLine}</Text>
          {item.description ? (
            <Text style={{ fontSize: 14, color: tokens.textPrimary, marginTop: 12 }}>{item.description}</Text>
          ) : null}
          {item.googleEventId ? (
            <Text style={{ fontSize: 14, color: tokens.textSecondary, marginTop: 12 }}>
              Synced to Google Calendar
            </Text>
          ) : (
            <Pressable
              style={[styles.primaryBtn, { backgroundColor: tokens.textPrimary, marginTop: 16, alignSelf: 'flex-start' }]}
              onPress={() => void Linking.openURL(googleCalendarUrl(item))}
            >
              <Text style={{ color: tokens.background, fontSize: 13, fontWeight: '600' }}>
                Add to Google Calendar
              </Text>
            </Pressable>
          )}
          <Pressable
            style={[styles.outlineBtn, { borderColor: tokens.border, marginTop: 12, alignSelf: 'stretch' }]}
            onPress={onClose}
          >
            <Text style={{ color: tokens.textSecondary, textAlign: 'center' }}>Close</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function ManualEventFormMobile({
  profile,
  departments,
  defaultDay,
  open,
  onOpenChange,
  onSaved,
  tokens,
}: {
  profile: ProfileRow;
  departments: { id: string; name: string }[];
  defaultDay: Date;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved: () => void;
  tokens: {
    border: string;
    textPrimary: string;
    textSecondary: string;
    textMuted: string;
    surface: string;
    background: string;
  };
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [allDay, setAllDay] = useState(false);
  const [deptId, setDeptId] = useState('');
  const [startDate, setStartDate] = useState(() => new Date());
  const [endDate, setEndDate] = useState(() => new Date(Date.now() + 3600000));
  const [showStartPicker, setShowStartPicker] = useState(false);
  const [showEndPicker, setShowEndPicker] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save() {
    setMsg(null);
    if (!title.trim()) {
      setMsg('Title is required.');
      return;
    }
    let start: Date;
    let end: Date | null = null;
    if (allDay) {
      start = new Date(defaultDay);
      start.setHours(0, 0, 0, 0);
      end = new Date(start);
      end.setDate(end.getDate() + 1);
    } else {
      start = new Date(startDate);
      end = new Date(endDate);
      if (end <= start) {
        setMsg('End must be after start.');
        return;
      }
    }
    setSaving(true);
    try {
      const supabase = getSupabase();
      const { error } = await supabase.from('calendar_events').insert({
        org_id: profile.org_id!,
        dept_id: deptId || null,
        title: title.trim(),
        description: description.trim() || null,
        start_time: start.toISOString(),
        end_time: end?.toISOString() ?? null,
        all_day: allDay,
        source: 'manual',
        created_by: profile.id,
      });
      if (error) {
        setMsg(error.message);
        return;
      }
      onOpenChange(false);
      setTitle('');
      setDescription('');
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <View style={[styles.card, { borderColor: tokens.border, marginTop: 16, padding: 16 }]}>
      <Text style={{ fontSize: 13, fontWeight: '600', color: tokens.textPrimary, marginBottom: 12 }}>
        New event
      </Text>
      <Text style={{ fontSize: 12, color: tokens.textSecondary, marginBottom: 8 }}>Title</Text>
      <TextInput
        style={[styles.input, { borderColor: tokens.border, color: tokens.textPrimary }]}
        value={title}
        onChangeText={setTitle}
        placeholder="Title"
        placeholderTextColor={tokens.textMuted}
      />
      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 8 }}>
        <Switch value={allDay} onValueChange={setAllDay} />
        <Text style={{ color: tokens.textPrimary }}>All day</Text>
      </View>
      {!allDay ? (
        <>
          <Text style={{ fontSize: 12, color: tokens.textSecondary, marginTop: 12 }}>Start</Text>
          <Pressable onPress={() => setShowStartPicker(true)} style={[styles.input, { borderColor: tokens.border, justifyContent: 'center' }]}>
            <Text style={{ color: tokens.textPrimary }}>{startDate.toLocaleString()}</Text>
          </Pressable>
          {showStartPicker ? (
            <DateTimePicker
              value={startDate}
              mode="datetime"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={(_, d) => {
                setShowStartPicker(Platform.OS === 'ios');
                if (d) setStartDate(d);
              }}
            />
          ) : null}
          <Text style={{ fontSize: 12, color: tokens.textSecondary, marginTop: 12 }}>End</Text>
          <Pressable onPress={() => setShowEndPicker(true)} style={[styles.input, { borderColor: tokens.border, justifyContent: 'center' }]}>
            <Text style={{ color: tokens.textPrimary }}>{endDate.toLocaleString()}</Text>
          </Pressable>
          {showEndPicker ? (
            <DateTimePicker
              value={endDate}
              mode="datetime"
              display={Platform.OS === 'ios' ? 'spinner' : 'default'}
              onChange={(_, d) => {
                setShowEndPicker(Platform.OS === 'ios');
                if (d) setEndDate(d);
              }}
            />
          ) : null}
        </>
      ) : (
        <Text style={{ fontSize: 12, color: tokens.textSecondary, marginTop: 8 }}>
          Uses the selected agenda day — switch to Agenda view and pick the day first.
        </Text>
      )}
      <Text style={{ fontSize: 12, color: tokens.textSecondary, marginTop: 12 }}>Department (optional)</Text>
      <View style={[styles.input, { borderColor: tokens.border, padding: 0 }]}>
        <Picker selectedValue={deptId} onValueChange={setDeptId} dropdownIconColor={tokens.textPrimary}>
          <Picker.Item label="-" value="" />
          {departments.map((d) => (
            <Picker.Item key={d.id} label={d.name} value={d.id} />
          ))}
        </Picker>
      </View>
      <Text style={{ fontSize: 12, color: tokens.textSecondary, marginTop: 12 }}>Description</Text>
      <TextInput
        style={[styles.input, { borderColor: tokens.border, color: tokens.textPrimary, minHeight: 72 }]}
        value={description}
        onChangeText={setDescription}
        multiline
        placeholderTextColor={tokens.textMuted}
      />
      {msg ? <Text style={{ color: '#b91c1c', marginTop: 8 }}>{msg}</Text> : null}
      <Pressable
        style={[styles.primaryBtn, { backgroundColor: tokens.textPrimary, marginTop: 16 }]}
        onPress={() => void save()}
        disabled={saving}
      >
        <Text style={{ color: tokens.background, fontWeight: '600' }}>{saving ? 'Saving…' : 'Save event'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  scrollPad: { padding: 20, paddingBottom: 48 },
  rowBtns: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  outlineBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  primaryBtn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8 },
  card: { marginTop: 16, borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderBottomWidth: 1,
  },
  navBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: { fontSize: 17, fontWeight: '600', textAlign: 'center' },
  segmentRow: { flexDirection: 'row', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#d8d8d8' },
  segment: { flex: 1, paddingVertical: 10, alignItems: 'center' },
  legendRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingHorizontal: 16, paddingTop: 12 },
  monthHeaderRow: { flexDirection: 'row', marginBottom: 8 },
  monthHeaderCell: {
    flex: 1,
    textAlign: 'center',
    fontSize: 10,
    fontWeight: '700',
    color: '#9b9b9b',
  },
  monthRow: { flexDirection: 'row', gap: 4, marginBottom: 4 },
  monthCell: {
    flex: 1,
    minHeight: 72,
    borderRadius: 8,
    padding: 4,
  },
  monthDayNum: { fontSize: 13, fontWeight: '600' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: { borderRadius: 16, padding: 20, maxHeight: '85%' },
  modalTitle: { fontSize: 20, fontWeight: '600' },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
  },
});
