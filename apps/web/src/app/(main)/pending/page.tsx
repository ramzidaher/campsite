import Link from 'next/link';
import { getPendingPageData } from '@/lib/pending/getPendingPageData';
import { redirect } from 'next/navigation';

import {
  SimpleStatusPage,
  simpleStatusOutlineButtonClass,
} from '@/components/tenant/SimpleStatusPage';
import { cn } from '@/lib/utils';

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
      <SimpleStatusPage badge="Setup" title="Couldn&apos;t finish setup" description={pendingData.message}>
        {pendingData.orgCreator ? (
          <>
            <p className="mt-4 text-[13px] leading-relaxed text-[#6b6b6b]">
              You created a new organisation - no manager approval is required. Often signing out and
              back in fixes this immediately.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              <form action={retryEnsureRegistrationProfile}>
                <button type="submit" className={simpleStatusOutlineButtonClass}>
                  Retry workspace setup
                </button>
              </form>
              <Link href="/login" className={simpleStatusOutlineButtonClass}>
                Back to log in
              </Link>
            </div>
          </>
        ) : (
          <>
            <p className="mt-4 text-[13px] leading-relaxed text-[#6b6b6b]">
              Ask an organisation admin to add you manually, or try registering again after signing out.
            </p>
            <Link href="/login" className={cn(simpleStatusOutlineButtonClass, 'mt-6')}>
              Back to log in
            </Link>
          </>
        )}
      </SimpleStatusPage>
    );
  }

  if (pendingData.kind === 'profile_missing') {
    return (
      <SimpleStatusPage
        badge="Profile"
        title="Profile not found"
        description="Your account exists in Campsite, but there is no member profile linked yet. An organisation admin can add you from Admin → All members, or you can complete registration again with the same email after signing out."
      >
        <Link href="/login" className={cn(simpleStatusOutlineButtonClass, 'mt-6')}>
          Back to log in
        </Link>
      </SimpleStatusPage>
    );
  }

  const { emailVerified, registrationError } = pendingData;
  if (pendingData.kind === 'awaiting_approval') {
    return (
      <SimpleStatusPage
        badge="Pending"
        title="Awaiting approval"
        description="A manager in your organisation still needs to approve your membership before you can use Campsite. That is separate from confirming your email (see below if applicable). You will get an email when you have been approved."
      >
        {registrationError ? (
          <div
            className="status-banner-error mt-4 rounded-lg px-4 py-3 text-[13px]"
            role="alert"
          >
            {registrationError}
          </div>
        ) : null}
        {!emailVerified ? (
          <div
            className="status-banner-warning mt-4 rounded-lg px-4 py-3 text-[13px]"
            role="status"
          >
            Please verify your email address. Check your inbox for a confirmation link from Campsite.
          </div>
        ) : null}
        <p className="mt-6 text-[13px] text-[#6b6b6b]">
          Need help? Contact your organisation administrator.
        </p>
        <Link href="/login" className={cn(simpleStatusOutlineButtonClass, 'mt-4')}>
          Back to log in
        </Link>
      </SimpleStatusPage>
    );
  }
  return null;
}
