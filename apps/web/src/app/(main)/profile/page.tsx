import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/supabase/getAuthUser';

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

const sectionLink =
  'rounded-full border border-[#e4e4e4] bg-[#faf9f6] px-3 py-1.5 text-[12px] font-medium text-[#121212] hover:bg-[#f0efe9]';

export default async function MyProfilePage() {
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id, status, full_name, email, avatar_url, role, reports_to_user_id')
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

  const { data: canPerf } = await supabase.rpc('has_permission', {
    p_user_id: user.id,
    p_org_id: orgId,
    p_permission_key: 'performance.view_own',
    p_context: {},
  });

  const [
    fileRows,
    allowanceRow,
    annualApprovedRes,
    bradfordRes,
    udRes,
    directReportsRes,
    onboardingCountRes,
  ] = await Promise.all([
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
    supabase
      .from('user_departments')
      .select('departments(name)')
      .eq('user_id', user.id),
    supabase
      .from('profiles')
      .select('id, full_name, email')
      .eq('org_id', orgId)
      .eq('status', 'active')
      .eq('reports_to_user_id', user.id)
      .order('full_name'),
    supabase
      .from('onboarding_runs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('status', 'active'),
  ]);

  const fileRow = (fileRows.data ?? [])[0];
  const deptNames: string[] = [];
  for (const row of udRes.data ?? []) {
    const raw = row.departments as { name: string } | { name: string }[] | null;
    const arr = Array.isArray(raw) ? raw : raw ? [raw] : [];
    for (const d of arr) {
      if (d?.name) deptNames.push(d.name);
    }
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

  const emailDisplay = (profile.email as string | null)?.trim() || user.email || '—';
  const roleLabel = (profile.role as string | null) ?? '—';
  const onboardingActive = (onboardingCountRes.count ?? 0) > 0;

  return (
    <div className="mx-auto max-w-4xl px-5 py-8 sm:px-7">
      <header className="border-b border-[#e8e8e8] pb-5">
        <h1 className="font-authSerif text-[26px] leading-tight tracking-[-0.03em] text-[#121212]">My Profile</h1>
        <p className="mt-1 text-[13px] text-[#6b6b6b]">
          Your contact details, job information, leave, and links to other people tools — same data your HR team
          maintains for you.
        </p>
        <nav className="mt-4 flex flex-wrap gap-2" aria-label="Profile sections">
          <a className={sectionLink} href="#personal">
            Personal
          </a>
          <a className={sectionLink} href="#job">
            Job
          </a>
          <a className={sectionLink} href="#time-off">
            Time off
          </a>
          <a className={sectionLink} href="#reporting">
            Reporting line
          </a>
          <a className={sectionLink} href="#performance">
            Performance
          </a>
          <a className={sectionLink} href="#onboarding">
            Onboarding
          </a>
          <a className={sectionLink} href="#other">
            Training &amp; other
          </a>
        </nav>
      </header>

      <section id="personal" className="scroll-mt-24 pt-8">
        <h2 className="text-[15px] font-semibold text-[#121212]">Personal</h2>
        <div className="mt-3 rounded-xl border border-[#e8e8e8] bg-white p-5">
          <dl className="grid gap-3 sm:grid-cols-2 text-[13px]">
            <div>
              <dt className="text-[#9b9b9b]">Name</dt>
              <dd className="text-[#121212]">{String(profile.full_name ?? '—')}</dd>
            </div>
            <div>
              <dt className="text-[#9b9b9b]">Work email</dt>
              <dd className="text-[#121212]">{emailDisplay}</dd>
            </div>
            <div>
              <dt className="text-[#9b9b9b]">Role</dt>
              <dd className="text-[#121212]">{roleLabel}</dd>
            </div>
            <div>
              <dt className="text-[#9b9b9b]">Department</dt>
              <dd className="text-[#121212]">{deptNames.length ? deptNames.join(', ') : '—'}</dd>
            </div>
            <div>
              <dt className="text-[#9b9b9b]">Account ID</dt>
              <dd className="font-mono text-[12px] text-[#121212]">{user.id}</dd>
            </div>
            <div>
              <dt className="text-[#9b9b9b]">Phone</dt>
              <dd className="text-[#121212]">—</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-[#9b9b9b]">Emergency contact</dt>
              <dd className="text-[#6b6b6b]">
                Not stored in CampSite yet. Ask your HR team if they keep this elsewhere.
              </dd>
            </div>
          </dl>
        </div>
      </section>

      <section id="job" className="scroll-mt-24 pt-8">
        <h2 className="text-[15px] font-semibold text-[#121212]">Job</h2>
        {!fileRow ? (
          <p className="mt-3 rounded-xl border border-[#e8e8e8] bg-white p-5 text-[13px] text-[#6b6b6b]">
            No HR job record yet. Your HR administrator can add this under Employee records.
          </p>
        ) : (
          <div className="mt-3 rounded-xl border border-[#e8e8e8] bg-white p-5">
            <dl className="grid gap-3 sm:grid-cols-2 text-[13px]">
              <div>
                <dt className="text-[#9b9b9b]">Job title</dt>
                <dd className="text-[#121212]">{String(fileRow.job_title ?? '—')}</dd>
              </div>
              <div>
                <dt className="text-[#9b9b9b]">Grade</dt>
                <dd className="text-[#121212]">{String(fileRow.grade_level ?? '—')}</dd>
              </div>
              <div>
                <dt className="text-[#9b9b9b]">Pay grade</dt>
                <dd className="text-[#121212]">{String((fileRow as { pay_grade?: string }).pay_grade ?? '—')}</dd>
              </div>
              <div>
                <dt className="text-[#9b9b9b]">Position type</dt>
                <dd className="text-[#121212]">{String((fileRow as { position_type?: string }).position_type ?? '—')}</dd>
              </div>
              <div>
                <dt className="text-[#9b9b9b]">Employment basis</dt>
                <dd className="text-[#121212]">{String((fileRow as { employment_basis?: string }).employment_basis ?? '—')}</dd>
              </div>
              <div>
                <dt className="text-[#9b9b9b]">Contract</dt>
                <dd className="text-[#121212]">{labelContract((fileRow.contract_type as string | null) ?? null)}</dd>
              </div>
              <div>
                <dt className="text-[#9b9b9b]">FTE</dt>
                <dd className="text-[#121212]">{fileRow.fte ? `${Math.round(Number(fileRow.fte) * 100)}%` : '—'}</dd>
              </div>
              <div>
                <dt className="text-[#9b9b9b]">Weekly hours</dt>
                <dd className="text-[#121212]">{String((fileRow as { weekly_hours?: number }).weekly_hours ?? '—')}</dd>
              </div>
              <div>
                <dt className="text-[#9b9b9b]">Work location</dt>
                <dd className="text-[#121212]">{labelLocation((fileRow.work_location as string | null) ?? null)}</dd>
              </div>
              <div>
                <dt className="text-[#9b9b9b]">Employment start</dt>
                <dd className="text-[#121212]">{String(fileRow.employment_start_date ?? '—')}</dd>
              </div>
              <div>
                <dt className="text-[#9b9b9b]">Length of service</dt>
                <dd className="text-[#121212]">
                  {typeof (fileRow as { length_of_service_years?: number }).length_of_service_years === 'number' &&
                  typeof (fileRow as { length_of_service_months?: number }).length_of_service_months === 'number'
                    ? `${(fileRow as { length_of_service_years: number }).length_of_service_years}y ${(fileRow as { length_of_service_months: number }).length_of_service_months}m`
                    : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-[#9b9b9b]">Dept. start</dt>
                <dd className="text-[#121212]">{String((fileRow as { department_start_date?: string }).department_start_date ?? '—')}</dd>
              </div>
              <div>
                <dt className="text-[#9b9b9b]">Continuous employment</dt>
                <dd className="text-[#121212]">{String((fileRow as { continuous_employment_start_date?: string }).continuous_employment_start_date ?? '—')}</dd>
              </div>
              <div>
                <dt className="text-[#9b9b9b]">Probation end</dt>
                <dd className="text-[#121212]">{String(fileRow.probation_end_date ?? '—')}</dd>
              </div>
              <div>
                <dt className="text-[#9b9b9b]">Notice period (weeks)</dt>
                <dd className="text-[#121212]">{String(fileRow.notice_period_weeks ?? '—')}</dd>
              </div>
              <div>
                <dt className="text-[#9b9b9b]">Salary band</dt>
                <dd className="text-[#121212]">{String(fileRow.salary_band ?? '—')}</dd>
              </div>
              <div>
                <dt className="text-[#9b9b9b]">Budget</dt>
                <dd className="text-[#121212]">
                  {(fileRow as { budget_amount?: number }).budget_amount != null
                    ? `${(fileRow as { budget_amount: number }).budget_amount} ${String((fileRow as { budget_currency?: string }).budget_currency ?? '').trim()}`.trim()
                    : '—'}
                </dd>
              </div>
            </dl>
            {(() => {
              const cf = (fileRow as { custom_fields?: Record<string, unknown> }).custom_fields;
              if (!cf || typeof cf !== 'object' || Array.isArray(cf) || Object.keys(cf).length === 0) return null;
              return (
                <div className="mt-4 rounded-lg border border-[#ececec] bg-[#faf9f6] p-3 text-[13px]">
                  <p className="text-[12px] font-semibold text-[#121212]">Other job details</p>
                  <dl className="mt-2 grid gap-2 sm:grid-cols-2">
                    {Object.entries(cf).map(([k, v]) => (
                      <div key={k}>
                        <dt className="text-[11px] text-[#9b9b9b]">{k}</dt>
                        <dd className="text-[#121212]">{v == null ? '—' : String(v)}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              );
            })()}
          </div>
        )}
      </section>

      <section id="time-off" className="scroll-mt-24 pt-8">
        <h2 className="text-[15px] font-semibold text-[#121212]">Time off</h2>
        <div className="mt-3 rounded-xl border border-[#e8e8e8] bg-white p-5">
          <div className="grid gap-3 sm:grid-cols-2 text-[13px]">
            <div className="rounded-lg bg-[#faf9f6] p-3">
              <p className="text-[#9b9b9b]">Annual entitlement</p>
              <p className="mt-1 text-[18px] font-semibold text-[#121212]">
                {Number(allowanceRow.data?.annual_entitlement_days ?? 0)} days
              </p>
            </div>
            <div className="rounded-lg bg-[#faf9f6] p-3">
              <p className="text-[#9b9b9b]">Annual leave used</p>
              <p className="mt-1 text-[18px] font-semibold text-[#121212]">{annualUsed} days</p>
            </div>
            <div className="rounded-lg bg-[#faf9f6] p-3">
              <p className="text-[#9b9b9b]">TOIL balance</p>
              <p className="mt-1 text-[18px] font-semibold text-[#121212]">
                {Number(allowanceRow.data?.toil_balance_days ?? 0)} days
              </p>
            </div>
            <div className="rounded-lg bg-[#faf9f6] p-3">
              <p className="text-[#9b9b9b]">Bradford score</p>
              <p className="mt-1 text-[18px] font-semibold text-[#121212]">{bradfordScore}</p>
            </div>
          </div>
          <p className="mt-4 text-[13px]">
            <Link href="/leave" className="font-medium text-[#121212] underline underline-offset-2">
              Open leave
            </Link>{' '}
            for requests, balances, and history.
          </p>
        </div>
      </section>

      <section id="reporting" className="scroll-mt-24 pt-8">
        <h2 className="text-[15px] font-semibold text-[#121212]">Reporting line</h2>
        <div className="mt-3 rounded-xl border border-[#e8e8e8] bg-white p-5 text-[13px]">
          <div>
            <p className="text-[#9b9b9b]">Manager</p>
            <p className="mt-1 text-[#121212]">
              {fileRow && (fileRow as { reports_to_name?: string }).reports_to_name
                ? String((fileRow as { reports_to_name: string }).reports_to_name)
                : '—'}
            </p>
          </div>
          <div className="mt-4">
            <p className="text-[#9b9b9b]">Direct reports</p>
            <div className="mt-2">
              {(directReportsRes.data ?? []).length === 0 ? (
                <span className="text-[#6b6b6b]">None</span>
              ) : (
                <ul className="space-y-1">
                  {(directReportsRes.data ?? []).map((r) => (
                    <li key={r.id as string} className="text-[#121212]">
                      {String(r.full_name)}
                      {r.email ? (
                        <span className="text-[#9b9b9b]"> · {String(r.email)}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <p className="mt-4 text-[13px]">
            <Link href="/hr/org-chart" className="font-medium text-[#121212] underline underline-offset-2">
              Org chart
            </Link>{' '}
            (if you have access)
          </p>
        </div>
      </section>

      <section id="performance" className="scroll-mt-24 pt-8">
        <h2 className="text-[15px] font-semibold text-[#121212]">Performance</h2>
        <div className="mt-3 rounded-xl border border-[#e8e8e8] bg-white p-5 text-[13px] text-[#121212]">
          {canPerf ? (
            <p>
              <Link href="/performance" className="font-medium underline underline-offset-2">
                Open performance reviews
              </Link>{' '}
              for your goals and review cycles.
            </p>
          ) : (
            <p className="text-[#6b6b6b]">Performance reviews are not enabled for your account.</p>
          )}
        </div>
      </section>

      <section id="onboarding" className="scroll-mt-24 pt-8">
        <h2 className="text-[15px] font-semibold text-[#121212]">Onboarding</h2>
        <div className="mt-3 rounded-xl border border-[#e8e8e8] bg-white p-5 text-[13px]">
          {onboardingActive ? (
            <p>
              You have an active onboarding run.{' '}
              <Link href="/onboarding" className="font-medium text-[#121212] underline underline-offset-2">
                Continue onboarding
              </Link>
            </p>
          ) : (
            <p className="text-[#6b6b6b]">No active onboarding checklist.</p>
          )}
        </div>
      </section>

      <section id="other" className="scroll-mt-24 pt-8 pb-4">
        <h2 className="text-[15px] font-semibold text-[#121212]">Training, documents, certifications &amp; notes</h2>
        <div className="mt-3 space-y-3 rounded-xl border border-[#e8e8e8] bg-white p-5 text-[13px]">
          <p className="text-[#6b6b6b]">
            <strong className="text-[#121212]">Training &amp; certifications:</strong> dedicated training records are not
            modelled in CampSite yet. Your organisation may track these in{' '}
            <strong>Other job details</strong> (custom fields) above.
          </p>
          <p className="text-[#6b6b6b]">
            <strong className="text-[#121212]">Documents:</strong> contract and ID storage is not available in this
            product area yet — use your HR team&apos;s usual process.
          </p>
          <div>
            <p className="text-[#9b9b9b]">HR notes</p>
            <p className="mt-1 text-[#121212]">
              {fileRow && fileRow.notes != null && String(fileRow.notes).trim() !== ''
                ? String(fileRow.notes)
                : '—'}
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
