export type FeedRow = {
  id: string;
  title: string;
  body: string;
  sent_at: string | null;
  dept_id: string;
  channel_id: string | null;
  team_id?: string | null;
  created_by: string;
  is_mandatory?: boolean;
  is_pinned?: boolean;
  is_org_wide?: boolean;
  departments: { name: string } | null;
  broadcast_channels: { name: string } | null;
  department_teams?: { name: string } | null;
  collab_departments?: { id: string; name: string }[];
  profiles: { full_name: string } | null;
  read?: boolean;
};

export type RawBroadcast = {
  id: string;
  title: string;
  body: string;
  sent_at: string | null;
  dept_id: string;
  channel_id: string | null;
  team_id?: string | null;
  created_by: string;
  is_mandatory?: boolean | null;
  is_pinned?: boolean | null;
  is_org_wide?: boolean | null;
};
