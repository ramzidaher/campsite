import { CareersOrgLine, CareersProductStrip } from '@/app/(public)/jobs/CareersBranding';
import { CandidateApplicationMessages } from '@/app/(public)/jobs/me/CandidateApplicationMessages';
import { CandidateApplicationStageBadge } from '@/app/(public)/jobs/me/CandidateApplicationStageBadge';
import { createClient } from '@/lib/supabase/server';
import { headers } from 'next/headers';
import { notFound } from 'next/navigation';

export default async function CandidatePortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token: rawToken } = await params;
  const token = rawToken?.trim();
  if (!token) notFound();

  const supabase = await createClient();
  const h = await headers();
  const actorKey = `${(h.get('x-forwarded-for') ?? '').split(',')[0]?.trim() || 'anon'}:candidate-status`;
  const { data: rateAllowed } = await supabase.rpc('record_public_token_attempt', {
    p_channel: 'candidate_status_view',
    p_actor_key: actorKey,
  });
  if (!rateAllowed) notFound();
  const { data, error } = await supabase.rpc('get_candidate_application_portal', {
    p_portal_token: token,
  });

  if (error || !data?.length) notFound();

  const row = data[0] as {
    org_name: string;
    job_title: string;
    stage: string;
    submitted_at: string;
    interview_joining_instructions: string | null;
    messages: { body: string; created_at: string }[] | null;
  };

  const messages = Array.isArray(row.messages) ? row.messages : [];

  return (
    <div className="min-h-screen bg-[#faf9f6] text-[#121212]">
      <div className="border-b border-[#e8e6e3] bg-[#faf9f6] px-5 pb-6 pt-8">
        <div className="mx-auto max-w-lg space-y-5">
          <CareersProductStrip />
          <CareersOrgLine orgName={row.org_name} />
        </div>
      </div>
      <header className="border-b border-[#ececec] bg-white px-5 py-4">
        <h1 className="font-authSerif text-[22px] tracking-tight text-[#121212]">{row.job_title}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <CandidateApplicationStageBadge stage={row.stage} />
        </div>
        <p className="mt-1 text-[12px] text-[#9b9b9b]">
          Applied{' '}
          {row.submitted_at
            ? new Date(row.submitted_at).toLocaleString(undefined, {
                dateStyle: 'medium',
                timeStyle: 'short',
              })
            : '—'}
        </p>
      </header>

      <main className="mx-auto max-w-lg px-5 py-8">
        <section className="mb-4 rounded-xl border border-[#e8e8e8] bg-white p-4 shadow-sm">
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-[#9b9b9b]">Application Tracker</h2>
          <p className="mt-2 text-[13px] text-[#505050]">
            This portal shows your application stage and messages from HR. Applications are read-only after submission.
          </p>
        </section>
        <CandidateApplicationMessages messages={messages} />
        {row.interview_joining_instructions ? (
          <section className="mt-4 rounded-xl border border-[#dbeafe] bg-[#f8fbff] p-5 shadow-sm">
            <h2 className="text-[11px] font-semibold uppercase tracking-wide text-[#1e40af]">Interview joining instructions</h2>
            <p className="mt-2 whitespace-pre-wrap text-[14px] leading-relaxed text-[#1f2937]">
              {row.interview_joining_instructions}
            </p>
          </section>
        ) : null}
        <p className="mt-6 text-center text-[11px] text-[#9b9b9b]">This page is private to you — keep the link safe.</p>
      </main>
    </div>
  );
}
