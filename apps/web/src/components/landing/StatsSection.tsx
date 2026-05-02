'use client';

import { useEffect, useRef } from 'react';
import { animate, onScroll, stagger } from 'animejs';

const STATS = [
  { display: '500+', end: 500, suffix: '+', label: 'Teams running shifts on Campsite' },
  { display: '98%', end: 98, suffix: '%', label: 'Average message read rate' },
  { display: '< 5 min', end: 5, prefix: '< ', suffix: ' min', label: 'Average workspace setup time' },
];

export function StatsSection() {
  const sectionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      // Ensure items are visible without animation for reduced-motion users
      el.querySelectorAll<HTMLElement>('.stat-item').forEach((item) => {
        item.style.opacity = '1';
        item.style.transform = 'none';
      });
      return;
    }

    const items = Array.from(el.querySelectorAll<HTMLElement>('.stat-item'));
    const numberEls = Array.from(el.querySelectorAll<HTMLElement>('.stat-number'));
    let triggered = false;

    // Create the entry animation (paused — scroll observer controls playback)
    const entryAnim = animate(items, {
      opacity: [0, 1],
      translateY: [40, 0],
      duration: 700,
      delay: stagger(130),
      ease: 'outExpo',
      autoplay: false,
    });

    const scrollObs = onScroll({
      target: el,
      enter: { container: 'bottom', target: 'bottom' },
      onEnter: () => {
        if (triggered) return;
        triggered = true;

        // Play the stagger reveal
        entryAnim.play();

        // Count up each number, each with its own staggered delay
        STATS.forEach((stat, i) => {
          const numEl = numberEls[i];
          if (!numEl) return;
          const counter = { n: 0 };
          animate(counter, {
            n: [0, stat.end],
            duration: 1600,
            delay: i * 130 + 300,
            ease: 'outExpo',
            onUpdate: () => {
              const v = Math.round(counter.n);
              numEl.textContent = `${stat.prefix ?? ''}${v}${stat.suffix}`;
            },
            onComplete: () => {
              // Snap to exact final value in case of rounding
              numEl.textContent = stat.display;
            },
          });
        });

        scrollObs.revert();
      },
    });

    return () => {
      scrollObs.revert();
      entryAnim.revert();
    };
  }, []);

  return (
    <section
      ref={sectionRef}
      className="px-4 py-16 md:px-8 md:py-24 border-t border-[color:var(--lp-border)]"
    >
      <div className="mx-auto max-w-7xl">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-3 md:gap-0 md:divide-x md:divide-[color:var(--lp-border)]">
          {STATS.map((stat, i) => (
            <div
              key={i}
              className="stat-item px-0 md:px-12 first:pl-0 last:pr-0"
              style={{ opacity: 0, transform: 'translateY(40px)' }}
            >
              <div
                className="stat-number font-grot tabular-nums leading-none text-[color:var(--lp-foreground)]"
                style={{ fontSize: 'clamp(3rem, 7vw, 5.5rem)' }}
              >
                {stat.display}
              </div>
              <p className="font-mono mt-3 max-w-[22ch] text-[11px] leading-relaxed tracking-[0.1em] text-[color:var(--lp-text-muted)]">
                {stat.label}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
