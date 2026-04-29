'use client';

import { useCallback, useRef, useState } from 'react';
import { emitGlobalActionFeedback } from '@/lib/ui/globalActionFeedback';

export type TopPageFeedback = { type: 'ok' | 'err'; text: string } | null;

export function useTopPageFeedback() {
  const [feedback, setFeedbackState] = useState<TopPageFeedback>(null);
  const feedbackRef = useRef<HTMLDivElement | null>(null);

  const setFeedback = useCallback((next: TopPageFeedback) => {
    setFeedbackState(next);
    if (!next) return;
    emitGlobalActionFeedback({
      tone: next.type,
      message: next.text,
    });
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      window.requestAnimationFrame(() => {
        feedbackRef.current?.focus();
      });
    }
  }, []);

  return { feedback, setFeedback, feedbackRef };
}
