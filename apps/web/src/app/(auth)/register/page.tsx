import { headers } from 'next/headers';
import Link from 'next/link';
import { RegisterWizard } from '@/components/RegisterWizard';

export default async function RegisterPage() {
  const h = await headers();
  const slug = h.get('x-campsite-org-slug');

  return (
    <div>
      <RegisterWizard initialOrgSlug={slug} />
      <p className="mt-8 text-center text-[13px] text-[#6b6b6b]">
        Already have an account?{' '}
        <Link href="/login" className="auth-link">
          Sign in
        </Link>
      </p>
    </div>
  );
}
