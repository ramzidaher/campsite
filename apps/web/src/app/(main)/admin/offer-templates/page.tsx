import { HideInHiringHub } from '@/app/(main)/hr/hiring/HideInHiringHub';
import { getCachedAdminOfferTemplatesPageData } from '@/lib/admin/getCachedAdminOfferTemplatesPageData';
import { parseShellPermissionKeys, shellBundleOrgId, shellBundleProfileStatus } from '@/lib/shell/shellBundleAccess';
import { getCachedMainShellLayoutBundle } from '@/lib/supabase/cachedMainShellLayoutBundle';
import { ArrowRight, Plus } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';

/** Common recruitment / HR document types  use as template names (pill shortcuts below). */
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
  if (!permissionKeys.includes('offers.view')) redirect('/forbidden');

  const { templates } = await getCachedAdminOfferTemplatesPageData(orgId);

  return (
    <div className="mx-auto max-w-6xl px-5 py-7 sm:px-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <HideInHiringHub>
            <div>
              <h1 className="font-authSerif text-[26px] leading-tight tracking-[-0.03em] text-[#121212]">Offer templates</h1>
              <p className="mt-1 text-[13px] text-[#6b6b6b]">
                Create and manage reusable offer letters, contracts, and hiring emails.
              </p>
            </div>
          </HideInHiringHub>
        </div>
        <Link
          href="/hr/offer-templates/new"
          className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[#121212] px-4 text-[13px] font-medium text-[#faf9f6] transition-opacity hover:opacity-90"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          New template
        </Link>
      </div>

      <div className="mt-4 rounded-lg border border-[#e8e8e8] bg-white px-4 py-3 text-[12px] text-[#6b6b6b]">
        <span className="font-medium text-[#121212]">Available merge fields:</span>{' '}
        <code className="text-[11.5px]">{`{{candidate_name}}`}</code>,{' '}
        <code className="text-[11.5px]">{`{{job_title}}`}</code>,{' '}
        <code className="text-[11.5px]">{`{{salary}}`}</code>,{' '}
        <code className="text-[11.5px]">{`{{start_date}}`}</code>,{' '}
        <code className="text-[11.5px]">{`{{contract_type}}`}</code>
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
        <p className="mt-2 text-[12px] text-[#9b9b9b]">Opens the editor with this name  adjust the body to match.</p>
      </div>

      <div className="mt-8 flex items-center justify-between">
        <p className="text-[11.5px] font-medium uppercase tracking-wide text-[#9b9b9b]">
          Existing templates
        </p>
        <p className="text-[12px] text-[#9b9b9b]">{templates.length} total</p>
      </div>

      <ul className="mt-8 overflow-hidden divide-y divide-[#f0f0f0] rounded-xl border border-[#d8d8d8] bg-white">
        {templates.length === 0 ? (
          <li className="px-4 py-10 text-center">
            <p className="text-[14px] font-medium text-[#121212]">No templates yet</p>
            <p className="mt-1 text-[13px] text-[#9b9b9b]">
              Pick a suggested type above or start from a blank template.
            </p>
            <Link
              href="/hr/offer-templates/new"
              className="mx-auto mt-4 inline-flex h-9 items-center gap-2 rounded-lg bg-[#121212] px-4 text-[12.5px] font-medium text-[#faf9f6] transition-opacity hover:opacity-90"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden />
              New template
            </Link>
          </li>
        ) : (
          templates.map((t) => (
            <li
              key={t.id as string}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-[#f5f4f1]"
            >
              <div>
                <p className="text-[14px] font-medium text-[#121212]">{t.name as string}</p>
                <p className="text-[12px] text-[#9b9b9b]">
                  Updated {t.updated_at ? new Date(t.updated_at as string).toLocaleString() : ''}
                </p>
              </div>
              <Link
                href={`/hr/offer-templates/${t.id as string}/edit`}
                className="inline-flex items-center gap-1 rounded-lg border border-[#d8d8d8] bg-white px-3 py-1.5 text-[13px] text-[#6b6b6b] transition-colors hover:bg-[#f5f4f1] hover:text-[#121212]"
              >
                Edit
                <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
