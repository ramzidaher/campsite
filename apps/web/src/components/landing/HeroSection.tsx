'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { useAnimeReveal } from '@/hooks/useAnimeReveal';

export function HeroSection() {
  const heroCardsRef = useRef<HTMLDivElement | null>(null);
  const heroLeftRef = useAnimeReveal<HTMLDivElement>('[data-anime-reveal]', {
    immediate: true,
    staggerMs: 110,
    delay: 60,
    translateY: 22,
  });

  useEffect(() => {
    const cards = heroCardsRef.current;
    if (!cards || typeof window === 'undefined') return;

    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    let rafId = 0;

    const writeParallax = () => {
      const value = media.matches ? 0 : Math.min(window.scrollY, 420);
      cards.style.setProperty('--hero-parallax', `${value}px`);
      rafId = 0;
    };

    const onScroll = () => {
      if (rafId) return;
      rafId = window.requestAnimationFrame(writeParallax);
    };

    const onMotionPrefChange = () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      writeParallax();
    };

    writeParallax();
    window.addEventListener('scroll', onScroll, { passive: true });
    media.addEventListener('change', onMotionPrefChange);

    // Stagger the UI cards in  opacity only, so parallax transforms are untouched
    if (!media.matches) {
      const cardEls = Array.from(cards.querySelectorAll<HTMLElement>('.v5-ui-card'));
      if (cardEls.length) {
        cardEls.forEach((cardEl, index) => {
          cardEl.animate([{ opacity: 0 }, { opacity: 1 }], {
            duration: 900,
            delay: 280 + index * 180,
            easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
            fill: 'forwards',
          });
        });
      }
    }

    return () => {
      window.removeEventListener('scroll', onScroll);
      media.removeEventListener('change', onMotionPrefChange);
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, []);

  const handleSeeHowItWorks = () => {
    document.getElementById('statement')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <section className="v5-hero-shell">
      <div className="v5-hero">
        <div ref={heroLeftRef} className="v5-hero-left">
          <h1 data-anime-reveal className="v5-hero-title">
            Run your team.
            <em> Not your tools.</em>
          </h1>
          <p data-anime-reveal className="v5-hero-desc">
            Replace daily coordination chaos with one clear workflow your whole team can follow from shift planning to
            people ops.
          </p>
          <div data-anime-reveal className="v5-hero-actions">
            <Link href="/register" className="v5-btn-primary">Start your workspace</Link>
            <button type="button" className="v5-btn-secondary" onClick={handleSeeHowItWorks}>See how it works</button>
          </div>
        </div>

        <div ref={heroCardsRef} className="v5-hero-right">
          <div className="v5-ui-card v5-card-announcement v5-card-parallax-1">
            <div className="v5-card-tag">Announcement</div>
            <div className="v5-card-title">New shift policy posted</div>
            <div className="v5-card-meta">Posted by Ops · All front-of-house staff</div>
            <div className="v5-avatars">
              <div className="v5-avatar v5-av1">KL</div>
              <div className="v5-avatar v5-av2">MB</div>
              <div className="v5-avatar v5-av3">TH</div>
              <div className="v5-avatar v5-av4">+14</div>
              <span className="v5-card-label">17 recipients · 12 read</span>
            </div>
          </div>

          <div className="v5-ui-card v5-card-rota v5-card-parallax-2">
            <div className="v5-card-tag">Today&apos;s rota</div>
            <div className="v5-rota-row"><span>Katie L.</span><span>09:00-17:00</span></div>
            <div className="v5-rota-row"><span>Marcus B.</span><span>12:00-20:00</span></div>
            <div className="v5-rota-row"><span>Tara H.</span><span className="v5-rota-off">Day off</span></div>
            <div className="v5-rota-row"><span>Owen R.</span><span>14:00-22:00</span></div>
          </div>

          <div className="v5-ui-card v5-card-approval v5-card-parallax-3">
            <div className="v5-card-row">
              <div>
                <div className="v5-card-title">Holiday request</div>
                <div className="v5-card-meta">Submitted by Marcus B.</div>
              </div>
              <span className="v5-status-badge">Pending</span>
            </div>
            <div className="v5-card-meta-row"><span>Dates</span><strong>14-18 Jul · 5 days</strong></div>
            <div className="v5-card-meta-row"><span>Cover arranged</span><strong>Yes</strong></div>
            <div className="v5-card-actions">
              <button type="button" className="v5-card-action">Decline</button>
              <button type="button" className="v5-card-action v5-card-action-accent">Approve</button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
