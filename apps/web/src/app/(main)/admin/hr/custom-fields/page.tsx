import { CustomHrFieldDefinitionsClient } from '@/components/hr/CustomHrFieldDefinitionsClient';
import { createClient } from '@/lib/supabase/server';
import { getAuthUser } from '@/lib/supabase/getAuthUser';
import { redirect } from 'next/navigation';

export default async function AdminHrCustomFieldsPage() {
  const supabase = await createClient();
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('org_id, status')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile?.org_id || profile.status !== 'active') redirect('/broadcasts');
  const orgId = profile.org_id as string;

  const [{ data: canView }, { data: canManageDefs }] = await Promise.all([
    supabase.rpc('has_permission', {
      p_user_id: user.id,
      p_org_id: orgId,
      p_permission_key: 'hr.custom_fields.view',
      p_context: {},
    }),
    supabase.rpc('has_permission', {
      p_user_id: user.id,
      p_org_id: orgId,
      p_permission_key: 'hr.custom_fields.manage_definitions',
      p_context: {},
    }),
  ]);
  if (!canView && !canManageDefs) redirect('/admin');

  const { data: defs } = await supabase
    .from('hr_custom_field_definitions')
    .select('id, key, label, section, field_type, is_required, visible_to_manager, visible_to_self, is_active')
    .eq('org_id', orgId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  return (
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
}
