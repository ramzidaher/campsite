'use client';

import { createContext, useContext, type ReactNode } from 'react';

const OrgTimeZoneContext = createContext<string | null>(null);

export function OrgTimeZoneProvider({
  value,
  children,
}: {
  value: string | null;
  children: ReactNode;
}) {
  return <OrgTimeZoneContext.Provider value={value}>{children}</OrgTimeZoneContext.Provider>;
}

/** IANA timezone from shell bundle (`organisations.timezone`); null when unset (viewer-local formatting). */
export function useOrgTimeZone(): string | null {
  return useContext(OrgTimeZoneContext);
}
