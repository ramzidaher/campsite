export type OrgChartLiveStatus = 'on_shift' | 'pending_approvals' | 'active' | 'offline';

export type OrgChartLiveNode = {
  user_id: string;
  full_name: string;
  preferred_name: string | null;
  display_name: string;
  email: string | null;
  role: string;
  reports_to_user_id: string | null;
  reports_to_name: string | null;
  department_names: string[];
  job_title: string | null;
  member_status: string;
  last_seen_at: string | null;
  is_recently_seen: boolean;
  is_on_shift_now: boolean;
  has_pending_approvals: boolean;
  live_status: OrgChartLiveStatus;
};

export function getNodePulseClass(status: OrgChartLiveStatus): string {
  if (status === 'on_shift') return 'ring-green';
  if (status === 'pending_approvals') return 'ring-amber';
  return 'ring-muted';
}
