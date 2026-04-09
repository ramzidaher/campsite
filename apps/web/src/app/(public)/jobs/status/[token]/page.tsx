import { jobApplicationStageLabel } from '@/lib/jobs/labels';
import { createClient } from '@/lib/supabase/server';
import { notFound } from 'next/navigation';

type PortalMessage = { body: string; created_at: string };

export default async function CandidatePortalPage({ params }: { params: Promise<{ token: string }> }) {
  const { token: rawToken } = await params;
  const token = rawToken?.trim();
  if (!token) notFound();

  const supabase = await createClient();
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
    messages: PortalMessage[] | null;
  };

  const messages = Array.isArray(row.messages) ? row.messages : [];

  return (
    <div className="min-h-screen bg-[#faf9f6] text-[#121212]">
      <header className="border-b border-[#ececec] bg-white px-5 py-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[#9b9b9b]">{row.org_name}</p>
        <h1 className="font-authSerif text-[22px] tracking-tight text-[#121212]">{row.job_title}</h1>
        <p className="mt-2 text-[13px] text-[#6b6b6b]">
          Status: <span className="font-medium text-[#121212]">{jobApplicationStageLabel(row.stage)}</span>
        </p>
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
        <section className="rounded-xl border border-[#e8e8e8] bg-white p-5 shadow-sm">
          <h2 className="text-[11px] font-semibold uppercase tracking-wide text-[#9b9b9b]">Messages from the team</h2>
          {messages.length === 0 ? (
            <p className="mt-2 text-[14px] text-[#6b6b6b]">No messages yet. We’ll post updates here.</p>
          ) : (
            <ul className="mt-3 space-y-4">
              {messages.map((m, i) => (
                <li key={`${m.created_at}-${i}`} className="border-t border-[#f0f0f0] pt-3 first:border-t-0 first:pt-0">
                  <p className="text-[11px] text-[#9b9b9b]">
                    {m.created_at
                      ? new Date(m.created_at).toLocaleString(undefined, {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })
                      : ''}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap text-[14px] leading-relaxed text-[#242424]">{m.body}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
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
