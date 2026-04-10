'use client';

import type { CandidateProfileFormState } from '@/app/(public)/jobs/me/profile/actions';
import { updateCandidateProfile } from '@/app/(public)/jobs/me/profile/actions';
import { useFormState, useFormStatus } from 'react-dom';

const initial: CandidateProfileFormState = { ok: false, error: null };

const labelClass = 'block text-[12px] font-medium text-[#505050]';
const inputClass =
  'mt-1 w-full rounded-lg border border-[#d8d8d8] bg-white px-3 py-2 text-[14px] text-[#121212] outline-none focus:border-[#008B60]';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-[#008B60] px-4 py-2 text-[13px] font-medium text-white hover:bg-[#007a52] disabled:opacity-60"
    >
      {pending ? 'Saving…' : 'Save profile'}
    </button>
  );
}

type Profile = {
  full_name: string | null;
  phone: string | null;
  location: string | null;
  linkedin_url: string | null;
  portfolio_url: string | null;
};

export function CandidateProfileForm({ profile }: { profile: Profile }) {
  const [state, action] = useFormState(updateCandidateProfile, initial);

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

      <div className="pt-2">
        <SubmitButton />
      </div>
    </form>
  );
}
