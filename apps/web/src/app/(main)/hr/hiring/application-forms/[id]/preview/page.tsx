import { viewerHasPermission } from '@/lib/authz/serverGuards';
import { getAuthUser } from '@/lib/supabase/getAuthUser';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

type QuestionRow = {
  id: string;
  question_type: string | null;
  prompt: string | null;
  help_text: string | null;
  required: boolean | null;
  options: unknown;
  max_length: number | null;
  sort_order: number | null;
};

export default async function ApplicationFormPreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: rawId } = await params;
  const formId = rawId?.trim();
  if (!formId) redirect('/hr/hiring/application-forms');

  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('org_id, status').eq('id', user.id).single();
  if (!profile?.org_id || profile.status !== 'active') redirect('/broadcasts');

  const canViewJobs = await viewerHasPermission('jobs.view');
  if (!canViewJobs) redirect('/broadcasts');

  const orgId = profile.org_id as string;

  const [{ data: setRow }, { data: rows }] = await Promise.all([
    supabase
      .from('org_application_question_sets')
      .select('id, name')
      .eq('id', formId)
      .eq('org_id', orgId)
      .maybeSingle(),
    supabase
      .from('org_application_question_set_items')
      .select('id, question_type, prompt, help_text, required, options, max_length, sort_order')
      .eq('set_id', formId)
      .order('sort_order', { ascending: true }),
  ]);

  if (!setRow?.id) redirect('/hr/hiring/application-forms');

  const questions = ((rows ?? []) as QuestionRow[]).filter((q) => String(q.prompt ?? '').trim().length > 0);

  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-7 sm:px-7">
      <div className="mb-6">
        <div>
          <p className="text-[12px] font-semibold uppercase tracking-widest text-[#9b9b9b]">Applicant preview</p>
          <h1 className="mt-2 font-authSerif text-[28px] leading-tight tracking-[-0.03em] text-[#121212]">
            {String(setRow.name ?? '').trim() || 'Application form'}
          </h1>
          <p className="mt-2 text-[13.5px] leading-relaxed text-[#6b6b6b]">
            This is how applicants will see your custom application questions.
          </p>
        </div>
      </div>

      <section className="space-y-4 rounded-2xl border border-[#e8e8e8] bg-white p-6 shadow-sm sm:p-8">
        {questions.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[#d8d8d8] bg-[#faf9f6] px-4 py-6 text-[13px] text-[#6b6b6b]">
            No questions yet. Add at least one question in the editor to preview the applicant view.
          </p>
        ) : (
          questions.map((q, idx) => {
            const type = String(q.question_type ?? 'short_text');
            const opts = Array.isArray(q.options)
              ? (q.options as { id?: string; label?: string }[])
                  .map((o) => ({ id: String(o.id ?? '').trim(), label: String(o.label ?? '').trim() }))
                  .filter((o) => o.id && o.label)
              : [];

            return (
              <article key={q.id} className="rounded-xl border border-[#e8e8e8] bg-[#fcfcfb] p-4">
                <label className="block text-[14px] font-medium text-[#121212]">
                  {idx + 1}. {String(q.prompt ?? '').trim()}
                  {q.required ? <span className="text-[#b42318]"> *</span> : null}
                </label>
                {q.help_text ? <p className="mt-1 text-[12px] text-[#6b6b6b]">{String(q.help_text).trim()}</p> : null}

                {type === 'short_text' ? (
                  <input
                    disabled
                    className="mt-3 w-full rounded-lg border border-[#d8d8d8] bg-white px-3 py-2.5 text-[14px] text-[#121212]"
                    placeholder="Short answer"
                    maxLength={q.max_length ?? 500}
                  />
                ) : null}

                {type === 'paragraph' ? (
                  <textarea
                    disabled
                    className="mt-3 min-h-[110px] w-full rounded-lg border border-[#d8d8d8] bg-white px-3 py-2.5 text-[14px] text-[#121212]"
                    placeholder="Your answer"
                    maxLength={q.max_length ?? 8000}
                  />
                ) : null}

                {type === 'single_choice' ? (
                  <div className="mt-3 space-y-2">
                    {opts.map((o) => (
                      <label key={o.id} className="flex items-center gap-2 text-[13px] text-[#121212]">
                        <input type="radio" disabled name={`preview-${q.id}`} />
                        <span>{o.label}</span>
                      </label>
                    ))}
                  </div>
                ) : null}

                {type === 'yes_no' ? (
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      disabled
                      className="rounded-lg border border-[#d8d8d8] bg-white px-4 py-2 text-[13px] text-[#121212]"
                    >
                      Yes
                    </button>
                    <button
                      type="button"
                      disabled
                      className="rounded-lg border border-[#d8d8d8] bg-white px-4 py-2 text-[13px] text-[#121212]"
                    >
                      No
                    </button>
                  </div>
                ) : null}
              </article>
            );
          })
        )}
      </section>
    </main>
  );
}
