'use client';

import {
  emitGlobalActionFeedback,
  GLOBAL_ACTION_FEEDBACK_EVENT,
  type GlobalActionFeedbackDetail,
} from '@/lib/ui/globalActionFeedback';
import { useEffect, useRef, useState } from 'react';

type FeedbackState = { tone: 'ok' | 'err'; message: string } | null;

function normalizeMessage(message: string): string {
  return message.replace(/\s+/g, ' ').trim();
}

function scrollWorkspaceToTop() {
  const main = document.getElementById('main-content');
  if (main) {
    main.scrollTo({ top: 0, behavior: 'smooth' });
    return;
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

export function GlobalActionFeedbackBridge() {
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastInteractionAtRef = useRef<number>(0);

  useEffect(() => {
    const onFeedback = (event: Event) => {
      const custom = event as CustomEvent<GlobalActionFeedbackDetail>;
      const tone = custom.detail?.tone;
      const rawMessage = custom.detail?.message;
      const message = normalizeMessage(String(rawMessage ?? ''));
      if (!message || (tone !== 'ok' && tone !== 'err')) return;
      setFeedback({ tone, message });
      scrollWorkspaceToTop();
      if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
      clearTimerRef.current = setTimeout(() => setFeedback(null), 5000);
    };

    const markInteraction = (event: Event) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      const actionable = target.closest(
        'button, a, [role="button"], input[type="submit"], input[type="button"]',
      );
      if (!actionable) return;
      lastInteractionAtRef.current = Date.now();
    };

    const main = document.getElementById('main-content');
    const observeTarget = main ?? document.body;
    const observer = observeTarget
      ? new MutationObserver((mutations) => {
          const interactionFresh = Date.now() - lastInteractionAtRef.current < 10_000;
          if (!interactionFresh) return;
          for (const mutation of mutations) {
            for (const node of Array.from(mutation.addedNodes)) {
              if (!(node instanceof HTMLElement)) continue;
              if (node.closest('[data-global-feedback-source="true"]')) continue;
              const roleElement =
                node.matches?.('[role="alert"], [role="status"]')
                  ? node
                  : (node.querySelector?.('[role="alert"], [role="status"]') as HTMLElement | null);
              if (!roleElement) continue;
              const msg = normalizeMessage(roleElement.textContent ?? '');
              if (!msg) continue;
              emitGlobalActionFeedback({
                tone: roleElement.getAttribute('role') === 'alert' ? 'err' : 'ok',
                message: msg,
              });
              return;
            }
          }
        })
      : null;

    const originalAlert = window.alert.bind(window);
    window.alert = (message?: unknown) => {
      emitGlobalActionFeedback({
        tone: 'err',
        message: normalizeMessage(String(message ?? 'Action failed.')),
      });
    };

    window.addEventListener(GLOBAL_ACTION_FEEDBACK_EVENT, onFeedback as EventListener);
    window.addEventListener('click', markInteraction, true);
    window.addEventListener('keydown', markInteraction, true);
    if (observer && observeTarget) observer.observe(observeTarget, { childList: true, subtree: true });

    return () => {
      window.alert = originalAlert;
      window.removeEventListener(GLOBAL_ACTION_FEEDBACK_EVENT, onFeedback as EventListener);
      window.removeEventListener('click', markInteraction, true);
      window.removeEventListener('keydown', markInteraction, true);
      observer?.disconnect();
      if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
    };
  }, []);

  if (!feedback) return null;

  return (
    <div data-global-feedback-source="true" className="px-4 py-3 sm:px-6">
      <div
        role={feedback.tone === 'err' ? 'alert' : 'status'}
        className={[
          'rounded-xl border px-4 py-3 text-[13px]',
          feedback.tone === 'err'
            ? 'border-red-200 bg-red-50 text-red-900'
            : 'border-emerald-200 bg-emerald-50 text-emerald-950',
        ].join(' ')}
      >
        {feedback.message}
      </div>
    </div>
  );
}
