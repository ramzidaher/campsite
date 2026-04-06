import { useCampsiteTheme } from '@campsite/ui';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { getSupabase } from '@/lib/supabase';

type Goal = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  rating: string | null;
  set_by: string;
  sort_order: number;
};

type ReviewDetail = {
  id: string;
  status: string;
  self_assessment: string | null;
  self_submitted_at: string | null;
  manager_assessment: string | null;
  overall_rating: string | null;
  manager_submitted_at: string | null;
  completed_at: string | null;
  reviewee_id: string;
  reviewer_id: string | null;
  reviewee_name: string;
  reviewer_name: string | null;
  cycle_name: string | null;
  cycle_type: string | null;
  cycle_status: string | null;
  self_assessment_due: string | null;
  manager_assessment_due: string | null;
  period_start: string | null;
  period_end: string | null;
  goals: Goal[];
};

const RATING_OPTIONS = [
  { value: 'exceptional', label: 'Exceptional' },
  { value: 'strong', label: 'Strong' },
  { value: 'meets_expectations', label: 'Meets expectations' },
  { value: 'developing', label: 'Developing' },
  { value: 'unsatisfactory', label: 'Unsatisfactory' },
];

const GOAL_STATUS_OPTIONS = [
  { value: 'not_started', label: 'Not started' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'completed', label: 'Completed' },
  { value: 'carried_forward', label: 'Moving to next cycle' },
];

const TYPE_LABELS: Record<string, string> = {
  annual: 'Annual review',
  mid_year: 'Mid-year check-in',
  probation: 'Probation review',
  quarterly: 'Quarterly review',
};

function ratingColor(r: string): string {
  const m: Record<string, string> = {
    exceptional: '#166534',
    strong: '#1d4ed8',
    meets_expectations: '#4a4a4a',
    developing: '#c2410c',
    unsatisfactory: '#b91c1c',
  };
  return m[r] ?? '#6b6b6b';
}

export function ReviewDetailScreen({
  reviewId,
  userId,
  onBack,
}: {
  reviewId: string;
  userId: string;
  onBack: () => void;
}) {
  const { tokens, scheme } = useCampsiteTheme();
  const isDark = scheme === 'dark';
  const supabase = useMemo(() => getSupabase(), []);

  const [review, setReview] = useState<ReviewDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [selfText, setSelfText] = useState('');
  const [managerText, setManagerText] = useState('');
  const [overallRating, setOverallRating] = useState('');

  const bg = isDark ? tokens.background : '#faf9f6';
  const cardBg = isDark ? tokens.surface : '#ffffff';
  const border = isDark ? tokens.border : '#e8e8e8';
  const textPrimary = isDark ? tokens.textPrimary : '#121212';
  const textSecondary = isDark ? tokens.textSecondary : '#6b6b6b';

  const load = useCallback(async () => {
    const { data: r } = await supabase
      .from('performance_reviews')
      .select(`
        id, status, self_assessment, self_submitted_at,
        manager_assessment, overall_rating, manager_submitted_at,
        completed_at, reviewee_id, reviewer_id,
        reviewee:profiles!performance_reviews_reviewee_id_fkey(full_name),
        reviewer:profiles!performance_reviews_reviewer_id_fkey(full_name),
        review_cycles(name, type, status, self_assessment_due, manager_assessment_due, period_start, period_end)
      `)
      .eq('id', reviewId)
      .maybeSingle();

    if (!r) return;

    const raw = r as Record<string, unknown>;
    const revieweeRaw = raw.reviewee;
    const reviewerRaw = raw.reviewer;
    const cycleRaw = raw.review_cycles;

    function relOne<T>(v: T | T[] | null | undefined): T | null {
      if (v == null) return null;
      return Array.isArray(v) ? (v[0] ?? null) : v;
    }

    const revieweeRow = relOne(revieweeRaw as { full_name: string } | null);
    const reviewerRow = relOne(reviewerRaw as { full_name: string } | null);
    type CycleShape = { name: unknown; type: unknown; status: unknown; self_assessment_due: unknown; manager_assessment_due: unknown; period_start: unknown; period_end: unknown };
    const cycle = relOne(cycleRaw as CycleShape | null);

    const { data: goals } = await supabase
      .from('review_goals')
      .select('id, title, description, status, rating, set_by, sort_order')
      .eq('review_id', reviewId)
      .order('sort_order');

    const detail: ReviewDetail = {
      id: String(raw.id),
      status: String(raw.status ?? ''),
      self_assessment: (raw.self_assessment as string | null) ?? null,
      self_submitted_at: (raw.self_submitted_at as string | null) ?? null,
      manager_assessment: (raw.manager_assessment as string | null) ?? null,
      overall_rating: (raw.overall_rating as string | null) ?? null,
      manager_submitted_at: (raw.manager_submitted_at as string | null) ?? null,
      completed_at: (raw.completed_at as string | null) ?? null,
      reviewee_id: String(raw.reviewee_id),
      reviewer_id: (raw.reviewer_id as string | null) ?? null,
      reviewee_name: revieweeRow?.full_name ?? 'Employee',
      reviewer_name: reviewerRow?.full_name ?? null,
      cycle_name: cycle ? String(cycle.name ?? '') : null,
      cycle_type: cycle ? String(cycle.type ?? '') : null,
      cycle_status: cycle ? String(cycle.status ?? '') : null,
      self_assessment_due: cycle ? (cycle.self_assessment_due as string | null) ?? null : null,
      manager_assessment_due: cycle ? (cycle.manager_assessment_due as string | null) ?? null : null,
      period_start: cycle ? (cycle.period_start as string | null) ?? null : null,
      period_end: cycle ? (cycle.period_end as string | null) ?? null : null,
      goals: (goals ?? []).map((g) => ({
        id: g.id as string,
        title: g.title as string,
        description: (g.description as string | null) ?? null,
        status: g.status as string,
        rating: (g.rating as string | null) ?? null,
        set_by: g.set_by as string,
        sort_order: g.sort_order as number,
      })),
    };

    setReview(detail);
    setSelfText(detail.self_assessment ?? '');
    setManagerText(detail.manager_assessment ?? '');
    setOverallRating(detail.overall_rating ?? '');
  }, [supabase, reviewId]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  if (loading || !review) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: bg }}>
        <ActivityIndicator color={textSecondary} />
      </View>
    );
  }

  const isReviewee = review.reviewee_id === userId;
  const isReviewer = review.reviewer_id === userId;
  const isOpen = review.status !== 'completed' && review.status !== 'cancelled';
  const cycleOpen = review.cycle_status !== 'closed';
  const canEditSelf = isReviewee && isOpen && cycleOpen;
  const canEditManager = isReviewer && isOpen && cycleOpen;
  const today = new Date().toISOString().slice(0, 10);
  const selfOverdue = review.self_assessment_due && review.self_assessment_due < today && canEditSelf && !review.self_submitted_at;
  const managerOverdue = review.manager_assessment_due && review.manager_assessment_due < today && canEditManager;

  async function submitSelf() {
    if (!selfText.trim()) {
      Alert.alert('Required', 'Please write your self-assessment before submitting.');
      return;
    }
    setBusy(true);
    const { error } = await supabase.rpc('review_self_submit', {
      p_review_id: reviewId,
      p_self_assessment: selfText,
    });
    setBusy(false);
    if (error) { Alert.alert('Error', error.message); return; }
    Alert.alert('Submitted', 'Your self-assessment has been submitted.');
    await load();
  }

  async function submitManager() {
    if (!overallRating) {
      Alert.alert('Required', 'Please choose an overall rating before submitting.');
      return;
    }
    setBusy(true);
    const { error } = await supabase.rpc('review_manager_submit', {
      p_review_id: reviewId,
      p_manager_assessment: managerText,
      p_overall_rating: overallRating,
    });
    setBusy(false);
    if (error) { Alert.alert('Error', error.message); return; }
    Alert.alert('Submitted', 'Your assessment has been submitted.');
    await load();
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView style={{ flex: 1, backgroundColor: bg }} contentContainerStyle={styles.scroll}>
        {/* Back */}
        <Pressable onPress={onBack} style={styles.backRow}>
          <Text style={[styles.backText, { color: textSecondary }]}>← Back to reviews</Text>
        </Pressable>

        {/* Header */}
        <Text style={[styles.title, { color: textPrimary }]}>
          {isReviewee ? (review.cycle_name ?? 'Review') : review.reviewee_name}
        </Text>
        {review.cycle_type ? (
          <Text style={[styles.meta, { color: textSecondary }]}>
            {TYPE_LABELS[review.cycle_type] ?? review.cycle_type}
            {review.period_start && review.period_end ? ` · ${review.period_start} – ${review.period_end}` : ''}
            {!isReviewee && isReviewer ? ` · ${review.reviewee_name}` : ''}
          </Text>
        ) : null}
        {review.overall_rating ? (
          <Text style={[styles.ratingTag, { color: ratingColor(review.overall_rating) }]}>
            Overall: {RATING_OPTIONS.find((r) => r.value === review.overall_rating)?.label ?? review.overall_rating}
          </Text>
        ) : null}

        {/* Action banners */}
        {canEditSelf && !review.self_submitted_at ? (
          <View style={[styles.banner, { backgroundColor: selfOverdue ? '#fef2f2' : '#fffbeb', borderColor: selfOverdue ? '#fecaca' : '#fde68a' }]}>
            <Text style={[styles.bannerTitle, { color: selfOverdue ? '#b91c1c' : '#92400e' }]}>
              {selfOverdue ? 'Self-assessment overdue' : 'Action needed: complete your self-assessment'}
            </Text>
            <Text style={[styles.bannerBody, { color: selfOverdue ? '#7f1d1d' : '#78350f' }]}>
              Write about your achievements and challenges during this review period.
              {review.self_assessment_due ? ` Due ${review.self_assessment_due}.` : ''}
            </Text>
          </View>
        ) : null}
        {canEditManager && review.status === 'self_submitted' ? (
          <View style={[styles.banner, { backgroundColor: managerOverdue ? '#fef2f2' : '#fffbeb', borderColor: managerOverdue ? '#fecaca' : '#fde68a' }]}>
            <Text style={[styles.bannerTitle, { color: managerOverdue ? '#b91c1c' : '#92400e' }]}>
              {managerOverdue ? 'Your assessment is overdue' : 'Ready for your assessment'}
            </Text>
            <Text style={[styles.bannerBody, { color: managerOverdue ? '#7f1d1d' : '#78350f' }]}>
              {review.reviewee_name} has submitted their self-assessment.
            </Text>
          </View>
        ) : null}

        {/* Self-assessment section */}
        <View style={[styles.section, { backgroundColor: cardBg, borderColor: border }]}>
          <Text style={[styles.sectionTitle, { color: textPrimary }]}>
            {isReviewee ? 'Your self-assessment' : `${review.reviewee_name}'s self-assessment`}
          </Text>
          {review.self_submitted_at ? (
            <Text style={[styles.submitted, { color: '#008B60' }]}>
              Submitted {new Date(review.self_submitted_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
            </Text>
          ) : null}
          {canEditSelf ? (
            <>
              <Text style={[styles.fieldHint, { color: textSecondary }]}>
                Reflect on your achievements, challenges, and development during this period.
              </Text>
              <TextInput
                value={selfText}
                onChangeText={setSelfText}
                multiline
                numberOfLines={8}
                placeholder="Write your self-assessment here…"
                placeholderTextColor={textSecondary}
                style={[styles.textArea, { borderColor: border, color: textPrimary, backgroundColor: isDark ? '#1a1a1a' : '#fafafa' }]}
              />
              <Pressable
                style={[styles.submitBtn, { opacity: busy ? 0.6 : 1 }]}
                onPress={() => void submitSelf()}
                disabled={busy}
              >
                <Text style={styles.submitBtnText}>{busy ? 'Submitting…' : 'Submit self-assessment'}</Text>
              </Pressable>
            </>
          ) : (
            <Text style={[styles.assessmentText, { color: textPrimary }]}>
              {review.self_assessment ?? (review.self_submitted_at ? '' : 'Not yet submitted.')}
            </Text>
          )}
        </View>

        {/* Manager assessment section */}
        {(isReviewer || review.manager_submitted_at) ? (
          <View style={[styles.section, { backgroundColor: cardBg, borderColor: border }]}>
            <Text style={[styles.sectionTitle, { color: textPrimary }]}>
              {isReviewer ? 'Your assessment' : 'Manager assessment'}
            </Text>
            {review.manager_submitted_at ? (
              <Text style={[styles.submitted, { color: '#008B60' }]}>
                Submitted {new Date(review.manager_submitted_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
              </Text>
            ) : null}
            {canEditManager && review.status === 'self_submitted' ? (
              <>
                <Text style={[styles.fieldLabel, { color: textSecondary }]}>Overall rating</Text>
                <View style={styles.ratingRow}>
                  {RATING_OPTIONS.map((opt) => (
                    <Pressable
                      key={opt.value}
                      style={[
                        styles.ratingChip,
                        { borderColor: overallRating === opt.value ? '#008B60' : border },
                        overallRating === opt.value && { backgroundColor: '#f0fdf9' },
                      ]}
                      onPress={() => setOverallRating(opt.value)}
                    >
                      <Text style={[styles.ratingChipText, { color: overallRating === opt.value ? '#008B60' : textSecondary }]}>
                        {opt.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={[styles.fieldHint, { color: textSecondary }]}>
                  Your written assessment (optional but recommended).
                </Text>
                <TextInput
                  value={managerText}
                  onChangeText={setManagerText}
                  multiline
                  numberOfLines={8}
                  placeholder="Your assessment of this employee's performance…"
                  placeholderTextColor={textSecondary}
                  style={[styles.textArea, { borderColor: border, color: textPrimary, backgroundColor: isDark ? '#1a1a1a' : '#fafafa' }]}
                />
                <Pressable
                  style={[styles.submitBtn, { opacity: busy || !overallRating ? 0.6 : 1 }]}
                  onPress={() => void submitManager()}
                  disabled={busy || !overallRating}
                >
                  <Text style={styles.submitBtnText}>{busy ? 'Submitting…' : 'Submit assessment'}</Text>
                </Pressable>
              </>
            ) : (
              <>
                {review.overall_rating ? (
                  <Text style={[styles.ratingTag, { color: ratingColor(review.overall_rating), marginBottom: 8 }]}>
                    {RATING_OPTIONS.find((r) => r.value === review.overall_rating)?.label ?? review.overall_rating}
                  </Text>
                ) : null}
                <Text style={[styles.assessmentText, { color: textPrimary }]}>
                  {review.manager_assessment ?? (!review.manager_submitted_at ? 'Not yet submitted.' : '')}
                </Text>
              </>
            )}
          </View>
        ) : null}

        {/* Goals */}
        {review.goals.length > 0 ? (
          <View style={[styles.section, { backgroundColor: cardBg, borderColor: border }]}>
            <Text style={[styles.sectionTitle, { color: textPrimary }]}>Goals</Text>
            {review.goals.map((g) => (
              <View key={g.id} style={[styles.goalCard, { borderColor: border }]}>
                <Text style={[styles.goalTitle, { color: textPrimary }]}>{g.title}</Text>
                {g.description ? <Text style={[styles.goalDesc, { color: textSecondary }]}>{g.description}</Text> : null}
                <View style={styles.goalMeta}>
                  <Text style={[styles.goalStatus, { color: textSecondary }]}>
                    {GOAL_STATUS_OPTIONS.find((s) => s.value === g.status)?.label ?? g.status}
                  </Text>
                  {g.rating ? (
                    <Text style={[styles.goalRating, { color: ratingColor(g.rating) }]}>
                      {RATING_OPTIONS.find((r) => r.value === g.rating)?.label ?? g.rating}
                    </Text>
                  ) : null}
                </View>
              </View>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 16, paddingBottom: 60 },
  backRow: { marginBottom: 12 },
  backText: { fontSize: 13 },
  title: { fontSize: 22, fontWeight: '700', letterSpacing: -0.4, marginBottom: 4 },
  meta: { fontSize: 13, marginBottom: 6 },
  ratingTag: { fontSize: 13, fontWeight: '600', marginBottom: 12 },
  banner: { borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 12 },
  bannerTitle: { fontSize: 13, fontWeight: '600', marginBottom: 2 },
  bannerBody: { fontSize: 12 },
  section: { borderRadius: 14, borderWidth: 1, padding: 16, marginBottom: 12 },
  sectionTitle: { fontSize: 15, fontWeight: '600', marginBottom: 8 },
  submitted: { fontSize: 12, marginBottom: 8 },
  fieldHint: { fontSize: 12, marginBottom: 8 },
  fieldLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 },
  textArea: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    minHeight: 140,
    textAlignVertical: 'top',
    marginBottom: 12,
  },
  assessmentText: { fontSize: 14, lineHeight: 20 },
  submitBtn: {
    backgroundColor: '#008B60',
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  submitBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  ratingRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 },
  ratingChip: { borderWidth: 1.5, borderRadius: 20, paddingHorizontal: 10, paddingVertical: 5 },
  ratingChipText: { fontSize: 12, fontWeight: '500' },
  goalCard: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10, marginTop: 8 },
  goalTitle: { fontSize: 14, fontWeight: '500' },
  goalDesc: { fontSize: 12, marginTop: 2 },
  goalMeta: { flexDirection: 'row', gap: 12, marginTop: 4 },
  goalStatus: { fontSize: 12 },
  goalRating: { fontSize: 12, fontWeight: '500' },
});
