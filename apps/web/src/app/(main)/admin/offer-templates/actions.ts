'use server';

import { createClient } from '@/lib/supabase/server';
import { isOrgAdminRole } from '@campsite/types';
import { revalidatePath } from 'next/cache';

export type OfferTemplateListItem = { id: string; name: string; updated_at: string };
export type OfferTemplateActionResult = { ok: true } | { ok: false; error: string };

async function requireOrgAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null as null, profile: null as null, orgId: null as null };

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, org_id, role, status')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile?.org_id || profile.status !== 'active' || !isOrgAdminRole(profile.role)) {
    return { supabase, user, profile: null as null, orgId: null as null };
  }

  return { supabase, user, profile, orgId: profile.org_id as string };
}

export async function listOfferTemplates(): Promise<
  { ok: true; templates: OfferTemplateListItem[] } | { ok: false; error: string }
> {
  const { supabase, orgId } = await requireOrgAdmin();
  if (!orgId) return { ok: false, error: 'Not allowed.' };

  const { data, error } = await supabase
    .from('offer_letter_templates')
    .select('id, name, updated_at')
    .eq('org_id', orgId)
    .order('name', { ascending: true });

  if (error) return { ok: false, error: error.message };
  return { ok: true, templates: (data ?? []) as OfferTemplateListItem[] };
}

export async function createOfferTemplate(
  name: string,
  bodyHtml: string
): Promise<OfferTemplateActionResult & { id?: string }> {
  const { supabase, profile, orgId, user } = await requireOrgAdmin();
  if (!profile || !orgId || !user) return { ok: false, error: 'Not allowed.' };

  const n = name?.trim();
  if (!n) return { ok: false, error: 'Name is required.' };

  const { data, error } = await supabase
    .from('offer_letter_templates')
    .insert({
      org_id: orgId,
      name: n,
      body_html: bodyHtml ?? '',
      created_by: user.id,
      updated_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (error || !data?.id) return { ok: false, error: error?.message ?? 'Could not save.' };
  revalidatePath('/admin/offer-templates');
  return { ok: true, id: data.id as string };
}

export async function updateOfferTemplate(
  id: string,
  name: string,
  bodyHtml: string
): Promise<OfferTemplateActionResult> {
  const tid = id?.trim();
  if (!tid) return { ok: false, error: 'Missing template.' };

  const { supabase, orgId, user } = await requireOrgAdmin();
  if (!orgId || !user) return { ok: false, error: 'Not allowed.' };

  const n = name?.trim();
  if (!n) return { ok: false, error: 'Name is required.' };

  const { error } = await supabase
    .from('offer_letter_templates')
    .update({
      name: n,
      body_html: bodyHtml ?? '',
      updated_at: new Date().toISOString(),
    })
    .eq('id', tid)
    .eq('org_id', orgId);

  if (error) return { ok: false, error: error.message };
  revalidatePath('/admin/offer-templates');
  revalidatePath(`/admin/offer-templates/${tid}/edit`);
  return { ok: true };
}

export async function deleteOfferTemplate(id: string): Promise<OfferTemplateActionResult> {
  const tid = id?.trim();
  if (!tid) return { ok: false, error: 'Missing template.' };

  const { supabase, orgId } = await requireOrgAdmin();
  if (!orgId) return { ok: false, error: 'Not allowed.' };

  const { error } = await supabase.from('offer_letter_templates').delete().eq('id', tid).eq('org_id', orgId);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/admin/offer-templates');
  return { ok: true };
}
