'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { AssistantChatMarkdown } from '@/components/resources/AssistantChatMarkdown';
import { userFacingScoutError } from '@campsite/types';
import { ArrowRight, ChevronDown, Compass } from 'lucide-react';

export type LibraryChatMessage = { role: 'user' | 'assistant'; content: string };

const STARTER_CHIPS = [
  'How many documents do we have about holidays or leave?',
  'What policy files are in the library?',
  'Which document should I read for health and safety?',
  'List anything that mentions onboarding or induction.',
];

export type ResourceLibraryAssistantProps = {
  variant?: 'default' | 'topBar';
  /** Prefill the composer (e.g. `?q=` on `/resources`). */
  initialPrompt?: string;
};

export function ResourceLibraryAssistant({
  variant = 'default',
  initialPrompt,
}: ResourceLibraryAssistantProps) {
  const [messages, setMessages] = useState<LibraryChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [chipsVisible, setChipsVisible] = useState(true);
  const [panelOpen, setPanelOpen] = useState(variant === 'default');
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (typeof initialPrompt !== 'string' || !initialPrompt.trim()) return;
    setInput(initialPrompt.trim());
    if (variant === 'topBar') {
      setPanelOpen(true);
    }
  }, [initialPrompt, variant]);

  useEffect(() => {
    if (variant !== 'topBar') return;
    if (messages.length > 0 || busy || err) {
      setPanelOpen(true);
    }
  }, [variant, messages.length, busy, err]);

  const runSend = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || busy) return;
      setErr(null);
      setNote(null);
      setChipsVisible(false);
      if (variant === 'topBar') setPanelOpen(true);
      const nextUser: LibraryChatMessage = { role: 'user', content: trimmed };
      const previous = messages;
      const history = [...previous, nextUser];
      setMessages(history);
      setInput('');
      setBusy(true);
      try {
        const res = await fetch('/api/resources/library-chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
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
    [busy, messages, variant],
  );

  const send = useCallback(() => {
    void runSend(input);
  }, [input, runSend]);

  const showIntro = messages.length === 0;

  const threadBody = (
    <>
      {showIntro ? (
        <div className="flex flex-col gap-1 self-start">
          <div className="max-w-[85%] rounded-[14px] rounded-bl-[4px] border border-[color-mix(in_oklab,var(--org-brand-border)_75%,transparent)] bg-[var(--org-brand-bg)] px-3.5 py-2.5 text-[13.5px] leading-[1.55] text-[var(--org-brand-text)]">
            Ask about your whole library  titles, descriptions, folders, and small text files. For deep questions
            inside a PDF or Word file, open that document and use Scout there.
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
              className="rounded-full border border-[color-mix(in_oklab,var(--org-brand-border)_85%,transparent)] bg-[var(--org-brand-bg)] px-3 py-1.5 text-left text-[12px] text-[var(--org-brand-text)] transition hover:border-[var(--org-brand-primary)] hover:bg-[color-mix(in_oklab,var(--org-brand-primary)_10%,var(--org-brand-bg))] disabled:opacity-50"
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
                ? 'rounded-br-[4px] whitespace-pre-wrap text-[var(--org-brand-on-primary)]'
                : 'rounded-bl-[4px] border border-[color-mix(in_oklab,var(--org-brand-border)_75%,transparent)] bg-[var(--org-brand-bg)] text-[var(--org-brand-text)]'
            }`}
            style={m.role === 'user' ? { background: 'var(--org-brand-primary)' } : undefined}
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
          <div className="flex items-center gap-1.5 rounded-[14px] rounded-bl-[4px] border border-[color-mix(in_oklab,var(--org-brand-border)_75%,transparent)] bg-[var(--org-brand-bg)] px-3.5 py-2.5">
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[color-mix(in_oklab,var(--org-brand-muted)_55%,var(--org-brand-border))] [animation-duration:1.2s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[color-mix(in_oklab,var(--org-brand-muted)_55%,var(--org-brand-border))] [animation-delay:0.2s] [animation-duration:1.2s]" />
            <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-[color-mix(in_oklab,var(--org-brand-muted)_55%,var(--org-brand-border))] [animation-delay:0.4s] [animation-duration:1.2s]" />
          </div>
        </div>
      ) : null}
      <div ref={bottomRef} />
    </>
  );

  if (variant === 'topBar') {
    return (
      <div className="font-sans mb-8">
        <form
          className="relative"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <span className="pointer-events-none absolute left-4 top-1/2 z-[1] -translate-y-1/2 text-[var(--org-brand-muted)]">
            <ScoutCompassIcon className="h-[18px] w-[18px]" />
          </span>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder="Scout  ask questions across your library"
            disabled={busy}
            autoComplete="off"
            className="h-12 w-full rounded-full border border-[color-mix(in_oklab,var(--org-brand-border)_90%,transparent)] bg-[var(--org-brand-bg)] py-2 pl-11 pr-[5.25rem] text-[15px] text-[var(--org-brand-text)] outline-none placeholder:text-[color-mix(in_oklab,var(--org-brand-muted)_72%,transparent)] shadow-[inset_0_1px_0_color-mix(in_oklab,var(--org-brand-border)_25%,transparent)] focus:border-[color-mix(in_oklab,var(--org-brand-text)_35%,var(--org-brand-border))] focus:ring-[3px] focus:ring-[color-mix(in_oklab,var(--org-brand-text)_12%,transparent)] disabled:opacity-60"
            aria-label="Scout  ask questions across your library"
          />
          <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-0.5">
            <button
              type="button"
              onClick={() => setPanelOpen((o) => !o)}
              className="flex h-9 w-9 items-center justify-center rounded-full text-[var(--org-brand-muted)] transition hover:bg-[color-mix(in_oklab,var(--org-brand-border)_40%,var(--org-brand-bg))] hover:text-[var(--org-brand-text)]"
              aria-expanded={panelOpen}
              aria-controls="resource-scout-thread"
              aria-label={panelOpen ? 'Hide conversation' : 'Show conversation'}
            >
              <ChevronDown
                className={`h-4 w-4 transition-transform duration-200 ${panelOpen ? 'rotate-180' : ''}`}
                aria-hidden
              />
            </button>
            <button
              type="submit"
              disabled={busy || !input.trim()}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--org-brand-text)] text-[var(--org-brand-bg)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-35"
              aria-label="Send to Scout"
            >
              <ArrowRight className="h-4 w-4" strokeWidth={2.25} aria-hidden />
            </button>
          </div>
        </form>

        {panelOpen ? (
          <div
            id="resource-scout-thread"
            className="mt-3 flex max-h-[min(52vh,440px)] min-h-[200px] flex-col gap-3 overflow-y-auto rounded-2xl border border-[color-mix(in_oklab,var(--org-brand-border)_88%,transparent)] bg-[color-mix(in_oklab,var(--org-brand-surface)_55%,var(--org-brand-bg))] px-4 py-4 sm:px-5"
          >
            {threadBody}
          </div>
        ) : null}

        {err ? (
          <p className="mt-2 rounded-xl border border-red-100 bg-red-50/90 px-3 py-2 text-[13px] text-red-800">{err}</p>
        ) : null}
        {note ? (
          <div className="mt-2 rounded-xl border border-dashed border-[color-mix(in_oklab,var(--org-brand-border)_55%,transparent)] bg-[var(--org-brand-bg)] px-3 py-2">
            <AssistantChatMarkdown content={note} variant="muted" />
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="font-sans overflow-hidden rounded-2xl border border-[color-mix(in_oklab,var(--org-brand-border)_88%,transparent)] bg-[var(--org-brand-bg)] shadow-[0_1px_0_color-mix(in_oklab,var(--org-brand-border)_35%,transparent)]">
      <div className="flex items-center gap-2.5 border-b border-[color-mix(in_oklab,var(--org-brand-border)_70%,transparent)] px-4 py-4 sm:px-5">
        <div
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] text-[var(--org-brand-on-primary)]"
          style={{ background: 'var(--org-brand-primary)' }}
        >
          <ScoutCompassIcon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-[var(--org-brand-text)]">Scout · Resource library</div>
          <div className="flex items-center gap-1 text-[11px] font-medium text-[var(--org-brand-primary)]">
            <span
              className="inline-block h-[5px] w-[5px] rounded-full bg-[var(--org-brand-primary)]"
              aria-hidden
            />
            Answers from your org&apos;s files
          </div>
        </div>
      </div>

      <div className="flex max-h-[min(52vh,440px)] min-h-[260px] flex-col gap-3 overflow-y-auto bg-[color-mix(in_oklab,var(--org-brand-surface)_55%,var(--org-brand-bg))] px-4 py-4 sm:px-5">
        {threadBody}
      </div>

      {err ? (
        <p className="border-t border-[color-mix(in_oklab,var(--org-brand-border)_70%,transparent)] px-4 py-2 text-[13px] text-red-800 sm:px-5">
          {err}
        </p>
      ) : null}
      {note ? (
        <div className="border-t border-dashed border-[color-mix(in_oklab,var(--org-brand-border)_55%,transparent)] px-4 py-2 sm:px-5">
          <AssistantChatMarkdown content={note} variant="muted" />
        </div>
      ) : null}

      <div className="border-t border-[color-mix(in_oklab,var(--org-brand-border)_70%,transparent)] bg-[var(--org-brand-bg)] px-4 py-3 sm:px-5">
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
            placeholder="Ask about your resource library…"
            rows={1}
            disabled={busy}
            className="min-h-[40px] flex-1 resize-none rounded-[10px] border border-[color-mix(in_oklab,var(--org-brand-border)_90%,transparent)] bg-[color-mix(in_oklab,var(--org-brand-surface)_40%,var(--org-brand-bg))] px-3.5 py-2.5 text-[13.5px] text-[var(--org-brand-text)] outline-none transition placeholder:text-[var(--org-brand-muted)] focus:border-[var(--org-brand-primary)] focus:ring-[3px] focus:ring-[color-mix(in_oklab,var(--org-brand-primary)_15%,transparent)] disabled:opacity-60"
          />
          <button
            type="button"
            disabled={busy || !input.trim()}
            onClick={() => void send()}
            className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[10px] text-[var(--org-brand-on-primary)] transition disabled:opacity-40"
            style={{ background: 'var(--org-brand-primary)' }}
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

function ScoutCompassIcon({ className }: { className?: string }) {
  return <Compass className={className} strokeWidth={2} aria-hidden />;
}
