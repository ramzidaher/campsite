import Link from 'next/link';

import {
  SimpleStatusPage,
  simpleStatusOutlineButtonClass,
} from '@/components/tenant/SimpleStatusPage';
import { cn } from '@/lib/utils';

export default function NotFound() {
  return (
    <SimpleStatusPage
      badge="Error 404"
      title="Page not found"
      description="The page you requested does not exist or may have been moved."
    >
      <Link href="/dashboard" className={cn(simpleStatusOutlineButtonClass, 'mt-6')}>
        Back to dashboard
      </Link>
    </SimpleStatusPage>
  );
}
