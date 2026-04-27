'use client';

import { FormEvent, useState } from 'react';
import { CampfireLoaderInline } from '@/components/CampfireLoaderInline';

export function CTASection() {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!email) return;
    setSubmitted(true);
  };

  return (
    <section id="contact" className="px-4 py-20 md:px-8 md:py-32">
      <div className="mx-auto max-w-3xl text-center">
        <h2 className="font-grot relative mx-auto max-w-[15ch] text-[clamp(2.2rem,7.2vw,4.6rem)] leading-[0.96]">
          Ready when your team is.
        </h2>
        <div className="mt-3 flex justify-center">
          <span className="cta-smoke-wrap relative inline-flex h-[84px] w-[84px] items-center justify-center overflow-visible align-middle md:h-[96px] md:w-[96px]">
            <CampfireLoaderInline
              label=""
              className="scale-[0.56] origin-center gap-0 py-0 [&>p]:hidden [&>span]:hidden"
            />
            <span className="pointer-events-none absolute left-[17%] top-[55%] h-3 w-3 rounded-full bg-black/20 cta-smoke-wisp" />
            <span className="pointer-events-none absolute left-[23%] top-[52%] h-2.5 w-2.5 rounded-full bg-black/15 cta-smoke-wisp cta-smoke-wisp-delay-1" />
            <span className="pointer-events-none absolute left-[29%] top-[58%] h-2 w-2 rounded-full bg-black/12 cta-smoke-wisp cta-smoke-wisp-delay-2" />
          </span>
        </div>

        <div className="mx-auto mt-4 max-w-2xl">
          <p className="mx-auto mb-8 max-w-[480px] text-base leading-relaxed text-[color:var(--lp-text-secondary)] md:text-lg">
            Get early access updates and a walkthrough invite tailored to your team setup.
          </p>

          <form onSubmit={onSubmit} className="cta-form">
            <label htmlFor="cta-email" className="lp-sr-only">Work email</label>
            <input
              id="cta-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@company.com"
              autoComplete="email"
              required
              className="cta-email-input"
            />
            <button type="submit" className="v5-btn-primary cta-submit-btn">Get early access</button>
          </form>
          {submitted ? (
            <p className="mt-3 text-sm text-[color:var(--lp-text-secondary)]">
              Thanks. We&apos;ll be in touch shortly with next steps.
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
