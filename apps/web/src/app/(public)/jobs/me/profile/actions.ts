'use server';

import { buildCandidateJobsLoginRedirectUrl } from '@/lib/jobs/candidateAuthRedirect';
import { createClient } from '@/lib/supabase/server';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

const MAX = {
  name: 200,
  phone: 40,
  location: 200,
  url: 500,
} as const;

export type CandidateProfileFormState = { ok: boolean; error: string | null };

function trimOrNull(v: unknown, max: number): string | null {
  const t = String(v ?? '').trim();
  if (!t) return null;
  return t.length > max ? t.slice(0, max) : t;
}

function normalizeOptionalUrl(v: unknown): string | null {
  const t = String(v ?? '').trim();
  if (!t) return null;
  if (t.length > MAX.url) return null;
  try {
    const href = t.includes('://') ? t : `https://${t}`;
    const u = new URL(href);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return u.toString().slice(0, MAX.url);
  } catch {
    return null;
  }
}

export async function updateCandidateProfile(
  _prev: CandidateProfileFormState,
  formData: FormData
): Promise<CandidateProfileFormState> {
  const h = await headers();
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? '';
  const orgSlug = h.get('x-campsite-org-slug')?.trim() ?? null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(
      buildCandidateJobsLoginRedirectUrl({
        hostHeader: host,
        orgSlug,
        nextPath: '/jobs/me/profile',
      })
    );
  }

  const full_name = trimOrNull(formData.get('full_name'), MAX.name);
  const phone = trimOrNull(formData.get('phone'), MAX.phone);
  const location = trimOrNull(formData.get('location'), MAX.location);
  const linkedinRaw = String(formData.get('linkedin_url') ?? '').trim();
  const portfolioRaw = String(formData.get('portfolio_url') ?? '').trim();

  const linkedin_url = normalizeOptionalUrl(linkedinRaw);
  const portfolio_url = normalizeOptionalUrl(portfolioRaw);

  if (linkedinRaw && linkedin_url === null) {
    return { ok: false, error: 'LinkedIn URL does not look valid. Use https://… or leave blank.' };
  }
  if (portfolioRaw && portfolio_url === null) {
    return { ok: false, error: 'Portfolio URL does not look valid. Use https://… or leave blank.' };
  }

  const { error } = await supabase.from('candidate_profiles').upsert(
    {
      id: user.id,
      full_name,
      phone,
      location,
      linkedin_url,
      portfolio_url,
    },
    { onConflict: 'id' }
  );

  if (error) {
    return { ok: false, error: error.message };
  }

  revalidatePath('/jobs/me/profile');
  revalidatePath('/jobs/me');
  return { ok: true, error: null };
}
