import Link from 'next/link';

import {
  SimpleStatusPage,
  simpleStatusOutlineButtonClass,
} from '@/components/tenant/SimpleStatusPage';
import { cn } from '@/lib/utils';

type OrgStateOverlayProps = {
  badge?: string;
  title: string;
  message: string;
  actionHref?: string;
  actionLabel?: string;
  footerText?: string;
  liveMessage?: 'off' | 'polite' | 'assertive';
};

export function OrgStateOverlay({
  badge,
  title,
  message,
  actionHref,
  actionLabel,
  footerText,
  liveMessage = 'off',
}: OrgStateOverlayProps) {
  return (
    <section
      className="fixed inset-0 z-[220] flex items-center justify-center overflow-y-auto bg-[var(--campsite-bg)] p-4 sm:p-6"
      aria-live={liveMessage}
      aria-atomic="true"
      aria-labelledby="org-state-title"
      aria-describedby="org-state-description"
    >
      <SimpleStatusPage
        badge={badge}
        title={title}
        titleId="org-state-title"
        description={message}
        descriptionId="org-state-description"
        minHeight="none"
        className="py-8 sm:py-10"
        footer={footerText}
      >
        {actionHref && actionLabel ? (
          <Link href={actionHref} className={cn(simpleStatusOutlineButtonClass, 'mt-6')}>
            {actionLabel}
          </Link>
        ) : null}
      </SimpleStatusPage>
    </section>
  );
}
