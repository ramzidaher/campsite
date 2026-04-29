'use client';

export type GlobalActionFeedbackTone = 'ok' | 'err';

export type GlobalActionFeedbackDetail = {
  tone: GlobalActionFeedbackTone;
  message: string;
};

export const GLOBAL_ACTION_FEEDBACK_EVENT = 'campsite:action-feedback';

export function emitGlobalActionFeedback(detail: GlobalActionFeedbackDetail) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<GlobalActionFeedbackDetail>(GLOBAL_ACTION_FEEDBACK_EVENT, {
      detail,
    }),
  );
}
