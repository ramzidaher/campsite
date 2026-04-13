import Link from 'next/link';

export default function MaintenancePage() {
  return (
    <div className="mx-auto max-w-lg px-4 py-16">
      <h1 className="text-xl font-semibold text-zinc-100">Under maintenance</h1>
      <p className="mt-3 text-sm leading-relaxed text-zinc-400">
        This organisation is in maintenance mode. Please try again shortly. If this persists, contact your organisation
        admin.
      </p>
      <p className="mt-6 text-sm text-zinc-500">
        <Link href="/login" className="text-amber-400/90 underline-offset-4 hover:underline">
          Sign out
        </Link>
      </p>
    </div>
  );
}
