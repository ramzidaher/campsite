import { EmployeePerformanceIndexClient } from '@/components/performance/EmployeePerformanceIndexClient';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export default async function EmployeePerformancePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id, status')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile?.org_id || profile.status !== 'active') redirect('/broadcasts');
  const orgId = profile.org_id as string;

  // Employee sees reviews where they're the reviewee
  // Reviewer (manager) sees reviews where they're the reviewer
  const { data: reviews } = await supabase
    .from('performance_reviews')
    .select('id, cycle_id, reviewee_id, reviewer_id, status, overall_rating, self_submitted_at, manager_submitted_at, completed_at')
    .eq('org_id', orgId)
    .or(`reviewee_id.eq.${user.id},reviewer_id.eq.${user.id}`)
    .order('created_at', { ascending: false });

  if (!reviews?.length) redirect('/broadcasts');

  // get cycle names
  const cycleIds = [...new Set((reviews ?? []).map((r) => r.cycle_id as string))];
  const { data: cycles } = await supabase
    .from('review_cycles')
    .select('id, name, type, period_start, period_end, status')
    .in('id', cycleIds);

  const cycleMap: Record<string, { name: string; type: string; period_start: string; period_end: string; status: string }> = {};
  for (const c of cycles ?? []) cycleMap[c.id as string] = { name: c.name as string, type: c.type as string, period_start: c.period_start as string, period_end: c.period_end as string, status: c.status as string };

  // get reviewee names (for manager view)
  const revieweeIds = [...new Set((reviews ?? []).filter((r) => r.reviewer_id === user.id).map((r) => r.reviewee_id as string))];
  const revieweeNames: Record<string, string> = {};
  if (revieweeIds.length) {
    const { data: profs } = await supabase.from('profiles').select('id, full_name').in('id', revieweeIds);
    for (const p of profs ?? []) revieweeNames[p.id as string] = p.full_name as string;
  }

  return (
    <EmployeePerformanceIndexClient
      userId={user.id}
      reviews={(reviews ?? []).map((r) => ({
        id: r.id as string,
        cycle: cycleMap[r.cycle_id as string] ?? null,
        is_reviewee: r.reviewee_id === user.id,
        reviewee_name: revieweeNames[r.reviewee_id as string] ?? null,
        status: r.status as string,
        overall_rating: (r.overall_rating as string | null) ?? null,
        self_submitted_at: (r.self_submitted_at as string | null) ?? null,
        manager_submitted_at: (r.manager_submitted_at as string | null) ?? null,
        completed_at: (r.completed_at as string | null) ?? null,
      }))}
    />
  );
}
