import Link from 'next/link';
import { getPendingPageData } from '@/lib/pending/getPendingPageData';
import { redirect } from 'next/navigation';

import { retryEnsureRegistrationProfile } from './actions';

export default async function PendingPage({
  searchParams,
}: {
  searchParams: Promise<{ registration_error?: string }>;
}) {
  const sp = await searchParams;
  const pendingData = await getPendingPageData(sp);

  if (pendingData.kind === 'redirect') {
    redirect(pendingData.to);
  }

  if (pendingData.kind === 'setup_error') {
    return (
      <div className="mx-auto max-w-lg px-5 py-10 sm:px-[28px]">
        <h1 className="font-authSerif text-[22px] tracking-tight text-[#121212]">Couldn&apos;t finish setup</h1>
        <p className="mt-2 text-[13px] text-[#6b6b6b]">{pendingData.message}</p>
        {pendingData.orgCreator ? (
          <>
            <p className="mt-4 text-[13px] text-[#6b6b6b]">
              You created a new organisation - no manager approval is required. Often signing out and
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

  if (pendingData.kind === 'profile_missing') {
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

  const { emailVerified, registrationError } = pendingData;
  if (pendingData.kind === 'awaiting_approval') {
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
  return null;
}
