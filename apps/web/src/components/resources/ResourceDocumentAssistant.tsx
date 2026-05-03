'use client';

import { useCallback, useRef, useState } from 'react';
import { Compass } from 'lucide-react';

import { AssistantChatMarkdown } from '@/components/resources/AssistantChatMarkdown';
import { userFacingScoutError } from '@campsite/types';

export type ChatMessage = { role: 'user' | 'assistant'; content: string };

const STARTER_CHIPS = [
  'What are the main points in this document?',
  'Are there any important dates or deadlines?',
  'Summarize this in three short bullet points.',
  'What should I do next, if anything?',
];

export function ResourceDocumentAssistant({
  resourceId,
  displayFontClassName = '',
}: {
  resourceId: string;
  displayFontClassName?: string;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [chipsVisible, setChipsVisible] = useState(true);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const runSend = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || busy) return;
      setErr(null);
      setNote(null);
      setChipsVisible(false);
      const nextUser: ChatMessage = { role: 'user', content: trimmed };
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
          const raw =
            data.error === 'not_configured' && typeof data.message === 'string'
              ? data.message
              : typeof data.error === 'string'
                ? data.error
                : 'Could not get a reply.';
          setErr(userFacingScoutError(raw));
          setMessages(previous);
          if (previous.length === 0) setChipsVisible(true);
          return;
        }
        if (typeof data.reply !== 'string' || !data.reply.trim()) {
          setErr('No reply returned.');
          setMessages(previous);
          if (previous.length === 0) setChipsVisible(true);
          return;
        }
        setMessages([...history, { role: 'assistant', content: data.reply.trim() }]);
        if (typeof data.note === 'string' && data.note.trim()) {
          setNote(data.note.trim());
        }
      } catch {
        setErr('Network error.');
        setMessages(previous);
        if (previous.length === 0) setChipsVisible(true);
      } finally {
        setBusy(false);
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
      }
    },
    [busy, messages, resourceId],
  );

  const send = useCallback(() => {
    void runSend(input);
  }, [input, runSend]);

  const showIntro = messages.length === 0;

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-[color-mix(in_oklab,var(--org-brand-border)_90%,transparent)] bg-[var(--org-brand-bg)] shadow-[0_1px_0_color-mix(in_oklab,var(--org-brand-border)_35%,transparent)]">
      <div className="flex items-center gap-2.5 border-b border-[color-mix(in_oklab,var(--org-brand-border)_90%,transparent)] px-4 py-4 sm:px-5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-[var(--org-brand-primary)] text-[var(--org-brand-on-primary)]">
          <Compass className="h-4 w-4" strokeWidth={2} aria-hidden />
        </div>
        <div className="min-w-0">
          <div className={`${displayFontClassName} text-sm font-semibold text-[var(--org-brand-text)]`}>Scout</div>
          <div className="flex items-center gap-1 text-[11px] font-medium text-[var(--org-brand-primary)]">
            <span className="inline-block h-[5px] w-[5px] rounded-full bg-[var(--org-brand-primary)]" aria-hidden />
            Ready to help
          </div>
        </div>
      </div>

      <div className="flex max-h-[min(52vh,440px)] min-h-[280px] flex-col gap-3 overflow-y-auto bg-[color-mix(in_oklab,var(--org-brand-surface)_55%,var(--org-brand-bg))] px-4 py-4 sm:px-5">
        {showIntro ? (
          <div className="flex flex-col gap-1 self-start">
            <div className="max-w-[85%] rounded-[14px] rounded-bl-[4px] border border-[color-mix(in_oklab,var(--org-brand-border)_88%,transparent)] bg-[var(--org-brand-bg)] px-3.5 py-2.5 text-[13.5px] leading-[1.55] text-[var(--org-brand-text)]">
              Hi! I&apos;m Scout — I can answer questions about this file using its contents when I can read them (for
              example PDF and text). Here are some ideas to get started:
            </div>
          </div>
        ) : null}

        {chipsVisible && showIntro ? (
          <div className="flex flex-wrap gap-1.5">
            {STARTER_CHIPS.map((label) => (
              <button
                key={label}
                type="button"
                disabled={busy}
                onClick={() => void runSend(label)}
                className="rounded-full border border-[color-mix(in_oklab,var(--org-brand-border)_88%,transparent)] bg-[var(--org-brand-bg)] px-3 py-1.5 text-left text-[12px] text-[var(--org-brand-text)] transition hover:border-[var(--org-brand-primary)] hover:bg-[var(--org-brand-primary)] hover:text-[var(--org-brand-on-primary)] disabled:opacity-50"
              >
                {label}
              </button>
            ))}
          </div>
        ) : null}

        {messages.map((m, i) => (
          <div
            key={i}
            className={`flex max-w-[85%] flex-col gap-1 ${m.role === 'user' ? 'self-end items-end' : 'self-start items-start'}`}
          >
            <div
              className={`rounded-[14px] px-3.5 py-2.5 text-[13.5px] leading-[1.55] ${
                m.role === 'user'
                  ? 'rounded-br-[4px] bg-[var(--org-brand-primary)] text-[var(--org-brand-on-primary)] whitespace-pre-wrap'
                  : 'rounded-bl-[4px] border border-[color-mix(in_oklab,var(--org-brand-border)_88%,transparent)] bg-[var(--org-brand-bg)] text-[var(--org-brand-text)]'
              }`}
            >
              {m.role === 'assistant' ? (
                <AssistantChatMarkdown content={m.content} />
              ) : (
                m.content
              )}
            </div>
          </div>
        ))}

        {busy ? (
          <div className="flex max-w-[85%] self-start">
            <div className="flex items-center gap-1.5 rounded-[14px] rounded-bl-[4px] border border-[color-mix(in_oklab,var(--org-brand-border)_88%,transparent)] bg-[var(--org-brand-bg)] px-3.5 py-2.5">
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[color-mix(in_oklab,var(--org-brand-muted)_55%,var(--org-brand-border))] [animation-duration:1.2s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[color-mix(in_oklab,var(--org-brand-muted)_55%,var(--org-brand-border))] [animation-delay:0.2s] [animation-duration:1.2s]" />
              <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[color-mix(in_oklab,var(--org-brand-muted)_55%,var(--org-brand-border))] [animation-delay:0.4s] [animation-duration:1.2s]" />
            </div>
          </div>
        ) : null}
        <div ref={bottomRef} />
      </div>

      {err ? (
        <p className="border-t border-[color-mix(in_oklab,var(--org-brand-border)_90%,transparent)] px-4 py-2 text-[13px] text-red-800 sm:px-5">
          {err}
        </p>
      ) : null}
      {note ? (
        <div className="border-t border-dashed border-[color-mix(in_oklab,var(--org-brand-border)_70%,transparent)] px-4 py-2 sm:px-5">
          <AssistantChatMarkdown content={note} variant="muted" />
        </div>
      ) : null}

      <div className="border-t border-[color-mix(in_oklab,var(--org-brand-border)_90%,transparent)] bg-[var(--org-brand-bg)] px-4 py-3 sm:px-5">
        <div className="flex items-end gap-2">
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder="Ask Scout about this document…"
            rows={1}
            disabled={busy}
            className="min-h-[40px] flex-1 resize-none rounded-[10px] border border-[color-mix(in_oklab,var(--org-brand-border)_90%,transparent)] bg-[color-mix(in_oklab,var(--org-brand-surface)_40%,var(--org-brand-bg))] px-3.5 py-2.5 text-[13.5px] text-[var(--org-brand-text)] outline-none transition placeholder:text-[var(--org-brand-muted)] focus:border-[var(--org-brand-primary)] focus:ring-[3px] focus:ring-[color-mix(in_oklab,var(--org-brand-primary)_15%,transparent)] disabled:opacity-60"
          />
          <button
            type="button"
            disabled={busy || !input.trim()}
            onClick={() => void send()}
            className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[10px] bg-[var(--org-brand-primary)] text-[var(--org-brand-on-primary)] transition hover:bg-[color-mix(in_oklab,var(--org-brand-primary)_88%,black)] disabled:opacity-40"
            aria-label="Send"
          >
            <svg viewBox="0 0 24 24" className="h-[15px] w-[15px] fill-current" aria-hidden>
              <path d="M2 21l21-9L2 3v7l15 2-15 2z" />
            </svg>
          </button>
        </div>
      </div>

    </div>
  );
}
