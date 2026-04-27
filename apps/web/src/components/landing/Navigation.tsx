'use client';

import Link from 'next/link';
import { CampsiteLogoMark } from '@/components/CampsiteLogoMark';

export function Navigation() {
  return (
    <header className="v5-nav-wrap">
      <nav className="v5-nav">
        <div className="v5-nav-left">
          <Link href="/" className="v5-logo-wrap">
            <CampsiteLogoMark className="v5-logo-mark" />
            <span className="v5-logo">Campsite</span>
          </Link>
        </div>
        <div className="v5-nav-middle">
          <a href="#contact" className="v5-nav-link v5-nav-talk">
            Let&apos;s talk
            <span className="v5-talk-popover font-mono" aria-hidden="true">
              QUICK CHAT?
            </span>
          </a>
        </div>
        <div className="v5-nav-right">
          <Link href="/login" className="v5-btn-fun">Enter Camp</Link>
        </div>
      </nav>
    </header>
  );
}
