import * as Linking from 'expo-linking';
import { Link, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { authColors, authRadii } from '@/constants/authTheme';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';

type Org = { id: string; name: string; slug: string; logo_url: string | null };
type Dept = { id: string; name: string; type: 'department' | 'society' | 'club' };
type Cat = { id: string; dept_id: string; name: string };

const STEP_LABELS = ['Account', 'Organisation', 'Teams', 'Subscriptions', 'Review'] as const;

function passwordStrength(pw: string): 'weak' | 'ok' | 'strong' {
  if (pw.length < 8) return 'weak';
  const hasNum = /\d/.test(pw);
  const hasUpper = /[A-Z]/.test(pw);
  if (hasNum && hasUpper && pw.length >= 10) return 'strong';
  if (pw.length >= 8 && (hasNum || hasUpper)) return 'ok';
  return 'weak';
}

function passwordStrengthScore(pw: string): { label: string; color: string; widthPct: number } {
  let score = 0;
  if (pw.length >= 8) score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const map: Record<number, [number, string, string]> = {
    0: [0, '#d8d8d8', 'Enter a password'],
    1: [25, '#b91c1c', 'Weak'],
    2: [50, '#d97706', 'Fair'],
    3: [75, '#2563eb', 'Good'],
    4: [100, '#15803d', 'Strong'],
  };
  const [widthPct, color, label] = map[score] ?? map[0]!;
  return { widthPct, color, label };
}

function StepProgress({ step }: { step: number }) {
  return (
    <View style={styles.progressWrap}>
      <Text style={styles.progressCaption}>
        Step {step} of {STEP_LABELS.length}
      </Text>
      <View style={styles.progressDots}>
        {STEP_LABELS.map((label, i) => {
          const n = i + 1;
          const done = n < step;
          const active = n === step;
          return (
            <View key={label} style={styles.progressItem}>
              <View
                style={[
                  styles.progressCircle,
                  done && styles.progressCircleDone,
                  active && !done && styles.progressCircleActive,
                ]}
              >
                <Text
                  style={[
                    styles.progressCircleText,
                    (done || active) && styles.progressCircleTextOn,
                  ]}
                >
                  {done ? '✓' : n}
                </Text>
              </View>
              <Text
                style={[styles.progressLabel, active ? styles.progressLabelActive : null]}
                numberOfLines={1}
              >
                {label}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

export function RegisterWizard({ initialOrgSlug }: { initialOrgSlug: string | null }) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [orgModal, setOrgModal] = useState(false);
  const [depts, setDepts] = useState<Dept[]>([]);
  const [cats, setCats] = useState<Cat[]>([]);
  const [selectedDeptIds, setSelectedDeptIds] = useState<Set<string>>(new Set());
  const [subscribed, setSubscribed] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const strength = passwordStrength(password);
  const strengthVis = passwordStrengthScore(password);
  const configured = isSupabaseConfigured();

  const loadOrgs = useCallback(async () => {
    if (!configured) return;
    const supabase = getSupabase();
    const { data, error: e } = await supabase
      .from('organisations')
      .select('id,name,slug,logo_url')
      .eq('is_active', true)
      .order('name');
    if (e) {
      setError(e.message);
      return;
    }
    setOrgs((data as Org[]) ?? []);
  }, [configured]);

  const loadDepartments = useCallback(async (oId: string) => {
    if (!configured) return;
    const supabase = getSupabase();
    const { data, error: e } = await supabase
      .from('departments')
      .select('id,name,type')
      .eq('org_id', oId)
      .eq('is_archived', false)
      .order('name');
    if (e) {
      setError(e.message);
      return;
    }
    setDepts((data as Dept[]) ?? []);
    const deptIds = (data ?? []).map((d) => d.id);
    if (deptIds.length) {
      const { data: catRows, error: ce } = await supabase
        .from('dept_categories')
        .select('id,dept_id,name')
        .in('dept_id', deptIds);
      if (ce) {
        setError(ce.message);
        return;
      }
      setCats((catRows as Cat[]) ?? []);
      const next: Record<string, boolean> = {};
      (catRows ?? []).forEach((c: Cat) => {
        next[c.id] = true;
      });
      setSubscribed(next);
    } else {
      setCats([]);
      setSubscribed({});
    }
  }, [configured]);

  useEffect(() => {
    void loadOrgs();
  }, [loadOrgs]);

  useEffect(() => {
    if (!orgs.length || !initialOrgSlug || orgId) return;
    const match = orgs.find((o) => o.slug === initialOrgSlug);
    if (match) {
      setOrgId(match.id);
      void loadDepartments(match.id);
    }
  }, [orgs, initialOrgSlug, orgId, loadDepartments]);

  function toggleDept(id: string) {
    setSelectedDeptIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function toggleSub(catId: string) {
    setSubscribed((prev) => ({ ...prev, [catId]: !prev[catId] }));
  }

  async function submit() {
    if (!configured) return;
    setError(null);
    if (password !== confirm) {
      setError('Passwords do not match.');
      return;
    }
    if (strength === 'weak') {
      setError('Choose a stronger password (8+ characters, mix of letters and numbers).');
      return;
    }
    if (!orgId) {
      setError('Select an organisation.');
      return;
    }
    if (selectedDeptIds.size === 0) {
      setError('Select at least one department, society, or club.');
      return;
    }

    setLoading(true);
    const supabase = getSupabase();
    const redirectTo = Linking.createURL('auth/callback');
    const { data, error: signErr } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: redirectTo,
      },
    });
    if (signErr || !data.user) {
      setLoading(false);
      setError(signErr?.message ?? 'Could not create account.');
      return;
    }

    const userId = data.user.id;

    const { error: pErr } = await supabase.from('profiles').insert({
      id: userId,
      org_id: orgId,
      full_name: fullName,
      email,
      role: 'unassigned',
      status: 'pending',
    });
    if (pErr) {
      setLoading(false);
      setError(pErr.message);
      return;
    }

    const ud = [...selectedDeptIds].map((dept_id) => ({ user_id: userId, dept_id }));
    const { error: udErr } = await supabase.from('user_departments').insert(ud);
    if (udErr) {
      setLoading(false);
      setError(udErr.message);
      return;
    }

    const subRows = cats
      .filter((c) => selectedDeptIds.has(c.dept_id))
      .map((c) => ({
        user_id: userId,
        cat_id: c.id,
        subscribed: subscribed[c.id] ?? true,
      }));
    if (subRows.length) {
      const { error: sErr } = await supabase.from('user_subscriptions').insert(subRows);
      if (sErr) {
        setLoading(false);
        setError(sErr.message);
        return;
      }
    }

    setLoading(false);
    router.replace('/(auth)/register/done');
  }

  const groupedDepts = useMemo(() => {
    const g: Record<string, Dept[]> = { department: [], society: [], club: [] };
    depts.forEach((d) => {
      g[d.type].push(d);
    });
    return g;
  }, [depts]);

  const orgName = orgs.find((o) => o.id === orgId)?.name;

  if (!configured) {
    return (
      <Text style={styles.errorBanner}>Configure Supabase env vars to register.</Text>
    );
  }

  return (
    <View>
      {step === 1 ? (
        <Link href="/(auth)/login" asChild>
          <Pressable style={styles.backBtn}>
            <Text style={styles.backText}>← Back to sign in</Text>
          </Pressable>
        </Link>
      ) : (
        <Pressable style={styles.backBtn} onPress={() => setStep((s) => s - 1)}>
          <Text style={styles.backText}>← Back</Text>
        </Pressable>
      )}

      <StepProgress step={step} />

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorBanner}>{error}</Text>
        </View>
      ) : null}

      {step === 1 ? (
        <View>
          <Text style={styles.title}>Create your account</Text>
          <Text style={styles.sub}>
            {orgName ? (
              <>
                Joining <Text style={styles.emph}>{orgName}</Text>
              </>
            ) : (
              'Set up your Campsite profile'
            )}
          </Text>
          <Text style={styles.label}>Full name</Text>
          <TextInput
            style={styles.input}
            value={fullName}
            onChangeText={setFullName}
            placeholder="Alex Johnson"
            placeholderTextColor={authColors.muted}
          />
          <Text style={styles.label}>Email address</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="alex@organisation.ac.uk"
            placeholderTextColor={authColors.muted}
          />
          <Text style={styles.hint}>Use your organisation email for faster verification</Text>
          <Text style={styles.label}>Password</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="Min. 8 characters"
            placeholderTextColor={authColors.muted}
          />
          <View style={styles.strengthTrack}>
            <View
              style={[styles.strengthFill, { width: `${strengthVis.widthPct}%`, backgroundColor: strengthVis.color }]}
            />
          </View>
          <Text style={[styles.strengthLabel, { color: strengthVis.color }]}>{strengthVis.label}</Text>
          <Text style={styles.label}>Confirm password</Text>
          <TextInput
            style={styles.input}
            value={confirm}
            onChangeText={setConfirm}
            secureTextEntry
            placeholder="Repeat password"
            placeholderTextColor={authColors.muted}
          />
          <Pressable
            style={styles.btnPrimary}
            onPress={() => {
              setError(null);
              if (!fullName.trim() || !email.trim()) {
                setError('Please fill in all required fields.');
                return;
              }
              if (password !== confirm) {
                setError('Passwords do not match.');
                return;
              }
              setStep(2);
            }}
          >
            <Text style={styles.btnPrimaryText}>Continue →</Text>
          </Pressable>
        </View>
      ) : null}

      {step === 2 ? (
        <View>
          <Text style={styles.title}>Your organisation</Text>
          <Text style={styles.sub}>
            {initialOrgSlug
              ? 'We matched your workspace from the URL. You can change it if needed.'
              : 'Select the organisation you belong to.'}
          </Text>
          <Text style={styles.label}>Organisation</Text>
          <Pressable style={styles.input} onPress={() => setOrgModal(true)}>
            <Text style={orgId ? styles.orgPickText : styles.orgPickPlaceholder}>
              {orgName ?? 'Select…'}
            </Text>
          </Pressable>
          <Modal visible={orgModal} animationType="slide" transparent>
            <View style={styles.modalBackdrop}>
              <Pressable style={styles.modalDismiss} onPress={() => setOrgModal(false)} />
              <View style={styles.modalSheet}>
                <Text style={styles.modalTitle}>Choose organisation</Text>
                <FlatList
                  data={orgs}
                  keyExtractor={(o) => o.id}
                  renderItem={({ item }) => (
                    <Pressable
                      style={styles.modalRow}
                      onPress={() => {
                        setOrgId(item.id);
                        void loadDepartments(item.id);
                        setOrgModal(false);
                      }}
                    >
                      <Text style={styles.modalRowText}>{item.name}</Text>
                    </Pressable>
                  )}
                />
              </View>
            </View>
          </Modal>
          <View style={styles.rowBtns}>
            <Pressable style={[styles.btnGhost, styles.btnFlex]} onPress={() => setStep(1)}>
              <Text style={styles.btnGhostText}>← Back</Text>
            </Pressable>
            <Pressable
              style={[styles.btnPrimary, styles.btnFlex2, !orgId && styles.btnDisabled]}
              disabled={!orgId}
              onPress={() => orgId && setStep(3)}
            >
              <Text style={styles.btnPrimaryText}>Continue →</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {step === 3 ? (
        <ScrollView style={styles.stepScroll} showsVerticalScrollIndicator={false}>
          <Text style={styles.title}>Select teams</Text>
          <Text style={styles.sub}>
            Choose every department, society, or club you belong to. You&apos;ll pick broadcast categories
            next.
          </Text>
          {(['department', 'society', 'club'] as const).map((t) =>
            groupedDepts[t].length ? (
              <View key={t} style={styles.teamSection}>
                <Text style={styles.teamHeading}>
                  {t === 'department' ? 'Departments' : t === 'society' ? 'Societies' : 'Clubs'}
                </Text>
                {groupedDepts[t].map((d) => {
                  const selected = selectedDeptIds.has(d.id);
                  return (
                    <Pressable
                      key={d.id}
                      onPress={() => toggleDept(d.id)}
                      style={[styles.teamCard, selected && styles.teamCardOn]}
                    >
                      <View style={styles.teamRow}>
                        <View style={[styles.teamDot, selected && styles.teamDotOn]}>
                          {selected ? <Text style={styles.teamCheck}>✓</Text> : null}
                        </View>
                        <Text style={styles.teamName}>{d.name}</Text>
                        <Text style={styles.teamMeta}>{selected ? 'Joined' : 'Not joined'}</Text>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            ) : null
          )}
          <View style={styles.rowBtns}>
            <Pressable style={[styles.btnGhost, styles.btnFlex]} onPress={() => setStep(2)}>
              <Text style={styles.btnGhostText}>← Back</Text>
            </Pressable>
            <Pressable
              style={[styles.btnPrimary, styles.btnFlex2, selectedDeptIds.size === 0 && styles.btnDisabled]}
              disabled={selectedDeptIds.size === 0}
              onPress={() => setStep(4)}
            >
              <Text style={styles.btnPrimaryText}>Continue →</Text>
            </Pressable>
          </View>
        </ScrollView>
      ) : null}

      {step === 4 ? (
        <ScrollView style={styles.stepScroll} showsVerticalScrollIndicator={false}>
          <Text style={styles.title}>Subscriptions</Text>
          <Text style={styles.sub}>
            Choose broadcast categories you want to receive. You can change these later in Settings.
          </Text>
          {Array.from(new Set(cats.filter((c) => selectedDeptIds.has(c.dept_id)).map((c) => c.dept_id))).map(
            (deptId) => {
              const deptName = depts.find((d) => d.id === deptId)?.name ?? 'Team';
              const deptCats = cats.filter((c) => c.dept_id === deptId);
              return (
                <View key={deptId} style={styles.subBlock}>
                  <Text style={styles.subDept}>{deptName}</Text>
                  <View style={styles.pillWrap}>
                    {deptCats.map((c) => {
                      const on = subscribed[c.id] ?? true;
                      return (
                        <Pressable
                          key={c.id}
                          onPress={() => toggleSub(c.id)}
                          style={[styles.catPill, on && styles.catPillOn]}
                        >
                          <Text style={[styles.catPillText, on && styles.catPillTextOn]}>
                            {on ? '✓ ' : ''}
                            {c.name}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              );
            }
          )}
          <View style={styles.rowBtns}>
            <Pressable style={[styles.btnGhost, styles.btnFlex]} onPress={() => setStep(3)}>
              <Text style={styles.btnGhostText}>← Back</Text>
            </Pressable>
            <Pressable style={[styles.btnPrimary, styles.btnFlex2]} onPress={() => setStep(5)}>
              <Text style={styles.btnPrimaryText}>Continue →</Text>
            </Pressable>
          </View>
        </ScrollView>
      ) : null}

      {step === 5 ? (
        <View>
          <Text style={styles.title}>Review & submit</Text>
          <Text style={styles.sub}>Check your details before sending your registration for approval</Text>
          <View style={styles.reviewBox}>
            <Text style={styles.reviewHeading}>Account details</Text>
            <ReviewRow label="Name" value={fullName || '—'} />
            <ReviewRow label="Email" value={email || '—'} />
            <ReviewRow label="Organisation" value={orgName ?? '—'} />
          </View>
          <View style={styles.reviewBox}>
            <Text style={styles.reviewHeading}>Selected teams</Text>
            <View style={styles.pillWrap}>
              {[...selectedDeptIds].map((id) => {
                const name = depts.find((d) => d.id === id)?.name;
                return name ? (
                  <View key={id} style={styles.teamTag}>
                    <Text style={styles.teamTagText}>{name}</Text>
                  </View>
                ) : null;
              })}
            </View>
          </View>
          <View style={styles.infoBox}>
            <Text style={styles.infoStrong}>What happens next?</Text>
            <Text style={styles.infoText}>
              A manager in your team will review your registration. You&apos;ll receive an email once
              you&apos;re approved, usually within one working day.
            </Text>
          </View>
          <View style={styles.rowBtns}>
            <Pressable style={[styles.btnGhost, styles.btnFlex]} onPress={() => setStep(4)}>
              <Text style={styles.btnGhostText}>← Back</Text>
            </Pressable>
            <Pressable
              style={[styles.btnPrimary, styles.btnFlex2, loading && styles.btnDisabled]}
              disabled={loading}
              onPress={() => void submit()}
            >
              {loading ? <ActivityIndicator color={authColors.cream} /> : null}
              <Text style={styles.btnPrimaryText}>Submit registration</Text>
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.reviewRow}>
      <Text style={styles.reviewLabel}>{label}</Text>
      <Text style={styles.reviewValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backBtn: { marginBottom: 20, alignSelf: 'flex-start' },
  backText: { fontSize: 13, color: authColors.muted },
  progressWrap: { marginBottom: 24 },
  progressCaption: {
    textAlign: 'center',
    fontSize: 11.5,
    fontWeight: '500',
    color: authColors.muted,
    marginBottom: 12,
  },
  progressDots: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 },
  progressItem: { width: '18%', minWidth: 56, alignItems: 'center' },
  progressCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: authColors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: authColors.white,
  },
  progressCircleActive: { borderColor: authColors.marketingBg, backgroundColor: authColors.marketingBg },
  progressCircleDone: { borderColor: authColors.success, backgroundColor: authColors.success },
  progressCircleText: { fontSize: 11, fontWeight: '600', color: authColors.muted },
  progressCircleTextOn: { color: authColors.cream },
  progressLabel: {
    marginTop: 4,
    fontSize: 10,
    fontWeight: '500',
    color: authColors.muted,
    textAlign: 'center',
  },
  progressLabelActive: { color: authColors.panelText },
  title: {
    fontSize: 30,
    lineHeight: 36,
    fontWeight: '400',
    color: authColors.panelText,
    fontFamily: 'Georgia',
    marginBottom: 8,
  },
  sub: { fontSize: 14, lineHeight: 22, color: authColors.subText, marginBottom: 24 },
  emph: { fontWeight: '600', color: authColors.panelText },
  label: {
    fontSize: 13,
    fontWeight: '500',
    color: authColors.subText,
    marginBottom: 6,
  },
  input: {
    minHeight: 44,
    borderRadius: authRadii.input,
    borderWidth: 1,
    borderColor: authColors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: authColors.panelText,
    backgroundColor: authColors.white,
    marginBottom: 16,
    justifyContent: 'center',
  },
  hint: { fontSize: 11.5, color: authColors.muted, marginTop: -8, marginBottom: 16 },
  strengthTrack: {
    height: 3,
    borderRadius: 2,
    backgroundColor: authColors.border,
    overflow: 'hidden',
    marginBottom: 6,
  },
  strengthFill: { height: '100%', borderRadius: 2 },
  strengthLabel: { fontSize: 11.5, marginBottom: 16 },
  btnPrimary: {
    height: 46,
    borderRadius: authRadii.button,
    backgroundColor: authColors.marketingBg,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  btnPrimaryText: { fontSize: 15, fontWeight: '500', color: authColors.cream },
  btnGhost: {
    height: 46,
    borderRadius: authRadii.button,
    borderWidth: 1,
    borderColor: authColors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnGhostText: { fontSize: 15, fontWeight: '500', color: authColors.panelText },
  btnDisabled: { opacity: 0.4 },
  rowBtns: { flexDirection: 'row', gap: 12, marginTop: 8 },
  btnFlex: { flex: 1 },
  btnFlex2: { flex: 2 },
  errorBox: { marginBottom: 16 },
  errorBanner: { fontSize: 14, color: authColors.error },
  orgPickText: { fontSize: 15, color: authColors.panelText },
  orgPickPlaceholder: { fontSize: 15, color: authColors.muted },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modalDismiss: { ...StyleSheet.absoluteFillObject },
  modalSheet: {
    maxHeight: '70%',
    backgroundColor: authColors.white,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 20,
  },
  modalTitle: { fontSize: 17, fontWeight: '600', marginBottom: 12 },
  modalRow: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: authColors.border },
  modalRowText: { fontSize: 16, color: authColors.panelText },
  stepScroll: { maxHeight: 420 },
  teamSection: { marginBottom: 20 },
  teamHeading: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    color: authColors.muted,
    marginBottom: 10,
    textTransform: 'uppercase',
  },
  teamCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: authColors.border,
    marginBottom: 8,
    overflow: 'hidden',
  },
  teamCardOn: { borderColor: authColors.marketingBg },
  teamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 10,
    backgroundColor: authColors.white,
  },
  teamDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: authColors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: authColors.cream,
  },
  teamDotOn: { borderColor: authColors.marketingBg, backgroundColor: authColors.marketingBg },
  teamCheck: { color: authColors.cream, fontSize: 10, fontWeight: '700' },
  teamName: { flex: 1, fontSize: 15, fontWeight: '600', color: authColors.panelText },
  teamMeta: { fontSize: 12, color: authColors.muted },
  subBlock: { marginBottom: 20 },
  subDept: { fontSize: 12, fontWeight: '600', color: authColors.muted, marginBottom: 8 },
  pillWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  catPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: authRadii.pill,
    borderWidth: 1,
    borderColor: authColors.border,
    backgroundColor: authColors.white,
  },
  catPillOn: { borderColor: authColors.marketingBg, backgroundColor: authColors.marketingBg },
  catPillText: { fontSize: 12, color: authColors.subText },
  catPillTextOn: { color: authColors.cream },
  reviewBox: {
    backgroundColor: authColors.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  reviewHeading: { fontSize: 13, fontWeight: '600', color: authColors.muted, marginBottom: 12 },
  reviewRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginBottom: 8 },
  reviewLabel: { fontSize: 13, color: authColors.subText },
  reviewValue: { flex: 1, fontSize: 13, fontWeight: '600', color: authColors.panelText, textAlign: 'right' },
  teamTag: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: authRadii.pill,
    borderWidth: 1,
    borderColor: authColors.border,
    backgroundColor: authColors.white,
  },
  teamTagText: { fontSize: 12, color: authColors.panelText },
  infoBox: {
    padding: 16,
    borderRadius: authRadii.card,
    borderWidth: 1,
    borderColor: authColors.border,
    backgroundColor: authColors.surface,
    marginBottom: 16,
  },
  infoStrong: { fontSize: 13, fontWeight: '700', color: authColors.panelText, marginBottom: 6 },
  infoText: { fontSize: 13, lineHeight: 20, color: authColors.subText },
});
