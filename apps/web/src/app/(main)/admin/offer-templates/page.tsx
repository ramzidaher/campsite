import { HideInHiringHub } from '@/app/(main)/hr/hiring/HideInHiringHub';
import { getCachedAdminOfferTemplatesPageData } from '@/lib/admin/getCachedAdminOfferTemplatesPageData';
import { parseShellPermissionKeys, shellBundleOrgId, shellBundleProfileStatus } from '@/lib/shell/shellBundleAccess';
import { getCachedMainShellLayoutBundle } from '@/lib/supabase/cachedMainShellLayoutBundle';
import Link from 'next/link';
import { redirect } from 'next/navigation';

/** Common recruitment / HR document types — use as template names (pill shortcuts below). */
const SUGGESTED_TEMPLATE_TYPES = [
  'Contracts',
  'Offer letter',
  'EDI form',
  'Application forms',
  'Rejection',
  'Acceptance',
  'Interviews selection email',
] as const;

export default async function OfferTemplatesPage() {
  const bundle = await getCachedMainShellLayoutBundle();
  const orgId = shellBundleOrgId(bundle);
  if (!orgId) redirect('/login');
  if (shellBundleProfileStatus(bundle) !== 'active') redirect('/broadcasts');
  const permissionKeys = parseShellPermissionKeys(bundle);
  if (!permissionKeys.includes('offers.view')) redirect('/broadcasts');

  const { templates } = await getCachedAdminOfferTemplatesPageData(orgId);

  return (
    <div className="mx-auto max-w-6xl px-5 py-7 sm:px-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <HideInHiringHub>
            <div>
              <h1 className="font-authSerif text-[26px] leading-tight tracking-[-0.03em] text-[#121212]">Templates</h1>
              <p className="mt-1 text-[13px] text-[#6b6b6b]">
                Offer letters, contracts, and recruitment emails. Merge fields auto-fill from candidate and job data where
                applicable.
              </p>
              <p className="mt-1 text-[13px] text-[#6b6b6b]">
                Merge fields: <code className="text-[12px]">{`{{candidate_name}}`}</code>,{' '}
                <code className="text-[12px]">{`{{job_title}}`}</code>, <code className="text-[12px]">{`{{salary}}`}</code>,{' '}
                <code className="text-[12px]">{`{{start_date}}`}</code>, <code className="text-[12px]">{`{{contract_type}}`}</code>
              </p>
            </div>
          </HideInHiringHub>
        </div>
        <Link
          href="/hr/offer-templates/new"
          className="inline-flex h-10 items-center justify-center rounded-lg bg-[#121212] px-4 text-[13px] font-medium text-[#faf9f6] transition-opacity hover:opacity-90"
        >
          New template
        </Link>
      </div>

      <div className="mt-8">
        <p className="text-[11.5px] font-medium uppercase tracking-wide text-[#9b9b9b]">Suggested types</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {SUGGESTED_TEMPLATE_TYPES.map((label) => (
            <Link
              key={label}
              href={`/hr/offer-templates/new?name=${encodeURIComponent(label)}`}
              className="inline-flex items-center rounded-full border border-[#e4e4e4] bg-white px-3.5 py-1.5 text-[12.5px] font-medium text-[#4a4a4a] shadow-[0_1px_0_rgba(0,0,0,0.03)] transition-colors hover:border-[#c8c8c8] hover:bg-[#fafafa]"
            >
              {label}
            </Link>
          ))}
        </div>
        <p className="mt-2 text-[12px] text-[#9b9b9b]">Opens the editor with this name — adjust the body to match.</p>
      </div>

      <ul className="mt-8 divide-y divide-[#f0f0f0] rounded-xl border border-[#d8d8d8] bg-white">
        {templates.length === 0 ? (
          <li className="px-4 py-10 text-center text-[13px] text-[#9b9b9b]">
            No templates yet. Pick a suggested type above or create a blank template to get started.
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
