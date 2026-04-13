export type ShellBadgeCounts = {
  broadcast_unread: number;
  broadcast_pending_approvals: number;
  recruitment_notifications: number;
  application_notifications: number;
  leave_notifications: number;
  hr_metric_notifications: number;
  calendar_event_notifications: number;
  pending_approvals: number;
  leave_pending_approval: number;
  recruitment_pending_review: number;
  performance_pending: number;
  onboarding_active: number;
  rota_pending_final: number;
  rota_pending_peer: number;
};

/** Parse RPC / merged shell bundle JSON into nav badge integers (shared server + client). */
export function parseShellBadgeCounts(data: unknown): ShellBadgeCounts {
  const b = data && typeof data === 'object' ? (data as Record<string, unknown>) : {};
  const n = (k: string): number => {
    const v = b[k];
    if (typeof v === 'number' && !Number.isNaN(v)) return Math.max(0, v);
    if (v !== null && v !== undefined) return Math.max(0, Number(v));
    return 0;
  };
  return {
    broadcast_unread: n('broadcast_unread'),
    broadcast_pending_approvals: n('broadcast_pending_approvals'),
    recruitment_notifications: n('recruitment_notifications'),
    application_notifications: n('application_notifications'),
    leave_notifications: n('leave_notifications'),
    hr_metric_notifications: n('hr_metric_notifications'),
    calendar_event_notifications: n('calendar_event_notifications'),
    pending_approvals: n('pending_approvals'),
    leave_pending_approval: n('leave_pending_approval'),
    recruitment_pending_review: n('recruitment_pending_review'),
    performance_pending: n('performance_pending'),
    onboarding_active: n('onboarding_active'),
    rota_pending_final: n('rota_pending_final'),
    rota_pending_peer: n('rota_pending_peer'),
  };
}
