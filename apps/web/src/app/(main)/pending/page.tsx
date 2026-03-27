import Link from 'next/link';
import {
  completeRegistrationProfileIfNeeded,
  syncRegistrationAvatarToProfileIfEmpty,
} from '@/lib/auth/completeRegistrationProfile';
import { isPlatformFounder } from '@/lib/platform/requirePlatformFounder';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

import { retryEnsureRegistrationProfile } from './actions';

export default async function PendingPage({
  searchParams,
}: {
  searchParams: Promise<{ registration_error?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    redirect('/login');
  }

  const founder = await isPlatformFounder(supabase, user.id);

  await syncRegistrationAvatarToProfileIfEmpty(supabase, user);

  let { data: profileRow } = await supabase
    .from('profiles')
    .select('id,status')
    .eq('id', user.id)
    .maybeSingle();
  if (!profileRow) {
    if (founder) {
      redirect('/founders');
    }
    const filled = await completeRegistrationProfileIfNeeded(supabase, user);
    if (!filled.ok) {
      const orgCreator = filled.kind === 'org_creator_pending';
      return (
        <div className="mx-auto max-w-lg">
          <h1 className="text-xl font-semibold text-[var(--campsite-text)]">Couldn&apos;t finish setup</h1>
          <p className="mt-2 text-sm text-[var(--campsite-text-secondary)]">{filled.message}</p>
          {orgCreator ? (
            <>
              <p className="mt-4 text-sm text-[var(--campsite-text-secondary)]">
                You created a new organisation — no manager approval is required. Often signing out and
                back in fixes this immediately.
              </p>
              <form action={retryEnsureRegistrationProfile} className="mt-6">
                <button
                  type="submit"
                  className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-[var(--campsite-accent)] px-4 text-sm font-medium text-white transition-opacity hover:opacity-90 sm:w-auto"
                >
                  Retry workspace setup
                </button>
              </form>
            </>
          ) : (
            <p className="mt-4 text-sm text-[var(--campsite-text-secondary)]">
              Ask an organisation admin to add you manually, or try registering again after signing out.
            </p>
          )}
          <Link
            href="/login"
            className="mt-4 inline-block text-sm font-medium text-[var(--campsite-accent)] underline"
          >
            Back to log in
          </Link>
        </div>
      );
    }
    const { data: after } = await supabase
      .from('profiles')
      .select('id,status')
      .eq('id', user.id)
      .maybeSingle();
    if (!after) {
      return (
        <div className="mx-auto max-w-lg">
          <h1 className="text-xl font-semibold text-[var(--campsite-text)]">Profile not found</h1>
          <p className="mt-2 text-sm text-[var(--campsite-text-secondary)]">
            Your account exists in Campsite, but there is no member profile linked yet. An organisation
            admin can add you from Admin → All members, or you can complete registration again with the
            same email after signing out.
          </p>
          <Link
            href="/login"
            className="mt-4 inline-block text-sm font-medium text-[var(--campsite-accent)] underline"
          >
            Back to log in
          </Link>
        </div>
      );
    }
    profileRow = after;
  }

  if (profileRow.status === 'active') {
    if (founder) {
      const { data: activeProf } = await supabase
        .from('profiles')
        .select('org_id')
        .eq('id', user.id)
        .maybeSingle();
      if (activeProf?.org_id) {
        redirect('/session-choice');
      }
      redirect('/founders');
    }
    redirect('/dashboard');
  }

  const emailVerified = Boolean(user.email_confirmed_at);
  const registrationError = sp.registration_error?.trim();

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="text-xl font-semibold text-[var(--campsite-text)]">Awaiting approval</h1>
      <p className="mt-2 text-sm text-[var(--campsite-text-secondary)]">
        A manager in your organisation still needs to approve your membership before you can use
        Campsite. That is separate from confirming your email (see below if applicable). You will
        get an email when you have been approved.
      </p>
      {registrationError ? (
        <div
          className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-[var(--campsite-text)]"
          role="alert"
        >
          {registrationError}
        </div>
      ) : null}
      {!emailVerified ? (
        <div
          className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-[var(--campsite-text)]"
          role="status"
        >
          Please verify your email address. Check your inbox for a confirmation link from Campsite.
        </div>
      ) : null}
      <p className="mt-6 text-sm text-[var(--campsite-text-secondary)]">
        Need help? Contact your organisation administrator.
      </p>
      <Link href="/login" className="mt-4 inline-block text-sm font-medium text-[var(--campsite-accent)] underline">
        Back to log in
      </Link>
    </div>
  );
}
