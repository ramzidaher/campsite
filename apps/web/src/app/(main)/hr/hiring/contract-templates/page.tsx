import { HideInHiringHub } from '@/app/(main)/hr/hiring/HideInHiringHub';
import { viewerHasPermission } from '@/lib/authz/serverGuards';
import { createClient } from '@/lib/supabase/server';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/supabase/getAuthUser';

export default async function HiringContractTemplatesPage() {
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id, status')
    .eq('id', user.id)
    .single();

  if (!profile?.org_id || profile.status !== 'active') redirect('/broadcasts');
  if (!(await viewerHasPermission('offers.view'))) redirect('/broadcasts');

  const orgId = profile.org_id as string;
  const { data: rows } = await supabase
    .from('offer_letter_templates')
    .select('id, name, updated_at')
    .eq('org_id', orgId)
    .ilike('name', '%contract%')
    .order('updated_at', { ascending: false });

  const templates = rows ?? [];

  return (
    <div className="mx-auto max-w-6xl px-5 py-7 sm:px-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <HideInHiringHub>
          <div className="min-w-0 flex-1">
            <h1 className="font-authSerif text-[26px] leading-tight tracking-[-0.03em] text-[#121212]">Contract templates</h1>
            <p className="mt-1 text-[13px] text-[#6b6b6b]">
              Contract-focused templates used when finalising offers and onboarding documents.
            </p>
          </div>
        </HideInHiringHub>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/hr/offer-templates/new?name=Contracts"
            prefetch={false}
            className="inline-flex h-9 items-center rounded-lg bg-[#121212] px-4 text-[13px] font-medium text-[#faf9f6] transition-opacity hover:opacity-90"
          >
            New contract template
          </Link>
          <Link
            href="/hr/offer-templates"
            prefetch={false}
            className="inline-flex h-9 items-center rounded-lg border border-[#d8d8d8] bg-white px-4 text-[13px] text-[#6b6b6b] transition-colors hover:bg-[#f5f4f1] hover:text-[#121212]"
          >
            View all templates
          </Link>
        </div>
      </div>

      <ul className="mt-8 divide-y divide-[#f0f0f0] rounded-xl border border-[#d8d8d8] bg-white">
        {templates.length === 0 ? (
          <li className="px-4 py-10 text-center text-[13px] text-[#9b9b9b]">
            No contract templates found yet. Create one to get started.
          </li>
        ) : (
          templates.map((t) => (
            <li key={t.id as string} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-[#f5f4f1]">
              <div>
                <p className="text-[14px] font-medium text-[#121212]">{t.name as string}</p>
                <p className="text-[12px] text-[#9b9b9b]">
                  Updated {t.updated_at ? new Date(t.updated_at as string).toLocaleString() : '-'}
                </p>
              </div>
              <Link
                href={`/hr/offer-templates/${t.id as string}/edit`}
                prefetch={false}
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
