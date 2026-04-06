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

import { ReviewDetailScreen } from '@/components/performance/ReviewDetailScreen';
import type { ProfileRow } from '@/lib/AuthContext';
import { getSupabase } from '@/lib/supabase';

type ReviewRow = {
  id: string;
  status: string;
  overall_rating: string | null;
  self_submitted_at: string | null;
  manager_submitted_at: string | null;
  completed_at: string | null;
  is_reviewee: boolean;
  reviewee_name: string | null;
  cycle_name: string | null;
  cycle_type: string | null;
  cycle_status: string | null;
  self_assessment_due: string | null;
  manager_assessment_due: string | null;
};

const TYPE_LABELS: Record<string, string> = {
  annual: 'Annual review',
  mid_year: 'Mid-year check-in',
  probation: 'Probation review',
  quarterly: 'Quarterly review',
};

const RATING_LABELS: Record<string, string> = {
  exceptional: 'Exceptional',
  strong: 'Strong',
  meets_expectations: 'Meets expectations',
  developing: 'Developing',
  unsatisfactory: 'Unsatisfactory',
};

function statusInfo(
  status: string,
  isReviewee: boolean,
): { label: string; color: string; bgColor: string } {
  switch (status) {
    case 'completed':
      return { label: 'Complete', color: '#166534', bgColor: '#dcfce7' };
    case 'self_submitted':
      return isReviewee
        ? { label: 'Self-assessment done', color: '#1d4ed8', bgColor: '#eff6ff' }
        : { label: 'Ready to review', color: '#854d0e', bgColor: '#fef9c3' };
    case 'manager_submitted':
      return { label: 'Manager done', color: '#7c3aed', bgColor: '#faf5ff' };
    default:
      return isReviewee
        ? { label: 'Action needed', color: '#c2410c', bgColor: '#fff7ed' }
        : { label: 'Not started', color: '#9b9b9b', bgColor: '#f5f4f1' };
  }
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function PerformanceScreen({ profile }: { profile: ProfileRow }) {
  const { tokens, scheme } = useCampsiteTheme();
  const isDark = scheme === 'dark';
  const supabase = useMemo(() => getSupabase(), []);

  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedReviewId, setSelectedReviewId] = useState<string | null>(null);

  const userId = profile.id;
  const orgId = profile.org_id ?? '';

  const load = useCallback(async () => {
    if (!orgId) return;
    const { data } = await supabase
      .from('performance_reviews')
      .select(
        `
        id, status, overall_rating, self_submitted_at, manager_submitted_at, completed_at,
        reviewee_id, reviewer_id,
        reviewee:profiles!performance_reviews_reviewee_id_fkey(full_name),
        performance_cycles(name, type, status, self_assessment_due, manager_assessment_due)
        `,
      )
      .or(`reviewee_id.eq.${userId},reviewer_id.eq.${userId}`)
      .order('created_at', { ascending: false })
      .limit(40);

    const rows: ReviewRow[] = (data ?? []).map((r) => {
      const raw = r as Record<string, unknown>;
      const isReviewee = raw.reviewee_id === userId;
      const revieweeRaw = raw.reviewee;
      const revieweeName = revieweeRaw
        ? Array.isArray(revieweeRaw)
          ? (revieweeRaw[0] as { full_name: string })?.full_name ?? null
          : (revieweeRaw as { full_name: string }).full_name ?? null
        : null;
      const cycleRaw = raw.performance_cycles;
      const cycle = cycleRaw
        ? Array.isArray(cycleRaw)
          ? (cycleRaw[0] as Record<string, unknown>) ?? null
          : (cycleRaw as Record<string, unknown>)
        : null;
      return {
        id: String(raw.id),
        status: String(raw.status ?? ''),
        overall_rating: (raw.overall_rating as string | null) ?? null,
        self_submitted_at: (raw.self_submitted_at as string | null) ?? null,
        manager_submitted_at: (raw.manager_submitted_at as string | null) ?? null,
        completed_at: (raw.completed_at as string | null) ?? null,
        is_reviewee: isReviewee,
        reviewee_name: revieweeName,
        cycle_name: cycle ? String(cycle.name ?? '') : null,
        cycle_type: cycle ? String(cycle.type ?? '') : null,
        cycle_status: cycle ? String(cycle.status ?? '') : null,
        self_assessment_due: cycle ? (cycle.self_assessment_due as string | null) ?? null : null,
        manager_assessment_due: cycle ? (cycle.manager_assessment_due as string | null) ?? null : null,
      };
    });
    setReviews(rows);
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

  const bg = isDark ? tokens.background : '#faf9f6';
  const cardBg = isDark ? tokens.surface : '#ffffff';
  const border = isDark ? tokens.border : '#e8e8e8';
  const textPrimary = isDark ? tokens.textPrimary : '#121212';
  const textSecondary = isDark ? tokens.textSecondary : '#6b6b6b';

  if (selectedReviewId) {
    return (
      <ReviewDetailScreen
        reviewId={selectedReviewId}
        userId={profile.id}
        onBack={() => {
          setSelectedReviewId(null);
          void load();
        }}
      />
    );
  }

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: bg }}>
        <ActivityIndicator color={textSecondary} />
      </View>
    );
  }

  const today = new Date().toISOString().slice(0, 10);

  const actionNeeded = reviews.filter((r) => {
    if (r.status === 'completed') return false;
    if (r.is_reviewee && r.status === 'created') return true;
    if (!r.is_reviewee && r.status === 'self_submitted') return true;
    return false;
  });

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: bg }}
      contentContainerStyle={styles.scroll}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
    >
        <View style={styles.header}>
          <Text style={[styles.title, { color: textPrimary }]}>Performance</Text>
          <Text style={[styles.subtitle, { color: textSecondary }]}>Your reviews and assessments.</Text>
        </View>

        {actionNeeded.length > 0 ? (
          <View style={styles.actionBanner}>
            <Text style={styles.actionBannerText}>
              {actionNeeded.length} review{actionNeeded.length > 1 ? 's' : ''} need{actionNeeded.length === 1 ? 's' : ''} your attention
            </Text>
          </View>
        ) : null}

        {reviews.length === 0 ? (
          <View style={[styles.emptyCard, { backgroundColor: cardBg, borderColor: border }]}>
            <Text style={[styles.emptyText, { color: textSecondary }]}>No performance reviews yet.</Text>
            <Text style={[styles.emptyHint, { color: textSecondary }]}>
              Reviews will appear here when your organisation starts a review cycle.
            </Text>
          </View>
        ) : (
          reviews.map((r) => {
            const info = statusInfo(r.status, r.is_reviewee);
            const dueDate = r.is_reviewee ? r.self_assessment_due : r.manager_assessment_due;
            const isOverdue = dueDate && dueDate < today && r.status !== 'completed';
            return (
              <View key={r.id} style={[styles.card, { backgroundColor: cardBg, borderColor: isOverdue ? '#fca5a5' : border }]}>
                <View style={styles.cardHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.cardTitle, { color: textPrimary }]}>
                      {r.is_reviewee ? (r.cycle_name ?? 'Review') : (r.reviewee_name ?? 'Team member')}
                    </Text>
                    {r.cycle_type ? (
                      <Text style={[styles.cardMeta, { color: textSecondary }]}>
                        {TYPE_LABELS[r.cycle_type] ?? r.cycle_type}
                        {!r.is_reviewee && r.reviewee_name ? ` · ${r.reviewee_name}` : ''}
                      </Text>
                    ) : null}
                  </View>
                  <View style={[styles.statusChip, { backgroundColor: info.bgColor }]}>
                    <Text style={[styles.statusChipText, { color: info.color }]}>{info.label}</Text>
                  </View>
                </View>

                {dueDate && r.status !== 'completed' ? (
                  <Text style={[styles.dueLine, { color: isOverdue ? '#b91c1c' : textSecondary }]}>
                    {isOverdue ? 'Overdue: ' : 'Due: '}{fmtDate(dueDate)}
                  </Text>
                ) : null}

                {r.overall_rating ? (
                  <Text style={[styles.ratingLine, { color: textSecondary }]}>
                    Rating: {RATING_LABELS[r.overall_rating] ?? r.overall_rating}
                  </Text>
                ) : null}

                <Pressable
                  style={styles.openBtn}
                  onPress={() => setSelectedReviewId(r.id)}
                >
                  <Text style={styles.openBtnText}>
                    {r.is_reviewee && r.status === 'created'
                      ? 'Complete self-assessment →'
                      : !r.is_reviewee && r.status === 'self_submitted'
                        ? 'Complete your assessment →'
                        : 'View review →'}
                  </Text>
                </Pressable>
              </View>
            );
          })
        )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 48 },
  header: { marginBottom: 16 },
  title: { fontSize: 22, fontWeight: '700', letterSpacing: -0.4 },
  subtitle: { fontSize: 13, marginTop: 2 },
  actionBanner: {
    backgroundColor: '#fff7ed',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#fed7aa',
    padding: 12,
    marginBottom: 12,
  },
  actionBannerText: { color: '#c2410c', fontSize: 13, fontWeight: '600' },
  emptyCard: { borderRadius: 12, borderWidth: 1, padding: 24, alignItems: 'center' },
  emptyText: { fontSize: 14, fontWeight: '500' },
  emptyHint: { fontSize: 13, textAlign: 'center', marginTop: 6 },
  card: { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 10 },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 6 },
  cardTitle: { fontSize: 14, fontWeight: '600' },
  cardMeta: { fontSize: 12, marginTop: 2 },
  statusChip: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 3 },
  statusChipText: { fontSize: 11, fontWeight: '600' },
  dueLine: { fontSize: 12, marginBottom: 4 },
  ratingLine: { fontSize: 12, marginBottom: 4 },
  openBtn: { marginTop: 8, alignSelf: 'flex-start' },
  openBtnText: { color: '#008B60', fontSize: 13, fontWeight: '600' },
});
