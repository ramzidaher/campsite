export type FeedRow = {
  id: string;
  title: string;
  body: string;
  sent_at: string | null;
  dept_id: string;
  cat_id: string;
  created_by: string;
  is_mandatory?: boolean;
  is_pinned?: boolean;
  is_org_wide?: boolean;
  departments: { name: string } | null;
  dept_categories: { name: string } | null;
  profiles: { full_name: string } | null;
  read?: boolean;
};

export type RawBroadcast = {
  id: string;
  title: string;
  body: string;
  sent_at: string | null;
  dept_id: string;
  cat_id: string;
  created_by: string;
  is_mandatory?: boolean | null;
  is_pinned?: boolean | null;
  is_org_wide?: boolean | null;
};
