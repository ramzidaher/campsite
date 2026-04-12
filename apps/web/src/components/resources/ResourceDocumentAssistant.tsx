'use client';

import { useCallback, useRef, useState } from 'react';

export type ChatMessage = { role: 'user' | 'assistant'; content: string };

export function ResourceDocumentAssistant({ resourceId }: { resourceId: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || busy) return;
    setErr(null);
    setNote(null);
    const nextUser: ChatMessage = { role: 'user', content: text };
    const previous = messages;
    const history = [...previous, nextUser];
    setMessages(history);
    setInput('');
    setBusy(true);
    try {
      const res = await fetch('/api/resources/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
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
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    }
  }, [busy, input, messages, resourceId]);

  return (
    <div className="mt-8 rounded-xl border border-[#d8d8d8] bg-[#f5f4f1] p-4">
      <h2 className="text-[12px] font-semibold uppercase tracking-[0.08em] text-[#6b6b6b]">
        Ask about this document
      </h2>
      <p className="mt-1 text-[12px] text-[#6b6b6b]">
        Ask questions in plain language. Answers use this file when the assistant can read it (e.g. PDF and text). Follow-up
        questions keep the conversation context.
      </p>

      <div className="mt-4 max-h-[min(52vh,420px)] space-y-3 overflow-y-auto rounded-lg border border-[#ececec] bg-white p-3">
        {messages.length === 0 ? (
          <p className="text-[13px] text-[#6b6b6b]">
            For example: &ldquo;What is the annual leave policy?&rdquo; or &ldquo;Who should I contact about payroll?&rdquo;
          </p>
        ) : (
          messages.map((m, i) => (
            <div
              key={i}
              className={`rounded-lg px-3 py-2 text-[13px] leading-relaxed ${
                m.role === 'user'
                  ? 'ml-6 bg-[#121212] text-[#faf9f6]'
                  : 'mr-6 border border-[#ececec] bg-[#faf9f6] text-[#121212] whitespace-pre-wrap'
              }`}
            >
              {m.content}
            </div>
          ))
        )}
        {busy ? <p className="text-[12px] text-[#6b6b6b]">Thinking…</p> : null}
        <div ref={bottomRef} />
      </div>

      {err ? <p className="mt-2 text-[13px] text-red-800">{err}</p> : null}
      {note ? <p className="mt-2 text-[12px] text-[#6b6b6b]">{note}</p> : null}

      <div className="mt-3 flex gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder="Type a question…"
          rows={2}
          disabled={busy}
          className="min-h-[44px] flex-1 resize-y rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[13px] text-[#121212] outline-none focus:border-[#121212] disabled:opacity-60"
        />
        <button
          type="button"
          disabled={busy || !input.trim()}
          onClick={() => void send()}
          className="h-11 shrink-0 self-end rounded-lg bg-[#121212] px-4 text-[13px] font-medium text-[#faf9f6] disabled:opacity-50"
        >
          Send
        </button>
      </div>
    </div>
  );
}
