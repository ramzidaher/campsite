import Link from 'next/link';

export default function TrialEndedPage() {
  return (
    <div className="mx-auto max-w-lg px-4 py-16">
      <h1 className="text-xl font-semibold text-zinc-100">Trial ended</h1>
      <p className="mt-3 text-sm leading-relaxed text-zinc-400">
        Your organisation&apos;s trial period has ended. A subscription or billing step will be required to continue —
        online payments are not connected yet; your organisation admin can coordinate with Campsite to activate the
        account.
      </p>
      <p className="mt-6 text-sm text-zinc-500">
        <Link href="/login" className="text-amber-400/90 underline-offset-4 hover:underline">
          Sign out
        </Link>
      </p>
    </div>
  );
}
