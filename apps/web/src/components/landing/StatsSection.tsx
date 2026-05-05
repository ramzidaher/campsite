'use client';

import { useEffect, useRef } from 'react';

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
    const rafIds: number[] = [];
    const runCounter = (stat: (typeof STATS)[number], numEl: HTMLElement, delayMs: number) => {
      const duration = 1600;
      const startAt = performance.now() + delayMs;
      const tick = (now: number) => {
        if (now < startAt) {
          rafIds.push(requestAnimationFrame(tick));
          return;
        }
        const progress = Math.min((now - startAt) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        const value = Math.round(stat.end * eased);
        numEl.textContent = `${stat.prefix ?? ''}${value}${stat.suffix}`;
        if (progress < 1) {
          rafIds.push(requestAnimationFrame(tick));
          return;
        }
        numEl.textContent = stat.display;
      };
      rafIds.push(requestAnimationFrame(tick));
    };

    const observer = new IntersectionObserver(
      (entries) => {
        if (triggered || !entries.some((entry) => entry.isIntersecting)) return;
        triggered = true;

        items.forEach((item, index) => {
          item.animate(
            [
              { opacity: 0, transform: 'translateY(40px)' },
              { opacity: 1, transform: 'translateY(0px)' },
            ],
            {
              duration: 700,
              delay: index * 130,
              easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
              fill: 'forwards',
            }
          );
        });

        STATS.forEach((stat, i) => {
          const numEl = numberEls[i];
          if (!numEl) return;
          runCounter(stat, numEl, i * 130 + 300);
        });

        observer.disconnect();
      },
      { threshold: 0.2, rootMargin: '0px 0px -10% 0px' }
    );

    observer.observe(el);

    return () => {
      observer.disconnect();
      rafIds.forEach((id) => cancelAnimationFrame(id));
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
