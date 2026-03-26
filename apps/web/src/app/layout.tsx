import type { Metadata } from 'next';
import './globals.css';
import { SentryInit } from '@/components/SentryInit';
import { DM_Serif_Display, Inter } from 'next/font/google';

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' });
const dmSerif = DM_Serif_Display({
  subsets: ['latin'],
  variable: '--font-auth-serif',
  weight: '400',
});

export const metadata: Metadata = {
  title: 'Campsite',
  description: 'Internal communications and staff management — Common Ground Studios Ltd',
  icons: {
    icon: [{ url: '/icon.svg', type: 'image/svg+xml' }],
    apple: [{ url: '/apple-icon.svg', type: 'image/svg+xml' }],
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
        <SentryInit />
        {children}
      </body>
    </html>
  );
}
