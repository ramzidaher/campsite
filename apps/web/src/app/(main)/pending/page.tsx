import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';

export default async function PendingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return null;
  }
  const emailVerified = Boolean(user.email_confirmed_at);

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="text-xl font-semibold text-[var(--campsite-text)]">Awaiting approval</h1>
      <p className="mt-2 text-sm text-[var(--campsite-text-secondary)]">
        Your account is pending verification by a manager in your department. You will receive an
        email once approved.
      </p>
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
