'use client';

import { createContext, useContext } from 'react';

const HiringHubContext = createContext(false);

export function HiringHubProvider({ children }: { children: React.ReactNode }) {
  return <HiringHubContext.Provider value={true}>{children}</HiringHubContext.Provider>;
}

export function useInHiringHub(): boolean {
  return useContext(HiringHubContext);
}
