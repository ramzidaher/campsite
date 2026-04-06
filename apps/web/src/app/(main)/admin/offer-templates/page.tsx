import { viewerHasPermission } from '@/lib/authz/serverGuards';
import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';

export default async function OfferTemplatesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id, role, status')
    .eq('id', user.id)
    .single();

  if (!profile?.org_id || profile.status !== 'active') redirect('/broadcasts');
  if (!(await viewerHasPermission('offers.view'))) redirect('/broadcasts');

  const orgId = profile.org_id as string;

  const { data: rows } = await supabase
    .from('offer_letter_templates')
    .select('id, name, updated_at')
    .eq('org_id', orgId)
    .order('name', { ascending: true });

  const templates = rows ?? [];

  return (
    <div className="mx-auto max-w-6xl px-5 py-7 sm:px-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-authSerif text-[26px] leading-tight tracking-[-0.03em] text-[#121212]">
            Offer letter templates
          </h1>
          <p className="mt-1 text-[13px] text-[#6b6b6b]">
            Create and manage templates for Offer Sent stage. Merge fields auto-fill from candidate and job data.
          </p>
          <p className="mt-1 text-[13px] text-[#6b6b6b]">
            Merge fields: <code className="text-[12px]">{`{{candidate_name}}`}</code>,{' '}
            <code className="text-[12px]">{`{{job_title}}`}</code>, <code className="text-[12px]">{`{{salary}}`}</code>,{' '}
            <code className="text-[12px]">{`{{start_date}}`}</code>, <code className="text-[12px]">{`{{contract_type}}`}</code>
          </p>
        </div>
        <Link
          href="/hr/offer-templates/new"
          className="inline-flex h-10 items-center justify-center rounded-lg bg-[#121212] px-4 text-[13px] font-medium text-[#faf9f6] transition-opacity hover:opacity-90"
        >
          New template
        </Link>
      </div>

      <ul className="mt-8 divide-y divide-[#f0f0f0] rounded-xl border border-[#d8d8d8] bg-white">
        {templates.length === 0 ? (
          <li className="px-4 py-10 text-center text-[13px] text-[#9b9b9b]">
            No templates yet. Create one to start generating e-sign offer letters.
          </li>
        ) : (
          templates.map((t) => (
            <li key={t.id as string} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-[#f5f4f1]">
              <div>
                <p className="text-[14px] font-medium text-[#121212]">{t.name as string}</p>
                <p className="text-[12px] text-[#9b9b9b]">
                  Updated {t.updated_at ? new Date(t.updated_at as string).toLocaleString() : '—'}
                </p>
              </div>
              <Link
                href={`/hr/offer-templates/${t.id as string}/edit`}
                className="rounded-lg border border-[#d8d8d8] bg-white px-3 py-1.5 text-[13px] text-[#6b6b6b] transition-colors hover:bg-[#f5f4f1] hover:text-[#121212]"
              >
                Edit
              </Link>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
