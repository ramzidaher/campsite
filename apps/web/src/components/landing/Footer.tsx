'use client';

import Link from 'next/link';
import { CampsiteLogoMark } from '@/components/CampsiteLogoMark';

export function Footer() {
  return (
    <footer className="border-t border-[color:var(--lp-border)] bg-[color:var(--lp-surface)]/40 px-4 py-12 md:px-8">
      <div className="mx-auto max-w-7xl">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-[1.3fr_1fr_1fr]">
          <div>
            <div className="mb-4 flex items-center gap-2.5">
              <CampsiteLogoMark className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg bg-[#292f33]" />
              <span className="font-grot text-[2rem] leading-none">Campsite</span>
            </div>
            <div className="mt-4 text-sm leading-relaxed text-[color:var(--lp-text-secondary)]">
              <p>Common Ground Studios Ltd</p>
              <p>London, United Kingdom</p>
              <p>Software Development & Product Studio</p>
              <p>Company No: 16987282</p>
              <p>Operating as: Campsite</p>
              <a href="mailto:hello@commongroundstudios.net" className="underline">hello@commongroundstudios.net</a>
              <p className="mt-4 text-xs text-[color:var(--lp-text-muted)]">
                © 2026 Common Ground Studios Ltd. Company No. 16987282. Registered in England and Wales.
              </p>
            </div>
          </div>

          <div>
            <p className="font-mono mb-4 text-xs tracking-wider text-[color:var(--lp-text-muted)]">PRODUCTS</p>
            <nav className="space-y-2 text-sm text-[color:var(--lp-text-secondary)]">
              <a href="#" className="block">Turf</a>
              <a href="/" className="block">Campsite</a>
              <a href="#" className="block">Early Access</a>
            </nav>
            <p className="font-mono mb-4 mt-7 text-xs tracking-wider text-[color:var(--lp-text-muted)]">COMPANY</p>
            <nav className="space-y-2 text-sm text-[color:var(--lp-text-secondary)]">
              <a href="#" className="block">About</a>
              <a href="#" className="block">Our Promise</a>
              <a href="#" className="block">Partnership</a>
            </nav>
          </div>

          <div>
            <p className="font-mono mb-4 text-xs tracking-wider text-[color:var(--lp-text-muted)]">SUPPORT</p>
            <nav className="space-y-2 text-sm text-[color:var(--lp-text-secondary)]">
              <a href="https://www.linkedin.com" className="block">LinkedIn</a>
            </nav>
            <p className="font-mono mb-4 mt-7 text-xs tracking-wider text-[color:var(--lp-text-muted)]">LEGAL</p>
            <nav className="space-y-2 text-sm text-[color:var(--lp-text-secondary)]">
              <a href="#" className="block">Company Info</a>
              <Link href="/privacy" className="block">Privacy</Link>
              <a href="#" className="block">Cookies</a>
              <Link href="/terms" className="block">Terms</Link>
            </nav>
          </div>
        </div>
      </div>
    </footer>
  );
}
