'use client';

import { useInHiringHub } from '@/app/(main)/hr/hiring/HiringHubContext';

/** Hides redundant page chrome when rendered under `/hr/hiring/*` (tabs already name the view). */
export function HideInHiringHub({ children }: { children: React.ReactNode }) {
  const inHub = useInHiringHub();
  if (inHub) return null;
  return <>{children}</>;
}
