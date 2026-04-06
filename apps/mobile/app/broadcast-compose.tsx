import {
  canComposeBroadcast,
  isBroadcastDraftOnlyRole,
  isOrgAdminRole,
  type ProfileRole,
} from '@campsite/types';
import { Button, Input, useCampsiteTheme, useToast } from '@campsite/ui';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { Picker } from '@react-native-picker/picker';
import { useQuery } from '@tanstack/react-query';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { type DeptRow, departmentsForBroadcast } from '@/lib/broadcastDeptScope';
import { useAuth } from '@/lib/AuthContext';
import { useUiSound } from '@/lib/sound/useUiSound';
import { getSupabase, isSupabaseConfigured } from '@/lib/supabase';

type CatRow = { id: string; name: string; dept_id: string };
type TeamRow = { id: string; name: string };
type DeliveryMode = 'org_wide' | 'specific';

type DeptBroadcastCaps = {
  send_org_wide: boolean;
  mandatory_broadcast: boolean;
  pin_broadcasts: boolean;
};

function parseDeptBroadcastCaps(raw: unknown): DeptBroadcastCaps {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    send_org_wide: Boolean(o.send_org_wide),
    mandatory_broadcast: Boolean(o.mandatory_broadcast),
    pin_broadcasts: Boolean(o.pin_broadcasts),
  };
}

function categoriesForDepartment(map: Map<string, CatRow[]>, deptId: string): CatRow[] {
  if (!deptId) return [];
  return map.get(deptId.trim().toLowerCase()) ?? [];
}

function formatSupabaseWriteError(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) {
    const o = e as { message: string; details?: string; hint?: string };
    const parts = [o.message, o.details, o.hint].filter((x): x is string => Boolean(x && String(x).trim()));
    return parts.length ? parts.join(' - ') : 'Request failed';
  }
  return e instanceof Error ? e.message : 'Request failed';
}

const TITLE_MAX = 120;

export default function BroadcastComposeScreen() {
  const { tokens, scheme } = useCampsiteTheme();
  const { show: showToast } = useToast();
  const playUiSound = useUiSound();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ draftId?: string }>();
  const draftParam = typeof params.draftId === 'string' ? params.draftId : undefined;

  const { profile, configured, user } = useAuth();
  const orgId = profile?.org_id ?? null;
  const userId = profile?.id ?? user?.id ?? null;
  const role = (profile?.role ?? 'worker') as ProfileRole;

  const draftOnly = isBroadcastDraftOnlyRole(role);
  const mayCompose = canComposeBroadcast(role);

  const [deptId, setDeptId] = useState('');
  const [catId, setCatId] = useState('');
  const [authorityDeptId, setAuthorityDeptId] = useState('');
  const [deliveryMode, setDeliveryMode] = useState<DeliveryMode>('specific');
  const [orgWideDeptIds, setOrgWideDeptIds] = useState<string[]>([]);
  const [orgWideCapsLoading, setOrgWideCapsLoading] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [scheduleMode, setScheduleMode] = useState(false);
  const [scheduledAt, setScheduledAt] = useState(() => new Date(Date.now() + 10 * 60_000));
  const [showPicker, setShowPicker] = useState(false);
  const [draftId, setDraftId] = useState<string | null>(draftParam ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [caps, setCaps] = useState<DeptBroadcastCaps | null>(null);
  const [capsLoading, setCapsLoading] = useState(false);
  const [isMandatory, setIsMandatory] = useState(false);
  const [isPinned, setIsPinned] = useState(false);
  const [teamId, setTeamId] = useState('');
  const [teamsForDept, setTeamsForDept] = useState<TeamRow[]>([]);
  const [draftLoading, setDraftLoading] = useState(!!draftParam);

  const metaQuery = useQuery({
    queryKey: ['broadcast-compose-meta', orgId, userId, role],
    enabled: configured && isSupabaseConfigured() && !!orgId && !!userId && mayCompose,
    queryFn: async () => {
      const supabase = getSupabase();
      const [{ data: deps }, { data: ud }, { data: dm }] = await Promise.all([
        supabase.from('departments').select('id,org_id,name,type,is_archived').eq('org_id', orgId!),
        supabase.from('user_departments').select('dept_id').eq('user_id', userId!),
        supabase.from('dept_managers').select('dept_id').eq('user_id', userId!),
      ]);
      const departments = (deps ?? []) as DeptRow[];
      const userDeptIds = new Set((ud ?? []).map((r) => r.dept_id as string));
      const managedDeptIds = new Set((dm ?? []).map((r) => r.dept_id as string));
      const scoped = departmentsForBroadcast(role, orgId!, departments, userDeptIds, managedDeptIds);
      const dids = scoped.map((d) => d.id);
      let cats: CatRow[] = [];
      if (dids.length) {
        const { data: c } = await supabase.from('broadcast_channels').select('id,name,dept_id').in('dept_id', dids);
        cats = (c ?? []).map((x) => ({
          id: x.id as string,
          name: x.name as string,
          dept_id: x.dept_id as string,
        }));
      }
      const categoriesByDept = new Map<string, CatRow[]>();
      for (const c of cats) {
        const k = c.dept_id.trim().toLowerCase();
        if (!categoriesByDept.has(k)) categoriesByDept.set(k, []);
        categoriesByDept.get(k)!.push(c);
      }
      return { departments: scoped, categoriesByDept };
    },
  });

  const departments = useMemo(() => metaQuery.data?.departments ?? [], [metaQuery.data]);
  const categoriesByDept = useMemo(
    () => metaQuery.data?.categoriesByDept ?? new Map<string, CatRow[]>(),
    [metaQuery.data],
  );

  const displayDeptId = useMemo(() => {
    if (departments.some((d) => d.id === deptId)) return deptId;
    return departments[0]?.id ?? '';
  }, [departments, deptId]);

  const cats = useMemo(
    () => categoriesForDepartment(categoriesByDept, displayDeptId),
    [categoriesByDept, displayDeptId],
  );

  const displayCatId = useMemo(() => {
    if (cats.some((c) => c.id === catId)) return catId;
    return cats[0]?.id ?? '';
  }, [cats, catId]);

  const displayAuthorityDeptId = useMemo(() => {
    if (orgWideDeptIds.includes(authorityDeptId)) return authorityDeptId;
    return orgWideDeptIds[0] ?? '';
  }, [authorityDeptId, orgWideDeptIds]);

  const isOrgWideActive = !draftOnly && deliveryMode === 'org_wide';

  const authorityDeptOptions = useMemo(
    () => departments.filter((d) => orgWideDeptIds.includes(d.id)),
    [departments, orgWideDeptIds],
  );

  const capsDeptId = isOrgWideActive ? displayAuthorityDeptId : displayDeptId;

  useEffect(() => {
    if (!mayCompose || !configured || !orgId || !userId || draftOnly || !departments.length) {
      setOrgWideDeptIds([]);
      setOrgWideCapsLoading(false);
      return;
    }
    let cancelled = false;
    setOrgWideCapsLoading(true);
    void (async () => {
      const supabase = getSupabase();
      const allowed: string[] = [];
      await Promise.all(
        departments.map(async (d) => {
          const { data, error: rpcErr } = await supabase.rpc('get_my_dept_broadcast_caps', {
            p_dept_id: d.id,
          });
          if (rpcErr || cancelled) return;
          const c = parseDeptBroadcastCaps(data);
          if (c.send_org_wide) allowed.push(d.id);
        }),
      );
      if (cancelled) return;
      setOrgWideDeptIds(allowed);
      setOrgWideCapsLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [mayCompose, configured, orgId, userId, draftOnly, departments]);

  useEffect(() => {
    if (!orgWideDeptIds.length || !isOrgWideActive) return;
    if (!orgWideDeptIds.includes(authorityDeptId)) {
      setAuthorityDeptId(orgWideDeptIds[0]!);
    }
  }, [orgWideDeptIds, authorityDeptId, isOrgWideActive]);

  useEffect(() => {
    let cancelled = false;
    if (!capsDeptId) {
      setCaps(null);
      setCapsLoading(false);
      return;
    }
    setCapsLoading(true);
    void getSupabase()
      .rpc('get_my_dept_broadcast_caps', { p_dept_id: capsDeptId })
      .then((res) => {
        if (cancelled) return;
        setCapsLoading(false);
        if (res.error) {
          setCaps({ send_org_wide: false, mandatory_broadcast: false, pin_broadcasts: false });
          return;
        }
        setCaps(parseDeptBroadcastCaps(res.data));
      });
    return () => {
      cancelled = true;
    };
  }, [capsDeptId]);

  useEffect(() => {
    if (draftOnly || deliveryMode !== 'specific' || !displayDeptId) {
      setTeamsForDept([]);
      setTeamId('');
      return;
    }
    let cancelled = false;
    void getSupabase()
      .from('department_teams')
      .select('id,name')
      .eq('dept_id', displayDeptId)
      .order('name')
      .then(({ data }) => {
        if (cancelled) return;
        setTeamsForDept((data as TeamRow[]) ?? []);
        setTeamId('');
      });
    return () => {
      cancelled = true;
    };
  }, [draftOnly, deliveryMode, displayDeptId]);

  useEffect(() => {
    if (isOrgWideActive) setIsMandatory(false);
  }, [isOrgWideActive]);

  useEffect(() => {
    if (!draftParam || !userId) return;
    let cancelled = false;
    setDraftLoading(true);
    void (async () => {
      const supabase = getSupabase();
      const { data, error: e } = await supabase
        .from('broadcasts')
        .select('*')
        .eq('id', draftParam)
        .eq('created_by', userId)
        .maybeSingle();
      if (cancelled) return;
      setDraftLoading(false);
      if (e || !data || (data.status as string) !== 'draft') {
        showToast('Could not load draft.');
        return;
      }
      setDraftId(data.id as string);
      setTitle(String(data.title ?? ''));
      setBody(String(data.body ?? ''));
      const orgWide = Boolean(data.is_org_wide);
      if (!draftOnly && orgWide) {
        setDeliveryMode('org_wide');
        setAuthorityDeptId(String(data.dept_id ?? ''));
      } else {
        setDeliveryMode('specific');
        setDeptId(String(data.dept_id ?? ''));
        setCatId(data.channel_id != null ? String(data.channel_id) : '');
      }
      setIsMandatory(Boolean(data.is_mandatory));
      setIsPinned(Boolean(data.is_pinned));
      setTeamId(data.team_id != null ? String(data.team_id) : '');
    })();
    return () => {
      cancelled = true;
    };
  }, [draftParam, userId, draftOnly, showToast]);

  const persistDraft = useCallback(async (): Promise<boolean> => {
    if (!mayCompose || !orgId || !userId || !title.trim()) return true;

    if (draftOnly) {
      if (!displayDeptId || !displayCatId) return true;
    } else if (isOrgWideActive) {
      if (!displayAuthorityDeptId) return true;
    } else {
      if (!displayDeptId || !displayCatId) return true;
    }

    if (!draftOnly && !isOrgWideActive) {
      const catRow = cats.find((c) => c.id === displayCatId);
      if (!catRow || String(catRow.dept_id).trim().toLowerCase() !== displayDeptId.trim().toLowerCase()) {
        setError('Channel does not match department.');
        return false;
      }
    }

    setSaving(true);
    setError(null);
    try {
      const supabase = getSupabase();
      const row = {
        org_id: orgId,
        dept_id: draftOnly || !isOrgWideActive ? displayDeptId : displayAuthorityDeptId,
        channel_id: isOrgWideActive ? null : displayCatId,
        team_id: draftOnly || isOrgWideActive || !teamId ? null : teamId,
        title: title.trim().slice(0, TITLE_MAX),
        body: body ?? '',
        status: 'draft' as const,
        created_by: userId,
        is_org_wide: isOrgWideActive,
        is_mandatory: isOrgWideActive ? false : isMandatory,
        is_pinned: isPinned,
      };
      if (draftId) {
        const { error: ue } = await supabase.from('broadcasts').update(row).eq('id', draftId).eq('created_by', userId);
        if (ue) throw ue;
      } else {
        const { data, error: ins } = await supabase.from('broadcasts').insert(row).select('id');
        if (ins) throw ins;
        const id = data?.[0]?.id as string | undefined;
        if (id) setDraftId(id);
      }
      return true;
    } catch (e: unknown) {
      setError(formatSupabaseWriteError(e));
      return false;
    } finally {
      setSaving(false);
    }
  }, [
    mayCompose,
    orgId,
    userId,
    title,
    body,
    draftOnly,
    isOrgWideActive,
    displayDeptId,
    displayCatId,
    displayAuthorityDeptId,
    draftId,
    cats,
    isMandatory,
    isPinned,
    teamId,
  ]);

  const dirty = useRef(false);
  useEffect(() => {
    dirty.current = true;
  }, [title, body, displayDeptId, displayCatId, scheduleMode, scheduledAt, deliveryMode, displayAuthorityDeptId, isMandatory, isPinned, teamId]);

  useEffect(() => {
    if (!mayCompose) return;
    const t = setInterval(() => {
      if (dirty.current && title.trim().length) {
        void persistDraft().then((ok) => {
          if (ok) dirty.current = false;
        });
      }
    }, 30_000);
    return () => clearInterval(t);
  }, [mayCompose, title, persistDraft]);

  const submit = async (mode: 'draft' | 'pending' | 'send' | 'schedule') => {
    if (!orgId || !userId) return;

    if (draftOnly) {
      if (!displayDeptId || !displayCatId || !title.trim()) {
        setError('Title, department, and channel are required.');
        playUiSound('error_soft');
        return;
      }
      const catRow = cats.find((c) => c.id === displayCatId);
      if (!catRow || String(catRow.dept_id).trim().toLowerCase() !== displayDeptId.trim().toLowerCase()) {
        setError('Channel does not match department.');
        playUiSound('error_soft');
        return;
      }
    } else if (isOrgWideActive) {
      if (!displayAuthorityDeptId || !title.trim()) {
        setError('Title and permission department are required for org-wide.');
        playUiSound('error_soft');
        return;
      }
    } else {
      if (!displayDeptId || !displayCatId || !title.trim()) {
        setError('Title, department, and channel are required.');
        playUiSound('error_soft');
        return;
      }
      const catRow = cats.find((c) => c.id === displayCatId);
      if (!catRow || String(catRow.dept_id).trim().toLowerCase() !== displayDeptId.trim().toLowerCase()) {
        setError('Channel does not match department.');
        playUiSound('error_soft');
        return;
      }
    }

    setSaving(true);
    setError(null);
    try {
      const supabase = getSupabase();

      if (mode === 'draft') {
        const ok = await persistDraft();
        if (ok) {
          playUiSound('broadcast_draft_saved');
          showToast('Draft saved');
        }
        return;
      }

      if (draftOnly) {
        const row = {
          org_id: orgId,
          dept_id: displayDeptId,
          channel_id: displayCatId,
          title: title.trim().slice(0, TITLE_MAX),
          body: body ?? '',
          status: 'pending_approval' as const,
          created_by: userId,
          is_org_wide: false,
          is_mandatory: false,
          is_pinned: false,
          team_id: null as string | null,
        };
        const { error: e } = await supabase.from('broadcasts').insert(row);
        if (e) throw e;
        playUiSound('broadcast_submitted');
        showToast('Submitted for approval');
        router.back();
        return;
      }

      const baseDept = isOrgWideActive ? displayAuthorityDeptId : displayDeptId;
      const baseCat = isOrgWideActive ? null : displayCatId;
      const baseTeam = isOrgWideActive || !teamId ? null : teamId;
      const baseFlags = {
        is_org_wide: isOrgWideActive,
        is_mandatory: isOrgWideActive ? false : isMandatory,
        is_pinned: isPinned,
        team_id: baseTeam,
      };

      if (mode === 'schedule') {
        const when = scheduledAt;
        if (when.getTime() < Date.now() + 5 * 60 * 1000) {
          setError('Schedule at least 5 minutes from now.');
          playUiSound('error_soft');
          return;
        }
        const row = {
          org_id: orgId,
          dept_id: baseDept,
          channel_id: baseCat,
          title: title.trim().slice(0, TITLE_MAX),
          body: body ?? '',
          status: 'scheduled' as const,
          scheduled_at: when.toISOString(),
          created_by: userId,
          ...baseFlags,
        };
        const { error: e } = await supabase.from('broadcasts').insert(row);
        if (e) throw e;
        playUiSound('broadcast_scheduled');
        showToast('Broadcast scheduled');
        router.back();
        return;
      }

      const row = {
        org_id: orgId,
        dept_id: baseDept,
        channel_id: baseCat,
        title: title.trim().slice(0, TITLE_MAX),
        body: body ?? '',
        status: 'sent' as const,
        sent_at: new Date().toISOString(),
        created_by: userId,
        ...baseFlags,
      };
      const { error: e } = await supabase.from('broadcasts').insert(row);
      if (e) throw e;
      playUiSound('broadcast_sent');
      showToast('Broadcast sent');
      router.back();
    } catch (e: unknown) {
      setError(formatSupabaseWriteError(e));
      playUiSound('error_soft');
    } finally {
      setSaving(false);
    }
  };

  const onPickerChange = (_: DateTimePickerEvent, date?: Date) => {
    setShowPicker(Platform.OS === 'ios');
    if (date) setScheduledAt(date);
  };

  const showExtraDelivery =
    !draftOnly &&
    caps &&
    ((isOrgWideActive && caps.pin_broadcasts) ||
      (!isOrgWideActive && (caps.mandatory_broadcast || caps.pin_broadcasts)));

  if (!configured || !isSupabaseConfigured()) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Text style={{ color: tokens.textSecondary }}>Supabase is not configured.</Text>
      </View>
    );
  }

  if (!mayCompose) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Text style={{ color: tokens.textSecondary }}>Your role cannot compose broadcasts.</Text>
      </View>
    );
  }

  if (!orgId || !userId) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Text style={{ color: tokens.textSecondary }}>Complete registration first.</Text>
      </View>
    );
  }

  if (metaQuery.isLoading || draftLoading) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <ActivityIndicator color={tokens.textPrimary} />
      </View>
    );
  }

  if (!departments.length) {
    return (
      <View style={[styles.center, { paddingTop: insets.top, paddingHorizontal: 24 }]}>
        <Text style={{ color: tokens.textSecondary, textAlign: 'center' }}>
          No departments available for your role. Ask an admin to assign you to a department.
        </Text>
      </View>
    );
  }

  const pickerStyle = {
    backgroundColor: scheme === 'dark' ? tokens.surface : '#ffffff',
    color: tokens.textPrimary,
  };

  return (
    <>
      <Stack.Screen options={{ title: draftParam || draftId ? 'Edit draft' : 'New broadcast', headerShown: true }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: tokens.background }}
        contentContainerStyle={{
          padding: 20,
          paddingBottom: insets.bottom + 32,
          gap: 16,
        }}
        keyboardShouldPersistTaps="handled"
      >
        {error ? (
          <View style={[styles.errBox, { borderColor: tokens.warning }]}>
            <Text style={{ color: tokens.warning, fontSize: 14 }}>{error}</Text>
          </View>
        ) : null}

        <Input
          label="Title"
          value={title}
          onChangeText={setTitle}
          maxLength={TITLE_MAX}
          style={{ fontSize: 18, fontWeight: '600' }}
          placeholder="Headline"
        />
        <Text style={[styles.counter, { color: tokens.textMuted }]}>
          {title.length}/{TITLE_MAX}
        </Text>

        <Input
          label="Write"
          value={body}
          onChangeText={setBody}
          multiline
          placeholder="Start typing… Use **bold**, *italic*, or lines starting with - for bullets."
          style={{
            minHeight: 240,
            textAlignVertical: 'top',
            fontSize: 17,
            lineHeight: 26,
            paddingTop: 14,
          }}
        />
        <Text style={[styles.boxHint, { color: tokens.textMuted }]}>
          Markdown is applied when the broadcast is sent; there is no live preview.
        </Text>

        {!draftOnly ? (
          <View style={[styles.box, { borderColor: tokens.border }]}>
            <Text style={[styles.boxTitle, { color: tokens.textPrimary }]}>Audience</Text>
            <Text style={[styles.boxHint, { color: tokens.textSecondary }]}>
              Org-wide reaches everyone. Specific targets a department and channel; optional team narrows further.
            </Text>
            <View style={styles.rowGap}>
              <PressableRow
                label="Specific"
                selected={deliveryMode === 'specific'}
                onPress={() => setDeliveryMode('specific')}
                borderColor={tokens.border}
                textPrimary={tokens.textPrimary}
                textMuted={tokens.textMuted}
                surface={tokens.surface}
              />
              <PressableRow
                label="Org-wide"
                selected={deliveryMode === 'org_wide'}
                onPress={() => {
                  if (orgWideDeptIds.length) setDeliveryMode('org_wide');
                }}
                disabled={!orgWideDeptIds.length || orgWideCapsLoading}
                borderColor={tokens.border}
                textPrimary={tokens.textPrimary}
                textMuted={tokens.textMuted}
                surface={tokens.surface}
              />
            </View>
            {!orgWideDeptIds.length && !orgWideCapsLoading && !isOrgAdminRole(role) ? (
              <Text style={[styles.boxHint, { color: tokens.textMuted, marginTop: 8 }]}>
                You do not have org-wide send on any department. Use Specific or ask an admin to enable it.
              </Text>
            ) : null}
            {orgWideCapsLoading ? (
              <Text style={[styles.boxHint, { color: tokens.textSecondary }]}>Checking permissions…</Text>
            ) : null}
          </View>
        ) : null}

        {!draftOnly && isOrgWideActive ? (
          <View>
            <Text style={[styles.label, { color: tokens.textSecondary }]}>Permission department</Text>
            <View style={[styles.pickerWrap, { borderColor: tokens.border }]}>
              <Picker
                selectedValue={displayAuthorityDeptId}
                onValueChange={(v) => setAuthorityDeptId(String(v))}
                style={pickerStyle}
                enabled={authorityDeptOptions.length > 0}
              >
                {authorityDeptOptions.map((d) => (
                  <Picker.Item key={d.id} label={d.name} value={d.id} color={tokens.textPrimary} />
                ))}
              </Picker>
            </View>
          </View>
        ) : (
          <View style={{ gap: 12 }}>
            <View>
              <Text style={[styles.label, { color: tokens.textSecondary }]}>Department</Text>
              <View style={[styles.pickerWrap, { borderColor: tokens.border }]}>
                <Picker
                  selectedValue={displayDeptId}
                  onValueChange={(v) => setDeptId(String(v))}
                  style={pickerStyle}
                >
                  {departments.map((d) => (
                    <Picker.Item key={d.id} label={d.name} value={d.id} color={tokens.textPrimary} />
                  ))}
                </Picker>
              </View>
            </View>
            <View>
              <Text style={[styles.label, { color: tokens.textSecondary }]}>Channel</Text>
              <View style={[styles.pickerWrap, { borderColor: tokens.border }]}>
                <Picker
                  selectedValue={displayCatId}
                  onValueChange={(v) => setCatId(String(v))}
                  style={pickerStyle}
                  enabled={cats.length > 0}
                >
                  {cats.length === 0 ? (
                    <Picker.Item label="No channels" value="" color={tokens.textMuted} />
                  ) : null}
                  {cats.map((c) => (
                    <Picker.Item key={c.id} label={c.name} value={c.id} color={tokens.textPrimary} />
                  ))}
                </Picker>
              </View>
            </View>
            {!draftOnly && deliveryMode === 'specific' && teamsForDept.length > 0 ? (
              <View>
                <Text style={[styles.label, { color: tokens.textSecondary }]}>Team (optional)</Text>
                <View style={[styles.pickerWrap, { borderColor: tokens.border }]}>
                  <Picker
                    selectedValue={teamId || '__all__'}
                    onValueChange={(v) => setTeamId(v === '__all__' ? '' : String(v))}
                    style={pickerStyle}
                  >
                    <Picker.Item label="All members" value="__all__" color={tokens.textPrimary} />
                    {teamsForDept.map((t) => (
                      <Picker.Item key={t.id} label={t.name} value={t.id} color={tokens.textPrimary} />
                    ))}
                  </Picker>
                </View>
              </View>
            ) : null}
          </View>
        )}

        {showExtraDelivery ? (
          <View style={{ gap: 10 }}>
            {!isOrgWideActive && caps?.mandatory_broadcast ? (
              <View style={styles.switchRow}>
                <Text style={{ color: tokens.textPrimary, flex: 1 }}>Mandatory (ignores unsubscribes)</Text>
                <Switch value={isMandatory} onValueChange={setIsMandatory} />
              </View>
            ) : null}
            {caps?.pin_broadcasts ? (
              <View style={styles.switchRow}>
                <Text style={{ color: tokens.textPrimary, flex: 1 }}>Pin to top of feed</Text>
                <Switch value={isPinned} onValueChange={setIsPinned} />
              </View>
            ) : null}
          </View>
        ) : null}

        {!draftOnly ? (
          <View style={styles.switchRow}>
            <Text style={{ color: tokens.textPrimary, flex: 1 }}>Schedule instead of sending now</Text>
            <Switch value={scheduleMode} onValueChange={setScheduleMode} />
          </View>
        ) : null}

        {!draftOnly && scheduleMode ? (
          <View>
            <Text style={[styles.label, { color: tokens.textSecondary }]}>Send at</Text>
            <Button variant="secondary" onPress={() => setShowPicker(true)}>
              {scheduledAt.toLocaleString()}
            </Button>
            {showPicker ? (
              <DateTimePicker value={scheduledAt} mode="datetime" display={Platform.OS === 'ios' ? 'spinner' : 'default'} onChange={onPickerChange} />
            ) : null}
          </View>
        ) : null}

        <View style={{ gap: 10, marginTop: 8 }}>
          <Button loading={saving} onPress={() => void submit('draft')}>
            Save draft
          </Button>
          {draftOnly ? (
            <Button loading={saving} onPress={() => void submit('pending')}>
              Submit for approval
            </Button>
          ) : scheduleMode ? (
            <Button loading={saving} onPress={() => void submit('schedule')}>
              Schedule
            </Button>
          ) : (
            <Button loading={saving} onPress={() => void submit('send')}>
              Send now
            </Button>
          )}
        </View>

        {capsLoading ? <Text style={{ color: tokens.textMuted, fontSize: 12 }}>Loading permissions…</Text> : null}
      </ScrollView>
    </>
  );
}

function PressableRow({
  label,
  selected,
  onPress,
  disabled,
  borderColor,
  textPrimary,
  textMuted,
  surface,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
  borderColor: string;
  textPrimary: string;
  textMuted: string;
  surface: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.modeChip,
        {
          borderColor,
          backgroundColor: selected ? surface : 'transparent',
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
        },
      ]}
    >
      <Text style={{ color: disabled ? textMuted : textPrimary, fontSize: 14, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errBox: { borderWidth: 1, borderRadius: 10, padding: 12 },
  counter: { fontSize: 12, textAlign: 'right', marginTop: -8 },
  box: { borderWidth: 1, borderRadius: 12, padding: 14 },
  boxTitle: { fontSize: 15, fontWeight: '600' },
  boxHint: { fontSize: 12, lineHeight: 17, marginTop: 6 },
  rowGap: { flexDirection: 'row', gap: 10, marginTop: 12, flexWrap: 'wrap' },
  modeChip: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    fontSize: 14,
    fontWeight: '600',
    overflow: 'hidden',
  },
  label: { fontSize: 14, fontWeight: '500', marginBottom: 6 },
  pickerWrap: { borderWidth: 1, borderRadius: 10, overflow: 'hidden' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});
