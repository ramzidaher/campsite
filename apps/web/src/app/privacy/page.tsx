import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy · Campsite',
  description: 'Privacy information for the Campsite app — Common Ground Studios Ltd',
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-16 text-[var(--campsite-text)]">
      <h1 className="text-2xl font-semibold">Privacy policy</h1>
      <p className="mt-4 text-sm text-[var(--campsite-text-secondary)]">
        This is a <strong>placeholder</strong> for App Store and Play submission. Replace with
        organisation-specific and jurisdiction-specific legal text before production launch.
      </p>
      <ul className="mt-6 list-inside list-disc space-y-2 text-sm text-[var(--campsite-text-secondary)]">
        <li>Data controller: Common Ground Studios Ltd (UK).</li>
        <li>
          Campsite processes account, organisational, and usage data to provide internal
          communications, rota, and staff discount verification.
        </li>
        <li>Contact: privacy@campsite.app (update before launch).</li>
      </ul>
      <p className="mt-8 text-sm">
        <Link href="/" className="text-emerald-400 hover:underline">
          ← Home
        </Link>
      </p>
    </div>
  );
}
