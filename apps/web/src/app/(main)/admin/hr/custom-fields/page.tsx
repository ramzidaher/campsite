import { CustomHrFieldDefinitionsClient } from '@/components/hr/CustomHrFieldDefinitionsClient';
import { getCachedAdminHrCustomFieldsPageData } from '@/lib/hr/getCachedAdminHrCustomFieldsPageData';
import { warnIfSlowServerPath, withServerPerf } from '@/lib/perf/serverPerf';
import { parseShellPermissionKeys, shellBundleOrgId, shellBundleProfileStatus } from '@/lib/shell/shellBundleAccess';
import { getCachedMainShellLayoutBundle } from '@/lib/supabase/cachedMainShellLayoutBundle';
import { redirect } from 'next/navigation';

export default async function AdminHrCustomFieldsPage() {
  const pathStartedAtMs = Date.now();
  const bundle = await withServerPerf(
    '/admin/hr/custom-fields',
    'shell_bundle_for_access',
    getCachedMainShellLayoutBundle(),
    300
  );
  const orgId = shellBundleOrgId(bundle);
  if (!orgId) redirect('/login');
  if (shellBundleProfileStatus(bundle) !== 'active') redirect('/broadcasts');
  const permissionKeys = parseShellPermissionKeys(bundle);
  const canView       = permissionKeys.includes('hr.custom_fields.view');
  const canManageDefs = permissionKeys.includes('hr.custom_fields.manage_definitions');
  if (!canView && !canManageDefs) redirect('/forbidden');

  const { definitions } = await withServerPerf(
    '/admin/hr/custom-fields',
    'cached_admin_hr_custom_fields_page_data',
    getCachedAdminHrCustomFieldsPageData(orgId),
    550
  );

  const view = (
    <div className="w-full px-5 py-6 sm:px-[28px] sm:py-7">
      <header className="mb-6">
        <h1 className="font-authSerif text-[28px] leading-tight tracking-[-0.03em] text-[#121212]">
          HR custom fields
        </h1>
        <p className="mt-1 max-w-2xl text-[13.5px] leading-relaxed text-[#6b6b6b]">
          Define organisation-level fields used in HR records. These fields can be shown to managers and employees based on visibility settings.
        </p>
      </header>
      {canManageDefs ? (
        <CustomHrFieldDefinitionsClient
          orgId={orgId}
          initialDefinitions={definitions.map((d) => ({
            id: d.id as string,
            key: d.key as string,
            label: d.label as string,
            section: (d.section as string) ?? 'personal',
            field_type: (d.field_type as string) ?? 'text',
            is_required: Boolean(d.is_required),
            visible_to_manager: Boolean(d.visible_to_manager),
            visible_to_self: Boolean(d.visible_to_self),
            is_active: Boolean(d.is_active),
          }))}
        />
      ) : (
        <p className="text-[13px] text-[#6b6b6b]">You can view custom fields but cannot manage definitions.</p>
      )}
    </div>
  );
  warnIfSlowServerPath('/admin/hr/custom-fields', pathStartedAtMs);
  return view;
}
