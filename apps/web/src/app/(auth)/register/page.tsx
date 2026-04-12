import { headers } from 'next/headers';
import Link from 'next/link';
import { RegisterWizard } from '@/components/RegisterWizard';
import { loadPlatformLegalSettings } from '@/lib/legal/loadPlatformLegalSettings';
import { createClient } from '@/lib/supabase/server';

export default async function RegisterPage() {
  const h = await headers();
  const slug = h.get('x-campsite-org-slug');
  const supabase = await createClient();
  const legal = await loadPlatformLegalSettings(supabase);

  return (
    <div>
      <RegisterWizard initialOrgSlug={slug} initialLegalBundleVersion={legal.bundle_version} />
      <p className="mt-8 text-center text-[13px] text-[#6b6b6b]">
        Already have an account?{' '}
        <Link href="/login" className="auth-link">
          Sign in
        </Link>
      </p>
    </div>
  );
}
