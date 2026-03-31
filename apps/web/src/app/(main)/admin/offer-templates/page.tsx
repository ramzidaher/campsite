import { canAccessOrgAdminArea } from '@/lib/adminGates';
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
  if (!canAccessOrgAdminArea(profile.role)) redirect('/broadcasts');

  const orgId = profile.org_id as string;

  const { data: rows } = await supabase
    .from('offer_letter_templates')
    .select('id, name, updated_at')
    .eq('org_id', orgId)
    .order('name', { ascending: true });

  const templates = rows ?? [];

  return (
    <div className="mx-auto max-w-3xl px-5 py-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[12px] font-medium uppercase tracking-wide text-[#9b9b9b]">Operations</p>
          <h1 className="mt-1 font-authSerif text-[26px] text-[#121212]">Offer letter templates</h1>
          <p className="mt-1 text-[13px] text-[#6b6b6b]">
            Merge fields: <code className="text-[12px]">{`{{candidate_name}}`}</code>,{' '}
            <code className="text-[12px]">{`{{job_title}}`}</code>, <code className="text-[12px]">{`{{salary}}`}</code>,{' '}
            <code className="text-[12px]">{`{{start_date}}`}</code>, <code className="text-[12px]">{`{{contract_type}}`}</code>
          </p>
        </div>
        <Link
          href="/admin/offer-templates/new"
          className="inline-flex h-10 items-center justify-center rounded-lg bg-[#008B60] px-4 text-[13px] font-medium text-white"
        >
          New template
        </Link>
      </div>

      <ul className="mt-8 divide-y divide-[#f0f0f0] rounded-xl border border-[#e8e8e8] bg-white shadow-sm">
        {templates.length === 0 ? (
          <li className="px-4 py-8 text-center text-[13px] text-[#6b6b6b]">No templates yet.</li>
        ) : (
          templates.map((t) => (
            <li key={t.id as string} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
              <div>
                <p className="text-[14px] font-medium text-[#121212]">{t.name as string}</p>
                <p className="text-[12px] text-[#9b9b9b]">
                  Updated {t.updated_at ? new Date(t.updated_at as string).toLocaleString() : '—'}
                </p>
              </div>
              <Link
                href={`/admin/offer-templates/${t.id as string}/edit`}
                className="rounded-lg border border-[#d8d8d8] px-3 py-1.5 text-[13px]"
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
