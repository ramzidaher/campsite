'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { useAnimeReveal } from '@/hooks/useAnimeReveal';

const ISSUES = [
  { quote: 'Can you re-send the rota? I cannot find it.', source: 'WhatsApp group' },
  { quote: 'Who approved Marcus’s holiday?', source: 'Someone’s inbox' },
  { quote: 'The new starter has not been set up yet.', source: 'Slack, probably' },
  { quote: 'Did anyone tell the team about the policy change?', source: 'A spreadsheet' },
  { quote: 'We had three applicants this week. I think.', source: 'Email thread' },
];

export function ProblemSection() {
  // Simple fade-up for the kicker label and the bottom panels
  const sectionRef = useAnimeReveal<HTMLElement>('[data-anime-reveal]', {
    staggerMs: 75,
    translateY: 24,
    threshold: 0.06,
  });

  // Separate ref for the quote block  gets the deep word-split treatment
  const chaosRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const chaos = chaosRef.current;
    if (!chaos) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const quoteEls = Array.from(chaos.querySelectorAll<HTMLElement>('.problem-quote'));
    if (!quoteEls.length) return;

    const splitters = quoteEls.map((el) => {
      const originalText = el.textContent ?? '';
      const words = originalText.split(/\s+/).filter(Boolean);
      const fragments: HTMLElement[] = [];
      el.textContent = '';
      words.forEach((word, index) => {
        const span = document.createElement('span');
        span.textContent = word;
        span.style.display = 'inline-block';
        span.style.opacity = '0';
        fragments.push(span);
        el.appendChild(span);
        if (index < words.length - 1) {
          el.appendChild(document.createTextNode(' '));
        }
      });
      return {
        words: fragments,
        revert: () => {
          el.textContent = originalText;
        },
      };
    });

    // Pre-hide all words + assign staggered delays that leave a visible gap between quotes
    const allWords: HTMLElement[] = [];
    let cursor = 80; // initial delay before first word
    splitters.forEach((s) => {
      s.words.forEach((w, wi) => {
        w.style.opacity = '0';
        w.style.display = 'inline-block'; // needed for translateY
        w.dataset.wd = String(cursor + wi * 22);
        allWords.push(w);
      });
      cursor += s.words.length * 22 + 90; // inter-quote pause
    });

    // Hide the row numbers + source tags too so they reveal together with the first word
    const sideTags = Array.from(chaos.querySelectorAll<HTMLElement>('.problem-index, .problem-source'));
    sideTags.forEach((t, i) => {
      t.style.opacity = '0';
      t.dataset.wd = String(i * 22); // approximate  aligns with first word of each row
    });

    let triggered = false;
    const observer = new IntersectionObserver(
      (entries) => {
        if (triggered || !entries.some((e) => e.isIntersecting)) return;
        triggered = true;
        observer.disconnect();

        // Animate all words using the precomputed per-word delay
        allWords.forEach((wordEl) => {
          wordEl.animate(
            [
              { opacity: 0, transform: 'translateY(12px)' },
              { opacity: 1, transform: 'translateY(0px)' },
            ],
            {
              duration: 560,
              delay: parseInt(wordEl.dataset.wd ?? '0', 10),
              easing: 'cubic-bezier(0.33, 1, 0.68, 1)',
              fill: 'forwards',
            }
          );
        });

        // Row side-labels fade in aligned to each quote
        sideTags.forEach((tagEl) => {
          tagEl.animate([{ opacity: 0 }, { opacity: 1 }], {
            duration: 400,
            delay: parseInt(tagEl.dataset.wd ?? '0', 10) + 60,
            easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
            fill: 'forwards',
          });
        });
      },
      { threshold: 0.08, rootMargin: '0px 0px -60px 0px' }
    );

    observer.observe(chaos);
    return () => {
      observer.disconnect();
      splitters.forEach((s) => s.revert());
    };
  }, []);

  return (
    <section ref={sectionRef} className="problem-section px-4 py-16 md:px-8 md:py-20">
      <h2 className="lp-sr-only">Operations problems we solve</h2>
      <div className="mx-auto max-w-7xl">
        <p data-anime-reveal className="font-mono mb-10 text-xs tracking-wider text-[color:var(--lp-text-muted)]">
          SOUND FAMILIAR?
        </p>

        <div ref={chaosRef} className="problem-chaos">
          {ISSUES.map((item, index) => (
            // No data-anime-reveal  the word-split useEffect owns this block
            <div key={item.quote} className="problem-line">
              <span className="problem-index">{String(index + 1).padStart(2, '0')}</span>
              <p className="problem-quote">{item.quote}</p>
              <span className="problem-source">{item.source}</span>
            </div>
          ))}
        </div>

        <div className="problem-pivot">
          <article data-anime-reveal className="problem-panel problem-panel-left">
            <p className="font-mono problem-eyebrow">The problem</p>
            <h3 className="problem-heading">Your team runs on tools that were never built for teams.</h3>
            <p className="problem-body">
              Most ops work lives in the gaps between apps, inboxes, and group chats. Nothing is tracked, nothing is
              owned, and as the team grows the operational drag compounds.
            </p>
            <div className="problem-actions">
              <Link href="/register" className="v5-btn-primary">Start your workspace</Link>
              <a href="#contact" className="problem-btn-outline">Book a demo</a>
            </div>
          </article>

          <article data-anime-reveal className="problem-panel problem-panel-right">
            <div>
              <p className="font-mono problem-eyebrow problem-eyebrow-fix">The fix</p>
              <h3 className="problem-heading problem-heading-fix">
                One place for everything your team actually needs.
              </h3>
              <p className="problem-body problem-body-fix">
                Announcements, rota, HR, hiring, and approvals in a single workspace your whole team can use from day
                one.
              </p>
            </div>
            <Link href="/login" className="problem-enter-link">
              Enter Camp &rarr;
            </Link>
          </article>
        </div>
      </div>
    </section>
  );
}
