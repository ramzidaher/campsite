'use client';

import {
  CANDIDATE_PERSONA_OPTIONS,
  CANDIDATE_SKILLS_MAX,
  CANDIDATE_SKILL_OPTIONS,
} from '@/app/(public)/jobs/candidatePersonaOptions';
import type { CandidateProfileFormState } from '@/app/(public)/jobs/me/profile/actions';
import { updateCandidateProfile } from '@/app/(public)/jobs/me/profile/actions';
import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';

const initial: CandidateProfileFormState = { ok: false, error: null };

const labelClass = 'block text-[12px] font-medium text-[#505050]';
const inputClass =
  'mt-1 w-full rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[14px] text-[#121212] outline-none focus:border-[#121212]';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-[#121212] px-4 py-2 text-[13px] font-medium text-[#faf9f6] hover:opacity-90 disabled:opacity-60"
    >
      {pending ? 'Saving…' : 'Save profile'}
    </button>
  );
}

type Profile = {
  full_name: string | null;
  phone: string | null;
  location: string | null;
  current_title: string | null;
  linkedin_url: string | null;
  portfolio_url: string | null;
  persona: string | null;
  skills: string[];
};

export function CandidateProfileForm({ profile }: { profile: Profile }) {
  const [state, action] = useFormState(updateCandidateProfile, initial);
  const [persona, setPersona] = useState<string>(profile.persona?.trim() ?? '');
  const [skills, setSkills] = useState<string[]>(
    Array.isArray(profile.skills) ? profile.skills.filter((s) => s.length > 0) : []
  );
  const [skillError, setSkillError] = useState<string | null>(null);

  function toggleSkill(skill: string) {
    setSkillError(null);
    if (skills.includes(skill)) {
      setSkills((prev) => prev.filter((s) => s !== skill));
      return;
    }
    if (skills.length >= CANDIDATE_SKILLS_MAX) {
      setSkillError(`Pick up to ${CANDIDATE_SKILLS_MAX} skills.`);
      return;
    }
    setSkills((prev) => [...prev, skill]);
  }

  return (
    <form action={action} className="space-y-4">
      {state.error ? (
        <p className="rounded-lg border border-[#fecaca] bg-[#fffafa] px-3 py-2 text-[13px] text-[#b91c1c]" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p className="rounded-lg border border-[#a7f3d0] bg-[#ecfdf5] px-3 py-2 text-[13px] text-[#047857]">
          Profile saved.
        </p>
      ) : null}

      <div>
        <label className={labelClass} htmlFor="full_name">
          Full name
        </label>
        <input
          className={inputClass}
          id="full_name"
          name="full_name"
          type="text"
          autoComplete="name"
          defaultValue={profile.full_name ?? ''}
        />
      </div>
      <div>
        <label className={labelClass} htmlFor="phone">
          Phone
        </label>
        <input
          className={inputClass}
          id="phone"
          name="phone"
          type="tel"
          autoComplete="tel"
          defaultValue={profile.phone ?? ''}
        />
      </div>
      <div>
        <label className={labelClass} htmlFor="location">
          Location
        </label>
        <input
          className={inputClass}
          id="location"
          name="location"
          type="text"
          autoComplete="address-level2"
          defaultValue={profile.location ?? ''}
        />
      </div>
      <div>
        <label className={labelClass} htmlFor="current_title">
          Current role
        </label>
        <input
          className={inputClass}
          id="current_title"
          name="current_title"
          type="text"
          autoComplete="organization-title"
          placeholder="e.g. Product Designer"
          defaultValue={profile.current_title ?? ''}
        />
      </div>
      <div>
        <label className={labelClass} htmlFor="linkedin_url">
          LinkedIn
        </label>
        <input
          className={inputClass}
          id="linkedin_url"
          name="linkedin_url"
          type="url"
          inputMode="url"
          placeholder="https://linkedin.com/in/…"
          defaultValue={profile.linkedin_url ?? ''}
        />
      </div>
      <div>
        <label className={labelClass} htmlFor="portfolio_url">
          Portfolio / website
        </label>
        <input
          className={inputClass}
          id="portfolio_url"
          name="portfolio_url"
          type="url"
          inputMode="url"
          placeholder="https://…"
          defaultValue={profile.portfolio_url ?? ''}
        />
      </div>

      <div>
        <p className={labelClass}>Work persona</p>
        <p className="mt-1 text-[12px] text-[#9b9b9b]">
          Pick the vibe you bring to a team. Optional.
        </p>
        <input type="hidden" name="persona" value={persona} />
        <div className="mt-2 flex flex-wrap gap-2">
          {CANDIDATE_PERSONA_OPTIONS.map((opt) => {
            const active = persona === opt.emoji;
            return (
              <button
                key={opt.emoji}
                type="button"
                title={opt.label}
                onClick={() => setPersona(active ? '' : opt.emoji)}
                aria-pressed={active}
                className="flex h-10 w-10 items-center justify-center rounded-full text-[18px] transition-all duration-150 hover:scale-105"
                style={{
                  background: active
                    ? 'color-mix(in oklab, var(--org-brand-primary, #121212) 12%, var(--org-brand-bg, #faf9f6))'
                    : 'var(--org-brand-bg, #faf9f6)',
                  border: `2px solid ${active ? 'var(--org-brand-primary, #121212)' : '#d8d8d8'}`,
                }}
              >
                {opt.emoji}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <p className={labelClass}>
          Top skills{' '}
          <span className="font-normal text-[#9b9b9b]">(pick up to {CANDIDATE_SKILLS_MAX})</span>
        </p>
        {skills.map((skill) => (
          <input key={skill} type="hidden" name="skills" value={skill} />
        ))}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {CANDIDATE_SKILL_OPTIONS.map((skill) => {
            const active = skills.includes(skill);
            return (
              <button
                key={skill}
                type="button"
                onClick={() => toggleSkill(skill)}
                aria-pressed={active}
                className="rounded-full px-3 py-1 text-[12px] transition-all duration-150"
                style={{
                  background: active
                    ? 'color-mix(in oklab, var(--org-brand-primary, #121212) 12%, var(--org-brand-bg, #faf9f6))'
                    : 'var(--org-brand-bg, #faf9f6)',
                  border: `1px solid ${active ? 'var(--org-brand-primary, #121212)' : '#d8d8d8'}`,
                  color: active ? 'var(--org-brand-primary, #121212)' : '#6b6b6b',
                  fontWeight: active ? 600 : 400,
                }}
              >
                {skill}
              </button>
            );
          })}
        </div>
        {skillError ? (
          <p className="mt-1 text-[12px] text-[#b91c1c]" role="alert">
            {skillError}
          </p>
        ) : null}
      </div>

      <div className="pt-2">
        <SubmitButton />
      </div>
    </form>
  );
}
