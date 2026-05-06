'use server';

import {
  CANDIDATE_PERSONA_OPTIONS,
  CANDIDATE_SKILLS_MAX,
  CANDIDATE_SKILL_OPTIONS,
} from '@/app/(public)/jobs/candidatePersonaOptions';
import { buildCandidateJobsLoginRedirectUrl } from '@/lib/jobs/candidateAuthRedirect';
import { createClient } from '@/lib/supabase/server';
import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

const MAX = {
  name: 200,
  phone: 40,
  location: 200,
  current_title: 200,
  url: 500,
} as const;

const VALID_PERSONA_EMOJIS = new Set(CANDIDATE_PERSONA_OPTIONS.map((o) => o.emoji));
const VALID_SKILLS = new Set<string>(CANDIDATE_SKILL_OPTIONS as readonly string[]);

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
  const current_title = trimOrNull(formData.get('current_title'), MAX.current_title);
  const linkedinRaw = String(formData.get('linkedin_url') ?? '').trim();
  const portfolioRaw = String(formData.get('portfolio_url') ?? '').trim();
  const personaRaw = String(formData.get('persona') ?? '').trim();
  const skillsRaw = formData.getAll('skills').map((v) => String(v ?? '').trim());

  const linkedin_url = normalizeOptionalUrl(linkedinRaw);
  const portfolio_url = normalizeOptionalUrl(portfolioRaw);
  const persona = personaRaw && VALID_PERSONA_EMOJIS.has(personaRaw) ? personaRaw : null;
  const skills = Array.from(
    new Set(skillsRaw.filter((entry) => entry.length > 0 && VALID_SKILLS.has(entry)))
  ).slice(0, CANDIDATE_SKILLS_MAX);

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
      current_title,
      linkedin_url,
      portfolio_url,
      persona,
      skills,
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
