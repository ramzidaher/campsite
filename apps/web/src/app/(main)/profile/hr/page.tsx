import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

function labelContract(value: string | null) {
  if (value === 'full_time') return 'Full-time';
  if (value === 'part_time') return 'Part-time';
  if (value === 'contractor') return 'Contractor';
  if (value === 'zero_hours') return 'Zero hours';
  return '—';
}

function labelLocation(value: string | null) {
  if (value === 'office') return 'Office';
  if (value === 'remote') return 'Remote';
  if (value === 'hybrid') return 'Hybrid';
  return '—';
}

export default async function MyHrRecordPage() {
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
  const { data: canViewOwn } = await supabase.rpc('has_permission', {
    p_user_id: user.id,
    p_org_id: orgId,
    p_permission_key: 'hr.view_own',
    p_context: {},
  });
  if (!canViewOwn) redirect('/dashboard');

  const [fileRows, allowanceRow, annualApprovedRes, bradfordRes] = await Promise.all([
    supabase.rpc('hr_employee_file', { p_user_id: user.id }),
    supabase
      .from('leave_allowances')
      .select('annual_entitlement_days, toil_balance_days')
      .eq('org_id', orgId)
      .eq('user_id', user.id)
      .eq('leave_year', String(new Date().getFullYear()))
      .maybeSingle(),
    supabase
      .from('leave_requests')
      .select('start_date, end_date')
      .eq('org_id', orgId)
      .eq('requester_id', user.id)
      .eq('kind', 'annual')
      .eq('status', 'approved'),
    supabase.rpc('bradford_factor_for_user', {
      p_user_id: user.id,
      p_on: new Date().toISOString().slice(0, 10),
    }),
  ]);

  const fileRow = (fileRows.data ?? [])[0];
  if (!fileRow) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-8 sm:px-7">
        <h1 className="font-authSerif text-[26px] leading-tight tracking-[-0.03em] text-[#121212]">My HR record</h1>
        <p className="mt-2 text-[13px] text-[#6b6b6b]">No HR record is available yet. Contact your HR team.</p>
      </div>
    );
  }

  const annualUsed = (annualApprovedRes.data ?? []).reduce((sum, row) => {
    const start = new Date(String(row.start_date));
    const end = new Date(String(row.end_date));
    const diff = Math.floor((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    return sum + Math.max(0, diff);
  }, 0);

  const b0 = Array.isArray(bradfordRes.data) ? bradfordRes.data[0] : null;
  const bradfordScore =
    b0 && typeof b0 === 'object' && 'bradford_score' in b0
      ? Number((b0 as { bradford_score: number }).bradford_score)
      : 0;

  return (
    <div className="mx-auto max-w-4xl px-5 py-8 sm:px-7">
      <h1 className="font-authSerif text-[26px] leading-tight tracking-[-0.03em] text-[#121212]">My HR record</h1>
      <p className="mt-1 text-[13px] text-[#6b6b6b]">Your employment details and leave summary.</p>

      <section className="mt-5 rounded-xl border border-[#e8e8e8] bg-white p-5">
        <h2 className="text-[14px] font-semibold text-[#121212]">Employment details</h2>
        <dl className="mt-3 grid gap-3 sm:grid-cols-2 text-[13px]">
          <div><dt className="text-[#9b9b9b]">Job title</dt><dd className="text-[#121212]">{String(fileRow.job_title ?? '—')}</dd></div>
          <div><dt className="text-[#9b9b9b]">Grade</dt><dd className="text-[#121212]">{String(fileRow.grade_level ?? '—')}</dd></div>
          <div><dt className="text-[#9b9b9b]">Contract</dt><dd className="text-[#121212]">{labelContract((fileRow.contract_type as string | null) ?? null)}</dd></div>
          <div><dt className="text-[#9b9b9b]">FTE</dt><dd className="text-[#121212]">{fileRow.fte ? `${Math.round(Number(fileRow.fte) * 100)}%` : '—'}</dd></div>
          <div><dt className="text-[#9b9b9b]">Work location</dt><dd className="text-[#121212]">{labelLocation((fileRow.work_location as string | null) ?? null)}</dd></div>
          <div><dt className="text-[#9b9b9b]">Employment start</dt><dd className="text-[#121212]">{String(fileRow.employment_start_date ?? '—')}</dd></div>
          <div><dt className="text-[#9b9b9b]">Probation end</dt><dd className="text-[#121212]">{String(fileRow.probation_end_date ?? '—')}</dd></div>
          <div><dt className="text-[#9b9b9b]">Notice period (weeks)</dt><dd className="text-[#121212]">{String(fileRow.notice_period_weeks ?? '—')}</dd></div>
          <div><dt className="text-[#9b9b9b]">Salary band</dt><dd className="text-[#121212]">{String(fileRow.salary_band ?? '—')}</dd></div>
        </dl>
      </section>

      <section className="mt-5 rounded-xl border border-[#e8e8e8] bg-white p-5">
        <h2 className="text-[14px] font-semibold text-[#121212]">Leave summary</h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 text-[13px]">
          <div className="rounded-lg bg-[#faf9f6] p-3"><p className="text-[#9b9b9b]">Annual entitlement</p><p className="mt-1 text-[18px] font-semibold text-[#121212]">{Number(allowanceRow.data?.annual_entitlement_days ?? 0)} days</p></div>
          <div className="rounded-lg bg-[#faf9f6] p-3"><p className="text-[#9b9b9b]">Annual leave used</p><p className="mt-1 text-[18px] font-semibold text-[#121212]">{annualUsed} days</p></div>
          <div className="rounded-lg bg-[#faf9f6] p-3"><p className="text-[#9b9b9b]">TOIL balance</p><p className="mt-1 text-[18px] font-semibold text-[#121212]">{Number(allowanceRow.data?.toil_balance_days ?? 0)} days</p></div>
          <div className="rounded-lg bg-[#faf9f6] p-3"><p className="text-[#9b9b9b]">Bradford score</p><p className="mt-1 text-[18px] font-semibold text-[#121212]">{bradfordScore}</p></div>
        </div>
      </section>
    </div>
  );
}
