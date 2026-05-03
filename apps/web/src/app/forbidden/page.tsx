import Link from 'next/link';

import {
  SimpleStatusPage,
  simpleStatusOutlineButtonClass,
} from '@/components/tenant/SimpleStatusPage';
import { cn } from '@/lib/utils';

export default function ForbiddenPage() {
  return (
    <SimpleStatusPage
      badge="Error 403"
      title="Access denied"
      description="You do not have access to this page. Ask an admin if you believe this is a mistake."
    >
      <Link href="/dashboard" className={cn(simpleStatusOutlineButtonClass, 'mt-6')}>
        Go to dashboard
      </Link>
    </SimpleStatusPage>
  );
}
