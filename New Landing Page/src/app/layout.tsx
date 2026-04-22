import type { Metadata } from "next";
import { DM_Serif_Display, Inter } from "next/font/google";
import "./globals.css";
import { ClientBody } from "./ClientBody";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const dmSerif = DM_Serif_Display({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-dm-serif",
});

export const metadata: Metadata = {
  title: "Branding, Design & Webflow Development | CampSite",
  description:
    "At CampSite, we think, craft, and design bold websites for ambitious brands. We're experts in branding, creative design, and Webflow development.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${dmSerif.variable}`}>
      <head>
        <link rel="preconnect" href="https://ext.same-assets.com" />
      </head>
      <ClientBody>{children}</ClientBody>
    </html>
  );
}
