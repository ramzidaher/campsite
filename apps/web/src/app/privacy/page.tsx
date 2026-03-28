import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy · Campsite',
  description: 'Privacy information for the Campsite app — Common Ground Studios Ltd',
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-2xl px-5 py-16 text-[#121212] sm:px-[28px]">
      <h1 className="font-authSerif text-[26px] leading-tight tracking-tight">Privacy policy</h1>
      <p className="mt-4 text-[13px] text-[#6b6b6b]">
        This is a <strong>placeholder</strong> for App Store and Play submission. Replace with
        organisation-specific and jurisdiction-specific legal text before production launch.
      </p>
      <ul className="mt-6 list-inside list-disc space-y-2 text-[13px] text-[#6b6b6b]">
        <li>Data controller: Common Ground Studios Ltd (UK).</li>
        <li>
          Campsite processes account, organisational, and usage data to provide internal
          communications, rota, and staff discount verification.
        </li>
        <li>Contact: privacy@campsite.app (update before launch).</li>
      </ul>
      <p className="mt-8 text-[13px]">
        <Link href="/" className="text-[#6b6b6b] underline underline-offset-2 hover:text-[#121212]">
          ← Home
        </Link>
      </p>
    </div>
  );
}
