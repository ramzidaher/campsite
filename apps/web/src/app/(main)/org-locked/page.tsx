import Link from 'next/link';

export default function OrgLockedPage() {
  return (
    <div className="mx-auto max-w-lg px-4 py-16">
      <h1 className="text-xl font-semibold text-zinc-100">Account locked</h1>
      <p className="mt-3 text-sm leading-relaxed text-zinc-400">
        Access to this organisation is temporarily locked. Billing or subscription updates may be required before you can
        continue. Contact your organisation admin or Campsite support if you need help.
      </p>
      <p className="mt-6 text-sm text-zinc-500">
        <Link href="/login" className="text-amber-400/90 underline-offset-4 hover:underline">
          Sign out
        </Link>{' '}
        to use another account, or wait until your organisation admin restores access.
      </p>
    </div>
  );
}
