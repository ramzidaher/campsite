import { viewerHasPermission } from '@/lib/authz/serverGuards';
import { getAuthUser } from '@/lib/supabase/getAuthUser';
import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';

function fmtDateTime(value: string | null): string {
  if (!value) return 'Not set';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'Not set';
  return d.toLocaleString();
}

function parseDateList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => String(v ?? '').trim()).filter(Boolean);
}

function toDateOnly(value: string): Date | null {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const d = new Date(`${raw}T00:00:00.000Z`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDateDdMm(date: Date, withYear: boolean): string {
  const dd = String(date.getUTCDate()).padStart(2, '0');
  const mm = String(date.getUTCMonth() + 1).padStart(2, '0');
  const yyyy = String(date.getUTCFullYear());
  return withYear ? `${dd}/${mm}/${yyyy}` : `${dd}/${mm}`;
}

function formatMultiDateSummary(values: string[]): string {
  const sortedUnique = Array.from(
    new Set(
      values
        .map(toDateOnly)
        .filter((d): d is Date => Boolean(d))
        .map((d) => d.toISOString().slice(0, 10)),
    ),
  )
    .map((isoDay) => new Date(`${isoDay}T00:00:00.000Z`))
    .sort((a, b) => a.getTime() - b.getTime());

  if (sortedUnique.length === 0) return 'Not set';
  if (sortedUnique.length === 1) return formatDateDdMm(sortedUnique[0], true);

  const isConsecutive = sortedUnique
    .slice(1)
    .every((d, idx) => d.getTime() - sortedUnique[idx]!.getTime() === 24 * 60 * 60 * 1000);

  if (isConsecutive) {
    return `${formatDateDdMm(sortedUnique[0], false)} to ${formatDateDdMm(
      sortedUnique[sortedUnique.length - 1],
      true,
    )}`;
  }

  const prefix = sortedUnique
    .slice(0, -1)
    .map((d) => formatDateDdMm(d, false));
  const last = formatDateDdMm(sortedUnique[sortedUnique.length - 1], true);
  if (prefix.length === 1) return `${prefix[0]} and ${last}`;
  return `${prefix.slice(0, -1).join(', ')}, ${prefix[prefix.length - 1]} and ${last}`;
}

export default async function HrJobPreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: rawId } = await params;
  const id = rawId?.trim();
  if (!id) redirect('/hr/jobs');

  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('org_id, status').eq('id', user.id).single();
  if (!profile?.org_id || profile.status !== 'active') redirect('/broadcasts');
  if (!(await viewerHasPermission('jobs.view'))) redirect('/broadcasts');

  const { data: job } = await supabase
    .from('job_listings')
    .select(
      'id, title, grade_level, salary_band, contract_type, advert_copy, requirements, benefits, applications_close_at, scheduled_publish_at, hide_posted_date, shortlisting_dates, interview_dates, start_date_needed, role_profile_link'
    )
    .eq('id', id)
    .eq('org_id', profile.org_id as string)
    .maybeSingle();
  if (!job?.id) redirect('/hr/jobs');

  const shortlistingDates = parseDateList(job.shortlisting_dates);
  const interviewDates = parseDateList(job.interview_dates);

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <h1 className="font-authSerif text-[28px] leading-tight tracking-[-0.03em] text-[#121212]">Job listing preview</h1>
        <Link
          href={`/hr/jobs/${id}/edit`}
          className="inline-flex h-10 items-center justify-center rounded-full border border-[#d8d8d8] bg-white px-5 text-[13px] font-medium text-[#121212] hover:bg-[#faf9f6]"
        >
          Back to editor
        </Link>
      </div>

      <section className="space-y-5 rounded-2xl border border-[#e8e8e8] bg-white p-8 shadow-sm">
        <h2 className="font-authSerif text-[24px] text-[#121212]">{job.title}</h2>
        <p className="text-[13px] text-[#6b6b6b]">
          {job.grade_level} · {job.contract_type} · {job.salary_band}
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <p className="text-[13px] text-[#6b6b6b]">Scheduled post: {fmtDateTime(job.scheduled_publish_at)}</p>
          <p className="text-[13px] text-[#6b6b6b]">Closing date: {fmtDateTime(job.applications_close_at)}</p>
          <p className="text-[13px] text-[#6b6b6b]">Hide posted date: {job.hide_posted_date ? 'Yes' : 'No'}</p>
          <p className="text-[13px] text-[#6b6b6b]">Start date: {job.start_date_needed || 'Not set'}</p>
        </div>
        <p className="text-[13px] text-[#6b6b6b]">Role profile link: {job.role_profile_link || 'Not set'}</p>

        <div>
          <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-widest text-[#9b9b9b]">Shortlisting dates</h3>
          <p className="text-[13px] text-[#121212]">{formatMultiDateSummary(shortlistingDates)}</p>
        </div>

        <div>
          <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-widest text-[#9b9b9b]">Interview dates</h3>
          <p className="text-[13px] text-[#121212]">{formatMultiDateSummary(interviewDates)}</p>
        </div>

        <div>
          <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-widest text-[#9b9b9b]">Job overview</h3>
          <p className="whitespace-pre-wrap text-[14px] text-[#121212]">{job.advert_copy || 'Not set'}</p>
        </div>

        <div>
          <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-widest text-[#9b9b9b]">Job description</h3>
          <p className="whitespace-pre-wrap text-[14px] text-[#121212]">{job.requirements || 'Not set'}</p>
        </div>

        <div>
          <h3 className="mb-2 text-[12px] font-semibold uppercase tracking-widest text-[#9b9b9b]">About organisation</h3>
          <p className="whitespace-pre-wrap text-[14px] text-[#121212]">{job.benefits || 'Not set'}</p>
        </div>
      </section>
    </main>
  );
}
