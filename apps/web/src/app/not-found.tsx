import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="max-w-md">
      <h1 className="text-xl font-semibold text-[var(--campsite-text)]">Page not found</h1>
      <p className="mt-2 text-sm text-[var(--campsite-text-secondary)]">
        The page you requested does not exist.
      </p>
      <Link
        href="/"
        className="mt-4 inline-block text-sm font-medium text-[var(--campsite-accent)] underline"
      >
        Back to dashboard
      </Link>
    </div>
  );
}
