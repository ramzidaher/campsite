import Link from 'next/link';
import { completeRegistrationProfileIfNeeded } from '@/lib/auth/completeRegistrationProfile';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

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

  const { data: profileRow } = await supabase.from('profiles').select('id').eq('id', user.id).maybeSingle();
  if (!profileRow) {
    const filled = await completeRegistrationProfileIfNeeded(supabase, user);
    if (!filled.ok) {
      return (
        <div className="mx-auto max-w-lg">
          <h1 className="text-xl font-semibold text-[var(--campsite-text)]">Couldn&apos;t finish setup</h1>
          <p className="mt-2 text-sm text-[var(--campsite-text-secondary)]">{filled.message}</p>
          <p className="mt-4 text-sm text-[var(--campsite-text-secondary)]">
            Ask an organisation admin to add you manually, or try registering again after signing out.
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
    const { data: after } = await supabase.from('profiles').select('id').eq('id', user.id).maybeSingle();
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
  }

  const emailVerified = Boolean(user.email_confirmed_at);
  const registrationError = sp.registration_error?.trim();

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="text-xl font-semibold text-[var(--campsite-text)]">Awaiting approval</h1>
      <p className="mt-2 text-sm text-[var(--campsite-text-secondary)]">
        Your account is pending verification by a manager in your department. You will receive an
        email once approved.
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
