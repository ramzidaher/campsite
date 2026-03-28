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
        <div className="mx-auto max-w-lg px-5 py-10 sm:px-[28px]">
          <h1 className="font-authSerif text-[22px] tracking-tight text-[#121212]">Couldn&apos;t finish setup</h1>
          <p className="mt-2 text-[13px] text-[#6b6b6b]">{filled.message}</p>
          {orgCreator ? (
            <>
              <p className="mt-4 text-[13px] text-[#6b6b6b]">
                You created a new organisation — no manager approval is required. Often signing out and
                back in fixes this immediately.
              </p>
              <form action={retryEnsureRegistrationProfile} className="mt-6">
                <button
                  type="submit"
                  className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-[#121212] px-4 text-[13px] font-medium text-[#faf9f6] transition-opacity hover:opacity-90 sm:w-auto"
                >
                  Retry workspace setup
                </button>
              </form>
            </>
          ) : (
            <p className="mt-4 text-[13px] text-[#6b6b6b]">
              Ask an organisation admin to add you manually, or try registering again after signing out.
            </p>
          )}
          <Link
            href="/login"
            className="mt-4 inline-block text-[13px] font-medium text-[#121212] underline underline-offset-2 hover:text-[#000]"
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
        <div className="mx-auto max-w-lg px-5 py-10 sm:px-[28px]">
          <h1 className="font-authSerif text-[22px] tracking-tight text-[#121212]">Profile not found</h1>
          <p className="mt-2 text-[13px] text-[#6b6b6b]">
            Your account exists in Campsite, but there is no member profile linked yet. An organisation
            admin can add you from Admin → All members, or you can complete registration again with the
            same email after signing out.
          </p>
          <Link
            href="/login"
            className="mt-4 inline-block text-[13px] font-medium text-[#121212] underline underline-offset-2 hover:text-[#000]"
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
    <div className="mx-auto max-w-lg px-5 py-10 sm:px-[28px]">
      <h1 className="font-authSerif text-[22px] tracking-tight text-[#121212]">Awaiting approval</h1>
      <p className="mt-2 text-[13px] text-[#6b6b6b]">
        A manager in your organisation still needs to approve your membership before you can use
        Campsite. That is separate from confirming your email (see below if applicable). You will
        get an email when you have been approved.
      </p>
      {registrationError ? (
        <div
          className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] text-red-950"
          role="alert"
        >
          {registrationError}
        </div>
      ) : null}
      {!emailVerified ? (
        <div
          className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-950"
          role="status"
        >
          Please verify your email address. Check your inbox for a confirmation link from Campsite.
        </div>
      ) : null}
      <p className="mt-6 text-[13px] text-[#6b6b6b]">
        Need help? Contact your organisation administrator.
      </p>
      <Link
        href="/login"
        className="mt-4 inline-block text-[13px] font-medium text-[#121212] underline underline-offset-2 hover:text-[#000]"
      >
        Back to log in
      </Link>
    </div>
  );
}
