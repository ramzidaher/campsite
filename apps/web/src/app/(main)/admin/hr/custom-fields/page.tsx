import { CustomHrFieldDefinitionsClient } from '@/components/hr/CustomHrFieldDefinitionsClient';
import { warnIfSlowServerPath, withServerPerf } from '@/lib/perf/serverPerf';
import { parseShellPermissionKeys, shellBundleOrgId, shellBundleProfileStatus } from '@/lib/shell/shellBundleAccess';
import { getCachedMainShellLayoutBundle } from '@/lib/supabase/cachedMainShellLayoutBundle';
import { createClient } from '@/lib/supabase/server';
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
  const supabase = await createClient();
  const canView       = permissionKeys.includes('hr.custom_fields.view');
  const canManageDefs = permissionKeys.includes('hr.custom_fields.manage_definitions');
  if (!canView && !canManageDefs) redirect('/admin');

  const { data: defs } = await withServerPerf(
    '/admin/hr/custom-fields',
    'custom_field_definitions',
    supabase
      .from('hr_custom_field_definitions')
      .select('id, key, label, section, field_type, is_required, visible_to_manager, visible_to_self, is_active')
      .eq('org_id', orgId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true }),
    350
  );

  const view = (
    <div className="mx-auto max-w-4xl px-5 py-8 sm:px-7">
      {canManageDefs ? (
        <CustomHrFieldDefinitionsClient
          orgId={orgId}
          initialDefinitions={(defs ?? []).map((d) => ({
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
