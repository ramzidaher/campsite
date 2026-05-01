import { useCampsiteTheme } from '@campsite/ui';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { ProfileRow } from '@/lib/AuthContext';
import { mainShell, mainShellText } from '@/constants/mainShell';
import { getSupabase } from '@/lib/supabase';

type QuestionOwner = 'employee' | 'manager' | 'both';

type OneOnOneDoc = {
  version: number;
  questions: Array<{ id: string; prompt: string; owner: QuestionOwner; answer: string }>;
  manager_notes_shared: string;
  private_manager_notes: string;
  action_items: Array<{ id: string; text: string; done: boolean; assignee_user_id: string | null }>;
};

type MeetingDetail = {
  id: string;
  manager_user_id: string;
  report_user_id: string;
  manager_name: string | null;
  report_name: string | null;
  starts_at: string;
  ends_at: string | null;
  status: string;
  session_title: string;
  doc: OneOnOneDoc;
  notes_locked_at: string | null;
  completed_at: string | null;
  manager_signed_at: string | null;
  report_signed_at: string | null;
  next_session_at: string | null;
  session_index: number;
};

function normalizeDoc(raw: unknown): OneOnOneDoc {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const qs = Array.isArray(o.questions) ? o.questions : [];
  const questions = qs.map((q) => {
    const r = q && typeof q === 'object' ? (q as Record<string, unknown>) : {};
    const v = r.owner;
    const owner: QuestionOwner =
      v === 'manager' || v === 'both' || v === 'employee' ? v : 'employee';
    return {
      id: String(r.id ?? `q-${Math.random().toString(36).slice(2)}`),
      prompt: String(r.prompt ?? ''),
      owner,
      answer: String(r.answer ?? ''),
    };
  });
  const itemsRaw = Array.isArray(o.action_items) ? o.action_items : [];
  const action_items = itemsRaw.map((a) => {
    const r = a && typeof a === 'object' ? (a as Record<string, unknown>) : {};
    return {
      id: String(r.id ?? `a-${Math.random().toString(36).slice(2)}`),
      text: String(r.text ?? ''),
      done: Boolean(r.done),
      assignee_user_id: r.assignee_user_id != null ? String(r.assignee_user_id) : null,
    };
  });
  return {
    version: 1,
    questions,
    manager_notes_shared: String(o.manager_notes_shared ?? ''),
    private_manager_notes: String(o.private_manager_notes ?? ''),
    action_items,
  };
}

function canEditAnswer(isManager: boolean, owner: QuestionOwner) {
  if (isManager) return true;
  return owner === 'employee' || owner === 'both';
}

export function OneOnOneDetailScreen({ profile, meetingId }: { profile: ProfileRow; meetingId: string }) {
  const { tokens, scheme } = useCampsiteTheme();
  const isDark = scheme === 'dark';
  const router = useRouter();
  const supabase = useMemo(() => getSupabase(), []);
  const [m, setM] = useState<MeetingDetail | null>(null);
  const [sessionTitle, setSessionTitle] = useState('');
  const [doc, setDoc] = useState<OneOnOneDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [proposed, setProposed] = useState('');

  const textPrimary = isDark ? tokens.textPrimary : '#121212';
  const textSecondary = isDark ? tokens.textSecondary : '#6b6b6b';
  const border = isDark ? tokens.border : '#d8d8d8';

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('one_on_one_meeting_get', { p_meeting_id: meetingId });
    setLoading(false);
    if (error || !data || typeof data !== 'object') {
      setErr(error?.message ?? 'Not found');
      return;
    }
    const row = data as unknown as MeetingDetail;
    setM(row);
    setSessionTitle(row.session_title ?? '');
    setDoc(normalizeDoc(row.doc));
  }, [supabase, meetingId]);

  useEffect(() => {
    void load();
  }, [load]);

  const isManager = m?.manager_user_id === profile.id;
  const isReport = m?.report_user_id === profile.id;
  const locked = Boolean(m?.notes_locked_at) || m?.status === 'completed';
  const canEditNotes = m && !locked && m.status !== 'cancelled';

  const saveDoc = async (next: OneOnOneDoc, title: string) => {
    if (!m) return;
    setErr(null);
    const { error } = await supabase.rpc('one_on_one_meeting_update_doc', {
      p_meeting_id: m.id,
      p_session_title: title,
      p_doc: next as unknown as Record<string, unknown>,
      p_next_session_at: null,
    });
    if (error) setErr(error.message);
  };

  const setStatus = async (status: string) => {
    if (!m || !doc) return;
    setErr(null);
    await saveDoc(doc, sessionTitle);
    const { error } = await supabase.rpc('one_on_one_meeting_set_status', {
      p_meeting_id: m.id,
      p_status: status,
    });
    if (error) setErr(error.message);
    else void load();
  };

  const submitEditRequest = async () => {
    if (!m) return;
    setErr(null);
    const { error } = await supabase.rpc('one_on_one_note_edit_request_create', {
      p_meeting_id: m.id,
      p_proposed_notes: proposed,
      p_proposed_doc: null,
    });
    if (error) setErr(error.message);
    else setProposed('');
  };

  if (loading || !m || !doc) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
        {err ? <Text style={{ color: '#b91c1c', marginTop: 12 }}>{err}</Text> : null}
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{
        paddingHorizontal: mainShell.spacing.md,
        paddingTop: mainShell.spacing.md,
        paddingBottom: mainShell.spacing.xxl + mainShell.spacing.xs,
      }}
    >
      <Pressable onPress={() => router.back()}>
        <Text style={{ color: textSecondary, ...mainShellText.caption }}>← Back</Text>
      </Pressable>
      <Text style={[styles.title, { color: textPrimary }]}>{isManager ? m.report_name : m.manager_name}</Text>
      <Text style={[styles.meta, { color: textSecondary }]}>
        {new Date(m.starts_at).toLocaleString()} · Session {m.session_index ?? 1} · {m.status.replace('_', ' ')}
      </Text>

      {err ? <Text style={styles.err}>{err}</Text> : null}

      <Text style={[styles.h2, { color: textPrimary }]}>Title</Text>
      <TextInput
        value={sessionTitle}
        onChangeText={(t) => {
          setSessionTitle(t);
          if (canEditNotes && isManager) void saveDoc(doc, t);
        }}
        editable={!!canEditNotes && isManager}
        style={[styles.input, { color: textPrimary, borderColor: border }]}
      />

      <Text style={[styles.h2, { color: textPrimary }]}>Check-in</Text>
      {doc.questions.map((q) => (
        <View key={q.id} style={{ marginBottom: mainShell.spacing.sm }}>
          <Text style={{ ...mainShellText.bodyStrong, color: textPrimary }}>{q.prompt || 'Question'}</Text>
          {canEditNotes && canEditAnswer(!!isManager, q.owner) ? (
            <TextInput
              multiline
              value={q.answer}
              onChangeText={(answer) => {
                const next = {
                  ...doc,
                  questions: doc.questions.map((x) => (x.id === q.id ? { ...x, answer } : x)),
                };
                setDoc(next);
                void saveDoc(next, sessionTitle);
              }}
              style={[styles.input, { color: textPrimary, borderColor: border, minHeight: 72 }]}
            />
          ) : (
            <Text style={{ ...mainShellText.body, color: textPrimary, marginTop: mainShell.spacing.xxs }}>
              {q.answer || '—'}
            </Text>
          )}
        </View>
      ))}

      <Text style={[styles.h2, { color: textPrimary }]}>Manager notes</Text>
      {canEditNotes && isManager ? (
        <TextInput
          multiline
          value={doc.manager_notes_shared}
          onChangeText={(t) => {
            const next = { ...doc, manager_notes_shared: t };
            setDoc(next);
            void saveDoc(next, sessionTitle);
          }}
          style={[styles.input, { color: textPrimary, borderColor: border }]}
        />
      ) : (
        <Text style={[styles.body, { color: textPrimary }]}>{doc.manager_notes_shared || '—'}</Text>
      )}

      {isManager ? (
        <>
          <Text style={[styles.h2, { color: textPrimary }]}>Private notes</Text>
          {canEditNotes ? (
            <TextInput
              multiline
              value={doc.private_manager_notes}
              onChangeText={(t) => {
                const next = { ...doc, private_manager_notes: t };
                setDoc(next);
                void saveDoc(next, sessionTitle);
              }}
              style={[styles.input, { color: textPrimary, borderColor: border, minHeight: 80 }]}
            />
          ) : (
            <Text style={[styles.body, { color: textPrimary }]}>{doc.private_manager_notes || '—'}</Text>
          )}
        </>
      ) : null}

      <Text style={[styles.h2, { color: textPrimary }]}>Actions</Text>
      {doc.action_items.map((a) => (
        <View
          key={a.id}
          style={{
            flexDirection: 'row',
            alignItems: 'flex-start',
            gap: mainShell.spacing.xs,
            marginBottom: mainShell.spacing.xs,
          }}
        >
          <Pressable
            onPress={() => {
              if (!canEditNotes) return;
              const next = {
                ...doc,
                action_items: doc.action_items.map((x) => (x.id === a.id ? { ...x, done: !x.done } : x)),
              };
              setDoc(next);
              void saveDoc(next, sessionTitle);
            }}
            style={{
              width: 20,
              height: 20,
              borderWidth: StyleSheet.hairlineWidth,
              borderColor: border,
              marginTop: 2,
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            {a.done ? <Text style={styles.checkmark}>✓</Text> : null}
          </Pressable>
          {canEditNotes ? (
            <TextInput
              multiline
              value={a.text}
              onChangeText={(t) => {
                const next = {
                  ...doc,
                  action_items: doc.action_items.map((x) => (x.id === a.id ? { ...x, text: t } : x)),
                };
                setDoc(next);
                void saveDoc(next, sessionTitle);
              }}
              style={[styles.input, { flex: 1, color: textPrimary, borderColor: border, minHeight: 44 }]}
            />
          ) : (
            <Text style={[styles.body, { flex: 1, color: textPrimary }]}>{a.text || '—'}</Text>
          )}
        </View>
      ))}

      {isManager && m.status !== 'completed' && m.status !== 'cancelled' ? (
        <View style={{ marginTop: mainShell.spacing.md, gap: mainShell.spacing.xs }}>
          {m.status === 'scheduled' ? (
            <Pressable onPress={() => void setStatus('in_progress')} style={styles.btnOutline}>
              <Text style={{ color: textPrimary }}>Start meeting</Text>
            </Pressable>
          ) : null}
          <Pressable onPress={() => void setStatus('completed')} style={styles.btnDark}>
            <Text style={styles.btnDarkText}>Mark complete</Text>
          </Pressable>
        </View>
      ) : null}

      {locked && (m.manager_user_id === profile.id || m.report_user_id === profile.id) ? (
        <View style={{ marginTop: mainShell.spacing.lg }}>
          <Text style={[styles.h2, { color: textPrimary }]}>Request note change</Text>
          <TextInput
            multiline
            value={proposed}
            onChangeText={setProposed}
            placeholder="Proposed notes"
            placeholderTextColor={textSecondary}
            style={[styles.input, { color: textPrimary, borderColor: border }]}
          />
          <Pressable onPress={() => void submitEditRequest()} style={styles.btnDark}>
            <Text style={styles.btnDarkText}>Submit request</Text>
          </Pressable>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  title: { ...mainShellText.pageTitle, fontWeight: '600', marginTop: mainShell.spacing.sm },
  meta: { ...mainShellText.caption, marginTop: mainShell.spacing.xs - 2 },
  h2: {
    ...mainShellText.subheading,
    marginTop: mainShell.spacing.lg,
    marginBottom: mainShell.spacing.xs,
  },
  body: { ...mainShellText.body },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    padding: mainShell.spacing.sm,
    minHeight: 120,
    textAlignVertical: 'top',
    ...mainShellText.body,
  },
  btnDark: {
    alignSelf: 'flex-start',
    backgroundColor: '#121212',
    paddingHorizontal: mainShell.spacing.md,
    paddingVertical: mainShell.spacing.xs + 2,
    borderRadius: 10,
    marginTop: mainShell.spacing.xs + 2,
  },
  btnDarkText: { color: '#faf9f6', ...mainShellText.bodyStrong },
  btnOutline: {
    alignSelf: 'flex-start',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#d8d8d8',
    paddingHorizontal: mainShell.spacing.md,
    paddingVertical: mainShell.spacing.xs + 2,
    borderRadius: 10,
  },
  err: { color: '#b91c1c', marginTop: mainShell.spacing.sm, ...mainShellText.caption },
  checkmark: { ...mainShellText.caption },
});
