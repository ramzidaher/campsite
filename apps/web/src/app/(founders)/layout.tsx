import type { Metadata } from 'next';
import { Instrument_Serif, Inter } from 'next/font/google';
import { GlobalActionFeedbackBridge } from '@/components/providers/GlobalActionFeedbackBridge';

import '@/components/founders/founders-hq.css';

const fhInter = Inter({
  subsets: ['latin'],
  variable: '--fh-sans',
});

const fhSerif = Instrument_Serif({
  subsets: ['latin'],
  variable: '--fh-serif',
  weight: '400',
});

export const metadata: Metadata = {
  title: 'Campsite - Founder HQ',
  description: 'Platform founder console',
};

export default function FoundersLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`founder-hq-root ${fhInter.variable} ${fhSerif.variable}`}>
      <GlobalActionFeedbackBridge />
      {children}
    </div>
  );
}
