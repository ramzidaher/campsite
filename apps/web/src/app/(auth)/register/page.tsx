import { headers } from 'next/headers';
import Link from 'next/link';
import { RegisterWizard } from '@/components/RegisterWizard';
import { loadPlatformLegalSettings } from '@/lib/legal/loadPlatformLegalSettings';
import { createClient } from '@/lib/supabase/server';

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string }>;
}) {
  const h = await headers();
  const slug = h.get('x-campsite-org-slug');
  const sp = await searchParams;
  const inviteToken = typeof sp.invite === 'string' ? sp.invite : null;
  const supabase = await createClient();
  const legal = await loadPlatformLegalSettings(supabase);

  return (
    <div>
      <RegisterWizard
        initialOrgSlug={slug}
        initialInviteToken={inviteToken}
        initialLegalBundleVersion={legal.bundle_version}
      />
      <p className="mt-8 text-center campsite-body text-[#6b6b6b]">
        Already have an account?{' '}
        <Link
          href="/login"
          className="font-medium text-[#e8622a] underline underline-offset-[3px] decoration-[#e8622a]/45 hover:decoration-[#e8622a]"
        >
          Sign in!
        </Link>
      </p>
    </div>
  );
}
