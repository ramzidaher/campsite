import { useCampsiteTheme } from '@campsite/ui';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import type { ProfileRow } from '@/lib/AuthContext';
import { getSupabase } from '@/lib/supabase';

type Task = {
  id: string;
  title: string;
  description: string | null;
  assignee_type: string;
  category: string;
  due_date: string | null;
  sort_order: number;
  status: string;
  completed_at: string | null;
};

const CATEGORY_LABELS: Record<string, string> = {
  documents: 'Documents',
  it_setup: 'IT setup',
  introductions: 'Introductions',
  compliance: 'Compliance',
  other: 'Other tasks',
};

const CATEGORY_ORDER = ['documents', 'it_setup', 'introductions', 'compliance', 'other'];

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export function OnboardingScreen({ profile }: { profile: ProfileRow }) {
  const { tokens, scheme } = useCampsiteTheme();
  const isDark = scheme === 'dark';
  const supabase = useMemo(() => getSupabase(), []);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [runId, setRunId] = useState<string | null>(null);
  const [runStatus, setRunStatus] = useState<string | null>(null);
  const [canComplete, setCanComplete] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [noRun, setNoRun] = useState(false);

  const userId = profile.id;
  const orgId = profile.org_id ?? '';

  const load = useCallback(async () => {
    if (!orgId) return;
    const [{ data: permsData }, { data: run }] = await Promise.all([
      supabase.rpc('get_my_permissions', { p_org_id: orgId }),
      supabase
        .from('onboarding_runs')
        .select('id, status, employment_start_date')
        .eq('user_id', userId)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle(),
    ]);

    const keys = ((permsData ?? []) as Array<{ permission_key?: string }>).map((p) =>
      String(p.permission_key ?? ''),
    );
    setCanComplete(keys.includes('onboarding.complete_own_tasks'));

    if (!run?.id) {
      setNoRun(true);
      return;
    }
    setRunId(run.id as string);
    setRunStatus(run.status as string);
    setNoRun(false);

    const { data: taskData } = await supabase
      .from('onboarding_run_tasks')
      .select('id, title, description, assignee_type, category, due_date, sort_order, status, completed_at')
      .eq('run_id', run.id)
      .order('sort_order', { ascending: true });

    setTasks((taskData ?? []) as Task[]);
  }, [supabase, userId, orgId]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  async function toggle(task: Task) {
    if (!canComplete || task.assignee_type !== 'employee') return;
    setBusy(task.id);
    const next = task.status === 'completed' ? 'pending' : 'completed';
    await supabase.rpc('onboarding_task_update', { p_task_id: task.id, p_status: next });
    setBusy(null);
    await load();
  }

  const bg = isDark ? tokens.background : '#faf9f6';
  const cardBg = isDark ? tokens.surface : '#ffffff';
  const border = isDark ? tokens.border : '#e8e8e8';
  const textPrimary = isDark ? tokens.textPrimary : '#121212';
  const textSecondary = isDark ? tokens.textSecondary : '#6b6b6b';

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: bg }}>
        <ActivityIndicator color={textSecondary} />
      </View>
    );
  }

  if (noRun) {
    return (
      <ScrollView
          style={{ flex: 1, backgroundColor: bg }}
          contentContainerStyle={styles.scroll}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
        >
          <View style={styles.header}>
            <Text style={[styles.title, { color: textPrimary }]}>Onboarding</Text>
            <Text style={[styles.subtitle, { color: textSecondary }]}>Your onboarding task list.</Text>
          </View>
          <View style={[styles.emptyCard, { backgroundColor: cardBg, borderColor: border }]}>
            <Text style={[styles.emptyText, { color: textSecondary }]}>No active onboarding.</Text>
            <Text style={[styles.emptyHint, { color: textSecondary }]}>
              Your onboarding task list will appear here once HR sets it up for you.
            </Text>
          </View>
      </ScrollView>
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const myTasks = tasks.filter((t) => t.assignee_type === 'employee');
  const otherTasks = tasks.filter((t) => t.assignee_type !== 'employee');
  const myDone = myTasks.filter((t) => t.status !== 'pending').length;
  const totalDone = tasks.filter((t) => t.status !== 'pending').length;
  const progress = tasks.length > 0 ? Math.round((totalDone / tasks.length) * 100) : 0;
  const overdueTasks = myTasks.filter((t) => t.due_date && t.due_date < today && t.status === 'pending');

  const allDone = tasks.length > 0 && totalDone === tasks.length;

  // Group my tasks by category
  const grouped = CATEGORY_ORDER.map((key) => ({
    key,
    label: CATEGORY_LABELS[key] ?? key,
    tasks: myTasks.filter((t) => t.category === key),
  })).filter((g) => g.tasks.length > 0);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: bg }}
        contentContainerStyle={styles.scroll}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      >
        <View style={styles.header}>
          <Text style={[styles.title, { color: textPrimary }]}>Onboarding</Text>
          <Text style={[styles.subtitle, { color: textSecondary }]}>Your onboarding task list.</Text>
        </View>

        {allDone ? (
          <View style={[styles.completionCard, { backgroundColor: '#f0fdf9', borderColor: '#bbf7d0' }]}>
            <Text style={styles.completionEmoji}>✓</Text>
            <Text style={styles.completionTitle}>All done!</Text>
            <Text style={[styles.completionHint, { color: '#166534' }]}>
              You've completed all your onboarding tasks.
            </Text>
          </View>
        ) : null}

        {/* Progress */}
        <View style={[styles.progressCard, { backgroundColor: cardBg, borderColor: border }]}>
          <View style={styles.progressHeader}>
            <Text style={[styles.progressLabel, { color: textSecondary }]}>
              {myDone} of {myTasks.length} your tasks done
            </Text>
            <Text style={[styles.progressPct, { color: textPrimary }]}>{progress}%</Text>
          </View>
          <View style={[styles.progressTrack, { backgroundColor: isDark ? '#2a2a2a' : '#f0eeea' }]}>
            <View style={[styles.progressFill, { width: `${progress}%` as `${number}%` }]} />
          </View>
          <Text style={[styles.progressTotal, { color: textSecondary }]}>
            {totalDone} of {tasks.length} total tasks complete
          </Text>
        </View>

        {overdueTasks.length > 0 ? (
          <View style={styles.overdueBanner}>
            <Text style={styles.overdueBannerText}>
              Overdue: {overdueTasks.map((t) => t.title).join(', ')}
            </Text>
          </View>
        ) : null}

        {/* My tasks by category */}
        {grouped.map((g) => (
          <View key={g.key}>
            <Text style={[styles.sectionHeading, { color: textSecondary }]}>{g.label}</Text>
            {g.tasks.map((task) => {
              const done = task.status !== 'pending';
              const overdue = task.due_date && task.due_date < today && !done;
              const isBusy = busy === task.id;
              return (
                <Pressable
                  key={task.id}
                  style={[
                    styles.taskCard,
                    {
                      backgroundColor: done ? (isDark ? '#1a2a1a' : '#f0fdf9') : cardBg,
                      borderColor: overdue ? '#fca5a5' : done ? '#bbf7d0' : border,
                      opacity: isBusy ? 0.6 : 1,
                    },
                  ]}
                  onPress={() => void toggle(task)}
                  disabled={isBusy || !canComplete}
                >
                  <View style={styles.taskRow}>
                    <View style={[styles.checkbox, { borderColor: done ? '#008B60' : border, backgroundColor: done ? '#008B60' : 'transparent' }]}>
                      {done ? <Text style={styles.checkmark}>✓</Text> : null}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.taskTitle, { color: textPrimary, textDecorationLine: done ? 'line-through' : 'none', opacity: done ? 0.6 : 1 }]}>
                        {task.title}
                      </Text>
                      {task.description ? (
                        <Text style={[styles.taskDesc, { color: textSecondary }]} numberOfLines={2}>
                          {task.description}
                        </Text>
                      ) : null}
                      {task.due_date ? (
                        <Text style={[styles.taskDue, { color: overdue ? '#b91c1c' : textSecondary }]}>
                          {overdue ? 'Overdue · ' : 'Due '}{fmtDate(task.due_date)}
                        </Text>
                      ) : null}
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </View>
        ))}

        {/* Other tasks (assigned to manager/HR) */}
        {otherTasks.length > 0 ? (
          <>
            <Text style={[styles.sectionHeading, { color: textSecondary, marginTop: 8 }]}>
              Handled by others
            </Text>
            {otherTasks.map((task) => {
              const done = task.status !== 'pending';
              const whoLabel = task.assignee_type === 'manager' ? 'Your manager' : 'HR team';
              return (
                <View
                  key={task.id}
                  style={[styles.taskCard, { backgroundColor: isDark ? '#1e1e1e' : '#fafafa', borderColor: border, opacity: 0.8 }]}
                >
                  <View style={styles.taskRow}>
                    <View style={[styles.checkbox, { borderColor: done ? '#008B60' : border, backgroundColor: done ? '#008B60' : 'transparent' }]}>
                      {done ? <Text style={styles.checkmark}>✓</Text> : null}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.taskTitle, { color: textPrimary, textDecorationLine: done ? 'line-through' : 'none', opacity: done ? 0.6 : 1 }]}>
                        {task.title}
                      </Text>
                      <View style={[styles.whoChip, { backgroundColor: isDark ? '#2a2a2a' : '#f0eeea' }]}>
                        <Text style={[styles.whoChipText, { color: textSecondary }]}>{whoLabel}</Text>
                      </View>
                    </View>
                  </View>
                </View>
              );
            })}
          </>
        ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 48 },
  header: { marginBottom: 16 },
  title: { fontSize: 22, fontWeight: '700', letterSpacing: -0.4 },
  subtitle: { fontSize: 13, marginTop: 2 },
  completionCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 20,
    alignItems: 'center',
    marginBottom: 12,
  },
  completionEmoji: { fontSize: 32, color: '#008B60' },
  completionTitle: { fontSize: 18, fontWeight: '700', color: '#166534', marginTop: 4 },
  completionHint: { fontSize: 13, marginTop: 4, textAlign: 'center' },
  progressCard: { borderRadius: 12, borderWidth: 1, padding: 14, marginBottom: 16 },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  progressLabel: { fontSize: 13 },
  progressPct: { fontSize: 13, fontWeight: '700' },
  progressTrack: { height: 6, borderRadius: 3, overflow: 'hidden', marginBottom: 6 },
  progressFill: { height: '100%', backgroundColor: '#008B60', borderRadius: 3 },
  progressTotal: { fontSize: 12 },
  overdueBanner: {
    backgroundColor: '#fef2f2',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#fca5a5',
    padding: 10,
    marginBottom: 12,
  },
  overdueBannerText: { color: '#b91c1c', fontSize: 13 },
  sectionHeading: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  taskCard: { borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 8 },
  taskRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    marginTop: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  checkmark: { color: '#fff', fontSize: 12, fontWeight: '700' },
  taskTitle: { fontSize: 14, fontWeight: '500' },
  taskDesc: { fontSize: 12, marginTop: 2 },
  taskDue: { fontSize: 12, marginTop: 3 },
  whoChip: { marginTop: 4, alignSelf: 'flex-start', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  whoChipText: { fontSize: 11, fontWeight: '500' },
  emptyCard: { borderRadius: 12, borderWidth: 1, padding: 24, alignItems: 'center' },
  emptyText: { fontSize: 14, fontWeight: '500' },
  emptyHint: { fontSize: 13, textAlign: 'center', marginTop: 6 },
});
