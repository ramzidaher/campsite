'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

const COOKIE_CONSENT_KEY = 'campsite_cookie_consent_v2';

export function CookieBanner() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    try {
      const consent = window.localStorage.getItem(COOKIE_CONSENT_KEY);
      setIsVisible(consent !== 'accepted');
    } catch {
      setIsVisible(true);
    }
  }, []);

  const acceptCookies = () => {
    try {
      window.localStorage.setItem(COOKIE_CONSENT_KEY, 'accepted');
    } catch {
      // Fail open: banner still hides for this session.
    }
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <div className="cookie-banner fixed left-4 z-50 max-w-sm rounded-2xl p-5 text-[color:var(--lp-foreground)]">
      <p className="font-mono cookie-banner-kicker mb-2 text-[10px] tracking-[0.12em]">
        Privacy
      </p>
      <p className="cookie-banner-copy mb-4 text-sm">
        We care about your data, and we&apos;d use cookies only to improve your experience. By using this website, you
        accept our <Link href="/legal" className="cookie-banner-link">Cookies Policy</Link>.
      </p>
      <div className="cookie-banner-actions">
        <button type="button" onClick={acceptCookies} className="font-mono cookie-banner-accept">
          Accept cookies
        </button>
        <button type="button" onClick={() => setIsVisible(false)} className="font-mono cookie-banner-dismiss">
          Not now
        </button>
      </div>
    </div>
  );
}
