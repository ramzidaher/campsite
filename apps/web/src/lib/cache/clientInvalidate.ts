export type ClientCacheInvalidationScope =
  | 'org-members'
  | 'org-settings'
  | 'departments'
  | 'jobs'
  | 'applications'
  | 'recruitment'
  | 'interviews'
  | 'onboarding'
  | 'performance'
  | 'hr-records'
  | 'leave-attendance'
  | 'attendance-self'
  | 'profile-self';

export async function invalidateClientCaches({
  scopes,
  shellUserIds = [],
}: {
  scopes: ClientCacheInvalidationScope[];
  shellUserIds?: string[];
}): Promise<void> {
  const uniqueScopes = [...new Set(scopes)];
  const uniqueShellUserIds = [...new Set(shellUserIds.map((value) => value.trim()).filter(Boolean))];
  if (uniqueScopes.length === 0 && uniqueShellUserIds.length === 0) return;

  const res = await fetch('/api/cache/invalidate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      scopes: uniqueScopes,
      shell_user_ids: uniqueShellUserIds,
    }),
  });

  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? 'Cache invalidation request failed.');
  }
}
