import type { Metadata } from 'next';
import './globals.css';
import { SentryInit } from '@/components/SentryInit';
import { AccessibilityPreferencesSync } from '@/components/AccessibilityPreferencesSync';
import { VercelAnalyticsGate } from '@/components/VercelAnalyticsGate';
import { VercelSpeedInsightsGate } from '@/components/VercelSpeedInsightsGate';
import { DM_Serif_Display, Inter } from 'next/font/google';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });
const dmSerif = DM_Serif_Display({
  subsets: ['latin'],
  variable: '--font-auth-serif',
  weight: '400',
});

const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL?.trim() || process.env.SITE_URL?.trim() || 'https://camp-site.co.uk';

export const metadata: Metadata = {
  title: 'Campsite',
  description: 'Internal communications and staff management - Common Ground Studios Ltd',
  metadataBase: new URL(siteUrl),
  icons: {
    icon: [
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/icon-64.png', sizes: '64x64', type: 'image/png' },
      { url: '/favicon.svg', type: 'image/svg+xml' },
    ],
    shortcut: [{ url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' }],
    apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
  },
  openGraph: {
    type: 'website',
    siteName: 'Campsite',
    title: 'Campsite',
    description: 'Internal communications and staff management - Common Ground Studios Ltd',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Campsite',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Campsite',
    description: 'Internal communications and staff management - Common Ground Studios Ltd',
    images: ['/og-image.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} ${dmSerif.variable} min-h-screen font-sans antialiased`}>
        <a href="#main-content" className="skip-link">
          Skip to main content
        </a>
        <SentryInit />
        <AccessibilityPreferencesSync />
        <VercelAnalyticsGate />
        <VercelSpeedInsightsGate />
        {children}
      </body>
    </html>
  );
}
