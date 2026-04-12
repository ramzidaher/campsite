import { Card, useCampsiteTheme } from '@campsite/ui';
import Constants from 'expo-constants';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useAuth } from '@/lib/AuthContext';

type Msg = { role: 'user' | 'assistant'; content: string };

export function ResourceDocumentAssistant({ resourceId }: { resourceId: string }) {
  const { tokens, scheme } = useCampsiteTheme();
  const { session } = useAuth();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const siteUrl = (
    (Constants.expoConfig?.extra as { siteUrl?: string } | undefined)?.siteUrl?.trim() ?? ''
  ).replace(/\/$/, '');

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || busy || !siteUrl || !session?.access_token) return;
    setErr(null);
    setNote(null);
    const previous = messages;
    const nextUser: Msg = { role: 'user', content: text };
    const history = [...previous, nextUser];
    setMessages(history);
    setInput('');
    setBusy(true);
    try {
      const res = await fetch(`${siteUrl}/api/resources/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          resourceId,
          messages: history.map((m) => ({ role: m.role, content: m.content })),
        }),
      });
      let data: { reply?: string; note?: string; error?: string; message?: string } = {};
      try {
        data = (await res.json()) as typeof data;
      } catch {
        /* ignore */
      }
      if (!res.ok) {
        const msg =
          data.error === 'not_configured' && typeof data.message === 'string'
            ? data.message
            : typeof data.error === 'string'
              ? data.error
              : 'Could not get a reply.';
        setErr(msg);
        setMessages(previous);
        return;
      }
      if (typeof data.reply !== 'string' || !data.reply.trim()) {
        setErr('No reply returned.');
        setMessages(previous);
        return;
      }
      setMessages([...history, { role: 'assistant', content: data.reply.trim() }]);
      if (typeof data.note === 'string' && data.note.trim()) {
        setNote(data.note.trim());
      }
    } catch {
      setErr('Network error.');
      setMessages(previous);
    } finally {
      setBusy(false);
    }
  }, [busy, input, messages, resourceId, session?.access_token, siteUrl]);

  const cardBg = scheme === 'dark' ? tokens.surface : '#ffffff';

  return (
    <Card style={{ marginTop: 20, backgroundColor: cardBg, borderColor: tokens.border }}>
      <Text style={[styles.kicker, { color: tokens.textMuted }]}>ASK ABOUT THIS DOCUMENT</Text>
      <Text style={{ marginTop: 6, fontSize: 12, lineHeight: 17, color: tokens.textSecondary }}>
        Ask in plain language. Follow-up questions keep context. Answers use this file when it can be read (PDF, text).
      </Text>

      <ScrollView style={{ marginTop: 12, maxHeight: 280 }} nestedScrollEnabled>
        {messages.length === 0 ? (
          <Text style={{ fontSize: 13, color: tokens.textSecondary }}>
            e.g. &quot;What is the annual leave policy?&quot;
          </Text>
        ) : (
          messages.map((m, i) => (
            <View
              key={i}
              style={[
                styles.bubble,
                m.role === 'user'
                  ? { alignSelf: 'flex-end', backgroundColor: tokens.textPrimary }
                  : { alignSelf: 'flex-start', borderWidth: StyleSheet.hairlineWidth, borderColor: tokens.border },
              ]}
            >
              <Text
                style={{
                  fontSize: 13,
                  lineHeight: 20,
                  color: m.role === 'user' ? (scheme === 'dark' ? tokens.background : '#faf9f6') : tokens.textPrimary,
                }}
              >
                {m.content}
              </Text>
            </View>
          ))
        )}
        {busy ? <ActivityIndicator style={{ marginTop: 8 }} color={tokens.textPrimary} /> : null}
      </ScrollView>

      {err ? (
        <Text style={{ marginTop: 8, color: tokens.warning, fontSize: 13 }}>{err}</Text>
      ) : null}
      {note ? (
        <Text style={{ marginTop: 6, fontSize: 11, color: tokens.textMuted }}>{note}</Text>
      ) : null}

      <TextInput
        value={input}
        onChangeText={setInput}
        placeholder="Type a question…"
        placeholderTextColor={tokens.textMuted}
        multiline
        editable={!busy && !!siteUrl && !!session?.access_token}
        style={[
          styles.input,
          {
            borderColor: tokens.border,
            color: tokens.textPrimary,
            backgroundColor: scheme === 'dark' ? tokens.background : '#ffffff',
          },
        ]}
      />
      <Pressable
        onPress={() => void send()}
        disabled={busy || !input.trim() || !siteUrl || !session?.access_token}
        style={({ pressed }) => ({
          marginTop: 10,
          alignSelf: 'flex-start',
          paddingHorizontal: 16,
          paddingVertical: 10,
          borderRadius: 10,
          backgroundColor: tokens.textPrimary,
          opacity: pressed ? 0.9 : busy || !input.trim() ? 0.5 : 1,
        })}
      >
        <Text style={{ color: scheme === 'dark' ? tokens.background : '#faf9f6', fontWeight: '600' }}>Send</Text>
      </Pressable>
      {!siteUrl || !session?.access_token ? (
        <Text style={{ marginTop: 8, fontSize: 12, color: tokens.textMuted }}>
          {!siteUrl ? 'Set siteUrl in app config to use the assistant.' : 'Sign in to use the assistant.'}
        </Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  kicker: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6 },
  bubble: {
    maxWidth: '92%',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    marginBottom: 8,
  },
  input: {
    marginTop: 10,
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 14,
  },
});
