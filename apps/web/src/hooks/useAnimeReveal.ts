'use client';

import { RefObject, useEffect, useRef } from 'react';

interface RevealOptions {
  /** Stagger interval in ms between each element */
  staggerMs?: number;
  /** Initial delay in ms before the stagger begins */
  delay?: number;
  /** Starting Y offset in px — pass 0 to animate opacity only */
  translateY?: number;
  /** IntersectionObserver threshold (0–1) */
  threshold?: number;
  /** Run immediately on mount instead of waiting for scroll */
  immediate?: boolean;
}

export function useAnimeReveal<T extends HTMLElement>(
  selector: string,
  options: RevealOptions = {}
): RefObject<T | null> {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const {
      staggerMs = 80,
      delay = 0,
      translateY = 28,
      threshold = 0.12,
      immediate = false,
    } = options;

    const targets = Array.from(el.querySelectorAll<HTMLElement>(selector));
    if (!targets.length) return;

    const run = () => {
      targets.forEach((target, index) => {
        target.animate(
          [
            { opacity: 0, transform: `translateY(${translateY}px)` },
            { opacity: 1, transform: 'translateY(0px)' },
          ],
          {
            duration: 750,
            delay: delay + index * staggerMs,
            easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
            fill: 'forwards',
          }
        );
      });
    };

    if (immediate) {
      run();
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          run();
          observer.disconnect();
        }
      },
      { threshold, rootMargin: '0px 0px -40px 0px' }
    );

    observer.observe(el);
    return () => observer.disconnect();
    // options are constants at call sites — safe to omit from deps
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return ref;
}
