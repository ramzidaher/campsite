'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { CampfireLoaderInline } from '@/components/CampfireLoaderInline';
import { CampsiteLogoMark } from '@/components/CampsiteLogoMark';

function Navigation() {
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
          <span className="v5-nav-link v5-nav-talk">Let&apos;s talk</span>
        </div>
        <div className="v5-nav-right">
          <Link href="/login" className="v5-btn-fun">Enter Camp</Link>
        </div>
      </nav>
    </header>
  );
}

function Clock() {
  const [time, setTime] = useState('');
  const location = 'LONDON, UK';

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const timeStr = now.toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        timeZone: 'Europe/London',
      });
      setTime(timeStr);
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  return <div className="font-mono">{location} {time}</div>;
}

function BottomLeftTagline() {
  const taglines = [
    'BY PEOPLE, FOR PEOPLE OPERATIONS.',
    'BUILT BY PEOPLE, FOR PEOPLE TEAMS.',
    'PEOPLE OPS, MADE BY ACTUAL PEOPLE.',
    'FOR PEOPLE TEAMS, BY PEOPLE PEOPLE.',
    'LESS ADMIN. MORE ACTUAL PEOPLE.',
    'HR, BUT MAKE IT HUMAN.',
    'KEEP THE HUMANS. DROP THE CHAOS.',
    'PEOPLE STUFF, WITHOUT THE STUFFINESS.',
    'BY PEOPLE. FOR PEOPLE. ZERO NONSENSE.',
    'YOUR TEAM RUNS ON PEOPLE, NOT SPREADSHEETS.',
    'MADE FOR PEOPLE WHO MANAGE PEOPLE.',
    'WE PUT THE "HUMAN" BACK IN HR.',
  ];
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(Math.floor(Math.random() * taglines.length));
  }, [taglines.length]);

  return <p className="font-mono">{taglines[index]}</p>;
}

function HeroSection() {
  const [scrollY, setScrollY] = useState(0);
  const [parallaxEnabled, setParallaxEnabled] = useState(true);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const updateReducedMotion = () => setParallaxEnabled(!media.matches);
    updateReducedMotion();

    let rafId = 0;
    const onScroll = () => {
      if (rafId) return;
      rafId = window.requestAnimationFrame(() => {
        // Keep motion bounded so cards do not drift too far.
        setScrollY(Math.min(window.scrollY, 420));
        rafId = 0;
      });
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    media.addEventListener('change', updateReducedMotion);

    return () => {
      window.removeEventListener('scroll', onScroll);
      media.removeEventListener('change', updateReducedMotion);
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, []);

  const parallax = parallaxEnabled ? scrollY : 0;

  return (
    <section className="v5-hero-shell">
      <div className="v5-hero">
        <div className="v5-hero-left">
          <h1 className="v5-hero-title">
            Run your team.
            <em> Not your tools.</em>
          </h1>
          <p className="v5-hero-desc">
            CampSite brings announcements, rota, HR, hiring, and approvals into one workspace so your team
            always knows what is going on.
          </p>
          <div className="v5-hero-actions">
            <Link href="/register" className="v5-btn-primary">Start your workspace -&gt;</Link>
            <button type="button" className="v5-btn-secondary">See how it works</button>
          </div>
        </div>
        <div className="v5-hero-right">
          <div
            className="v5-ui-card v5-card-announcement"
            style={{ transform: `translate3d(${parallax * -0.03}px, ${parallax * -0.12}px, 0)` }}
          >
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

          <div
            className="v5-ui-card v5-card-rota"
            style={{ transform: `translate3d(${parallax * 0.04}px, ${parallax * -0.18}px, 0)` }}
          >
            <div className="v5-card-tag">Today&apos;s rota</div>
            <div className="v5-rota-row"><span>Katie L.</span><span>09:00-17:00</span></div>
            <div className="v5-rota-row"><span>Marcus B.</span><span>12:00-20:00</span></div>
            <div className="v5-rota-row"><span>Tara H.</span><span className="v5-rota-off">Day off</span></div>
            <div className="v5-rota-row"><span>Owen R.</span><span>14:00-22:00</span></div>
          </div>

          <div
            className="v5-ui-card v5-card-approval"
            style={{ transform: `translate3d(${parallax * -0.05}px, ${parallax * -0.08}px, 0)` }}
          >
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
              <button type="button" className="v5-card-action v5-card-action-accent">Approve -&gt;</button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function FeaturedClientSection() {
  return (
    <section className="px-4 py-8 md:px-8">
      <div className="mx-auto max-w-7xl">
        <div
          className="relative flex w-full aspect-[16/9] items-center justify-center overflow-hidden rounded-lg md:aspect-[21/9]"
          style={{ backgroundColor: 'var(--lp-surface)' }}
        >
          <div
            className="flex h-32 w-32 items-center justify-center rounded-full border md:h-48 md:w-48"
            style={{
              backgroundColor: 'var(--lp-background)',
              borderColor: 'var(--lp-border)',
            }}
          >
            <svg viewBox="0 0 200 50" className="w-24 md:w-36">
              <text x="50%" y="50%" dominantBaseline="middle" textAnchor="middle" className="font-grot" style={{ fontSize: '40px', fill: 'var(--lp-foreground)' }}>
                Qonto
              </text>
            </svg>
          </div>
        </div>
      </div>
    </section>
  );
}

function StatementSection() {
  const pillars = [
    {
      title: 'COMMUNICATIONS',
      kicker: 'Broadcasts',
      body: 'Share company updates with clear ownership, audience targeting, and visibility on what has been read.',
    },
    {
      title: 'SCHEDULING',
      kicker: 'Rota & Attendance',
      body: 'Keep shifts, attendance, and leave aligned so managers can plan confidently without spreadsheet chaos.',
    },
    {
      title: 'RECRUITMENT',
      kicker: 'Hiring Flow',
      body: 'Move from applicants to interviews to offers in one connected workflow that everyone can follow.',
    },
    {
      title: 'PEOPLE OPS',
      kicker: 'Records & Reviews',
      body: 'Run day-to-day people operations in one place with consistent data, context, and accountability.',
    },
    {
      title: 'PERFORMANCE',
      kicker: 'Cycle Management',
      body: 'Track review cycles, actions, and follow-ups so growth conversations do not get lost over time.',
    },
  ];
  const [activeIndex, setActiveIndex] = useState(2);

  return (
    <section className="px-4 py-16 md:px-8 md:py-20">
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-10 lg:grid-cols-[1.15fr_0.85fr] lg:gap-14">
        <div className="space-y-1">
          {pillars.map((item, index) => {
            const active = index === activeIndex;
            return (
              <button
                key={item.title}
                type="button"
                onMouseEnter={() => setActiveIndex(index)}
                onFocus={() => setActiveIndex(index)}
                onClick={() => setActiveIndex(index)}
                className="font-grot block w-full text-left text-[clamp(2.4rem,9vw,8rem)] leading-[0.9] transition-colors"
                style={{
                  color: active ? 'var(--lp-foreground)' : 'color-mix(in srgb, var(--lp-foreground) 20%, var(--lp-background))',
                }}
              >
                {item.title}
              </button>
            );
          })}
        </div>

        <div className="flex items-center lg:justify-start">
          <div className="max-w-md">
            <p className="font-mono mb-3 text-xs tracking-wider text-[color:var(--lp-text-muted)]">
              {pillars[activeIndex]?.kicker}
            </p>
            <p className="text-[22px] leading-[1.35] text-[color:var(--lp-text-secondary)]">
              {pillars[activeIndex]?.body}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function ProblemSection() {
  const issues = [
    { quote: 'Can you re-send the rota? I cannot find it.', source: 'WhatsApp group' },
    { quote: 'Who approved Marcus’s holiday?', source: 'Someone’s inbox' },
    { quote: 'The new starter has not been set up yet.', source: 'Slack, probably' },
    { quote: 'Did anyone tell the team about the policy change?', source: 'A spreadsheet' },
    { quote: 'We had three applicants this week. I think.', source: 'Email thread' },
  ];

  return (
    <section className="problem-section px-4 py-16 md:px-8 md:py-20">
      <div className="mx-auto max-w-7xl">
        <p className="font-mono mb-10 text-xs tracking-wider text-[color:var(--lp-text-muted)]">SOUND FAMILIAR?</p>

        <div className="problem-chaos">
          {issues.map((item, index) => (
            <div key={item.quote} className="problem-line">
              <span className="problem-index">{String(index + 1).padStart(2, '0')}</span>
              <p className="problem-quote">{item.quote}</p>
              <span className="problem-source">{item.source}</span>
            </div>
          ))}
        </div>

        <div className="problem-pivot">
          <article className="problem-panel problem-panel-left">
            <p className="font-mono problem-eyebrow">The problem</p>
            <h3 className="problem-heading">Your team runs on tools that were never built for teams.</h3>
            <p className="problem-body">
              Most ops work lives in the gaps between apps, inboxes, and group chats. Nothing is tracked, nothing
              is owned, and as the team grows the operational drag compounds.
            </p>
            <div className="problem-actions">
              <Link href="/register" className="v5-btn-primary">Start your workspace</Link>
            </div>
            <Link href="#contact" className="problem-secondary-link">Book a demo</Link>
          </article>

          <article className="problem-panel problem-panel-right">
            <div>
              <p className="font-mono problem-eyebrow problem-eyebrow-fix">The fix</p>
              <h3 className="problem-heading problem-heading-fix">One place for everything your team actually needs.</h3>
              <p className="problem-body problem-body-fix">
                Announcements, rota, HR, hiring, and approvals in a single workspace your whole team can use from
                day one.
              </p>
            </div>
            <Link href="/login" className="v5-btn-fun problem-enter-btn">Enter Camp</Link>
          </article>
        </div>
      </div>
    </section>
  );
}

function CTASection() {
  return (
    <section id="contact" className="px-4 py-20 md:px-8 md:py-32">
      <div className="mx-auto max-w-6xl">
        <h2 className="font-grot relative text-[clamp(3rem,10vw,8rem)] leading-[0.9]">
          <span className="inline-flex items-center gap-4">LET&apos;S WORK</span>
          <br />
          <span className="inline-flex items-center gap-4">
            <span className="relative inline-flex h-[92px] w-[92px] items-center justify-center overflow-visible align-middle md:h-[108px] md:w-[108px]">
              <CampfireLoaderInline
                label=""
                className="scale-[0.62] gap-0 py-0 origin-center [&>p]:hidden [&>span]:hidden"
              />
            </span>
            TOGETHER
          </span>
          <span className="pointer-events-none absolute left-[17%] top-[55%] h-3 w-3 rounded-full bg-black/20 cta-smoke-wisp" />
          <span className="pointer-events-none absolute left-[23%] top-[52%] h-2.5 w-2.5 rounded-full bg-black/15 cta-smoke-wisp cta-smoke-wisp-delay-1" />
          <span className="pointer-events-none absolute left-[29%] top-[58%] h-2 w-2 rounded-full bg-black/12 cta-smoke-wisp cta-smoke-wisp-delay-2" />
        </h2>

        <div className="mt-12 max-w-2xl">
          <p className="mb-2 font-grot text-[clamp(1.5rem,3.2vw,2.25rem)] leading-[1.05]">
            Internal communications
            <br />
            that teams actually use.
          </p>
          <p className="mb-8 max-w-xl text-base leading-relaxed text-[color:var(--lp-text-secondary)] md:text-lg">
            Campsite gives managers and teams one clear place for updates, coordination, and day-to-day people operations.
          </p>
        </div>
      </div>
    </section>
  );
}

function Footer() {
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

function CookieBanner() {
  const [isVisible, setIsVisible] = useState(false);
  if (!isVisible) return null;
  return (
    <div className="cookie-banner fixed bottom-4 left-4 z-50 max-w-sm rounded-lg p-6 text-[color:var(--lp-foreground)]">
      <p className="mb-4 text-sm">
        We care about your data, and we&apos;d use cookies only to improve your experience. By using this website, you accept our{' '}
        <Link href="/legal" className="underline">Cookies Policy</Link>.
      </p>
      <button type="button" onClick={() => setIsVisible(false)} className="font-mono flex items-center gap-2 text-xs tracking-wider">
        ACCEPT COOKIES
      </button>
    </div>
  );
}

export function LandingPage() {
  return (
    <div className="landing-page min-h-screen bg-[color:var(--lp-background)] text-[color:var(--lp-foreground)]">
      <Navigation />
      <div className="v5-bottom-bar">
        <BottomLeftTagline />
        <Clock />
      </div>
      <main className="min-h-screen">
        <HeroSection />
        <StatementSection />
        <ProblemSection />
        <CTASection />
        <Footer />
      </main>
      <CookieBanner />

      <style jsx global>{`
        .landing-page {
          --lp-background: var(--campsite-bg);
          --lp-surface: var(--campsite-surface);
          --lp-foreground: var(--campsite-text);
          --lp-text-secondary: var(--campsite-text-secondary);
          --lp-text-muted: var(--campsite-text-muted);
          --lp-border: var(--campsite-border);
          --lp-accent: #121212;
          --problem-panel-left-bg: linear-gradient(180deg, #f7f4ef 0%, #f1ece5 100%);
          --problem-panel-right-bg: linear-gradient(180deg, #f5ede7 0%, #f0e5dc 100%);
          --problem-fix-eyebrow: #a24d2a;
          --problem-fix-heading: #2b2019;
          --problem-fix-body: rgba(43, 32, 25, 0.76);
        }
        body.dark .landing-page {
          --lp-background: #121212;
          --lp-surface: #1a1a1a;
          --lp-foreground: #faf9f6;
          --lp-text-secondary: #808080;
          --lp-text-muted: #b0b0b0;
          --lp-border: #2a2a2a;
          --lp-accent: #faf9f6;
          --problem-panel-left-bg: linear-gradient(180deg, #121110 0%, #100f0e 100%);
          --problem-panel-right-bg: linear-gradient(180deg, #1f1713 0%, #1a1310 100%);
          --problem-fix-eyebrow: #e7a788;
          --problem-fix-heading: #f7e8dd;
          --problem-fix-body: rgba(247, 232, 221, 0.76);
        }
        .landing-page .font-grot {
          font-family: var(--font-auth-serif), Georgia, ui-serif, serif;
          font-weight: 400;
          letter-spacing: -0.03em;
          line-height: 1;
        }
        .landing-page .font-mono {
          font-family: var(--font-sans), ui-sans-serif, system-ui, sans-serif;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          font-size: 11.5px;
          font-weight: 600;
          line-height: 1.2;
        }
        .landing-page a { transition: opacity 0.2s ease; }
        .landing-page a:hover { opacity: 0.7; }
        @keyframes lp-marquee {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        @keyframes cta-smoke-rise {
          0% { transform: translateY(0) scale(1); opacity: 0; }
          15% { opacity: 0.45; }
          100% { transform: translateY(-42px) translateX(7px) scale(1.7); opacity: 0; }
        }
        .landing-page .cta-smoke-wisp {
          filter: blur(2px);
          animation: cta-smoke-rise 2.4s ease-out infinite;
        }
        .landing-page .cta-smoke-wisp-delay-1 { animation-delay: 0.7s; }
        .landing-page .cta-smoke-wisp-delay-2 { animation-delay: 1.4s; }
        .landing-page .animate-marquee { animation: lp-marquee 20s linear infinite; }
        .landing-page .underline-hover {
          text-decoration: underline;
          text-underline-offset: 4px;
          text-decoration-thickness: 3px;
        }
        .landing-page .project-card { transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1); }
        .landing-page .project-card:hover { transform: scale(1.02); }
        .landing-page .hero-image { transition: transform 0.6s cubic-bezier(0.16, 1, 0.3, 1); }
        .landing-page .cookie-banner {
          backdrop-filter: blur(10px);
          background: var(--lp-surface);
          border: 1px solid var(--lp-border);
        }
        .landing-page .service-item { transition: all 0.3s ease; cursor: pointer; }
        .landing-page .service-item:hover { color: var(--lp-accent); }

        .landing-page .v5-nav-wrap {
          position: sticky;
          top: 0;
          z-index: 50;
          background: #0e0d0c;
        }
        .landing-page .v5-nav {
          position: relative;
          display: flex;
          justify-content: space-between;
          align-items: center;
          height: 64px;
          padding: 0 18px;
          width: 100%;
        }
        .landing-page .v5-nav-left,
        .landing-page .v5-nav-right {
          display: flex;
          align-items: center;
          flex-shrink: 0;
        }
        .landing-page .v5-nav-left { gap: 22px; }
        .landing-page .v5-nav-middle {
          position: absolute;
          left: 50%;
          transform: translateX(-50%);
          display: flex;
          align-items: center;
        }
        .landing-page .v5-nav-right { gap: 10px; }
        .landing-page .v5-logo-wrap {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          text-decoration: none;
          color: inherit;
        }
        .landing-page .v5-logo-mark {
          display: flex;
          height: 22px;
          width: 22px;
          align-items: center;
          justify-content: center;
          overflow: hidden;
          border-radius: 6px;
          background: #292f33;
        }
        .landing-page .v5-logo {
          font-family: var(--font-auth-serif), Georgia, ui-serif, serif;
          font-size: 22px;
          font-weight: 600;
          letter-spacing: -0.02em;
          white-space: nowrap;
          color: #fff;
        }
        .landing-page .v5-nav-link {
          font-size: 13px;
          color: #fff;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          white-space: nowrap;
        }
        .landing-page .v5-nav-talk {
          color: rgba(255, 255, 255, 0.86);
        }
        .landing-page .v5-btn-fun {
          font-size: 13px;
          border-radius: 999px;
          white-space: nowrap;
          text-decoration: none;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 9px 18px;
          color: #fff;
          background: #e8622a;
          border: 1px solid rgba(255, 255, 255, 0.14);
          font-weight: 600;
          letter-spacing: 0.03em;
          text-transform: uppercase;
          box-shadow: 0 0 0 2px rgba(232, 98, 42, 0.2);
        }
        .landing-page .v5-hero-shell {
          padding: 56px 0 48px;
          background: #0e0d0c;
          color: #f0ebe3;
        }
        .landing-page .v5-hero {
          padding: 0 32px;
          max-width: 1180px;
          margin: 0 auto;
          display: grid;
          grid-template-columns: 1fr 1fr;
          align-items: center;
          gap: 48px;
          min-height: calc(100vh - 180px);
        }
        .landing-page .v5-hero-left {
          max-width: 540px;
        }
        .landing-page .v5-social-proof {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: rgba(232, 98, 42, 0.1);
          border: 1px solid rgba(232, 98, 42, 0.24);
          border-radius: 40px;
          padding: 6px 16px;
          margin-bottom: 24px;
          font-size: 12px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: #e8622a;
        }
        .landing-page .v5-avatars { display: flex; }
        .landing-page .v5-avatar {
          width: 22px;
          height: 22px;
          border-radius: 50%;
          border: 1.5px solid #1a1815;
          margin-left: -6px;
          font-size: 9px;
          font-weight: 500;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #fff;
        }
        .landing-page .v5-avatar:first-child { margin-left: 0; }
        .landing-page .v5-av1 { background: #3a5a8a; }
        .landing-page .v5-av2 { background: #5a3a7a; }
        .landing-page .v5-av3 { background: #3a7a5a; }
        .landing-page .v5-av4 { background: #7a5a3a; }
        .landing-page .v5-live-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #e8622a;
          margin-right: 2px;
          display: inline-block;
          animation: pulse 2s infinite;
        }
        .landing-page .v5-hero-title {
          font-family: var(--font-auth-serif), Georgia, ui-serif, serif;
          font-size: clamp(52px, 5.2vw, 74px);
          font-weight: 700;
          line-height: 1.03;
          letter-spacing: -0.03em;
          margin-bottom: 20px;
          max-width: 620px;
          white-space: normal;
        }
        .landing-page .v5-hero-title em {
          display: block;
          font-style: italic;
          color: #e8622a;
        }
        .landing-page .v5-hero-desc {
          font-size: 18px;
          line-height: 1.6;
          color: rgba(240, 235, 227, 0.62);
          max-width: 460px;
          margin: 0 0 28px;
          font-weight: 300;
        }
        .landing-page .v5-hero-actions {
          display: flex;
          gap: 14px;
          align-items: center;
          margin-bottom: 16px;
        }
        .landing-page .v5-btn-primary {
          background: #e8622a;
          color: #fff;
          font-size: 15px;
          font-weight: 500;
          padding: 13px 24px;
          border-radius: 10px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          text-decoration: none;
        }
        .landing-page .v5-btn-secondary {
          background: transparent;
          color: rgba(240, 235, 227, 0.72);
          font-size: 15px;
          font-weight: 400;
          padding: 13px 20px;
          border-radius: 10px;
          border: 1px solid rgba(255, 255, 255, 0.16);
          cursor: pointer;
        }
        .landing-page .v5-no-bs {
          font-size: 13px;
          color: rgba(240, 235, 227, 0.4);
        }
        .landing-page .problem-chaos {
          border-top: 1px solid rgba(255, 255, 255, 0.14);
          border-bottom: 1px solid rgba(255, 255, 255, 0.14);
          margin-bottom: 32px;
        }
        .landing-page .problem-line {
          display: grid;
          grid-template-columns: 36px minmax(0, 1fr) auto;
          gap: 14px;
          align-items: baseline;
          padding: 16px 0;
          border-top: 1px solid rgba(255, 255, 255, 0.1);
        }
        .landing-page .problem-line:first-child {
          border-top: 0;
        }
        .landing-page .problem-index {
          font-size: 11px;
          letter-spacing: 0.08em;
          color: var(--lp-text-muted);
          opacity: 0.8;
        }
        .landing-page .problem-quote {
          font-family: var(--font-auth-serif), Georgia, ui-serif, serif;
          font-size: clamp(22px, 2.4vw, 34px);
          font-style: italic;
          line-height: 1.25;
          color: color-mix(in srgb, var(--lp-foreground) 70%, transparent);
          transition: color 0.25s ease;
        }
        .landing-page .problem-line:hover .problem-quote {
          color: var(--lp-foreground);
        }
        .landing-page .problem-source {
          font-size: 11px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          color: var(--lp-text-muted);
          opacity: 0.7;
          white-space: nowrap;
          transition: opacity 0.25s ease, color 0.25s ease;
        }
        .landing-page .problem-line:hover .problem-source {
          opacity: 0.95;
          color: color-mix(in srgb, var(--lp-foreground) 60%, var(--lp-text-muted));
        }
        .landing-page .problem-pivot {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1px;
          background: var(--lp-border);
          border: 1px solid var(--lp-border);
        }
        .landing-page .problem-panel {
          padding: 36px 32px;
        }
        .landing-page .problem-panel-left {
          background: var(--problem-panel-left-bg);
        }
        .landing-page .problem-panel-right {
          background: var(--problem-panel-right-bg);
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          gap: 22px;
        }
        .landing-page .problem-eyebrow {
          margin-bottom: 16px;
          color: var(--lp-text-muted);
        }
        .landing-page .problem-heading {
          font-family: var(--font-auth-serif), Georgia, ui-serif, serif;
          font-size: clamp(1.8rem, 3.3vw, 2.6rem);
          line-height: 1.1;
          letter-spacing: -0.02em;
          margin-bottom: 12px;
          color: var(--lp-foreground);
        }
        .landing-page .problem-body {
          max-width: 38ch;
          line-height: 1.65;
          color: var(--lp-text-secondary);
        }
        .landing-page .problem-eyebrow-fix {
          color: var(--problem-fix-eyebrow);
        }
        .landing-page .problem-heading-fix {
          color: var(--problem-fix-heading);
        }
        .landing-page .problem-body-fix {
          color: var(--problem-fix-body);
          max-width: 40ch;
        }
        .landing-page .problem-actions {
          margin-top: 22px;
          display: flex;
          align-items: center;
        }
        .landing-page .problem-secondary-link {
          display: inline-flex;
          width: fit-content;
          margin-top: 14px;
          font-size: 13px;
          letter-spacing: 0.03em;
          color: var(--lp-text-secondary);
          text-decoration: underline;
          text-underline-offset: 4px;
          text-decoration-thickness: 1px;
          transition: color 0.2s ease, opacity 0.2s ease;
        }
        .landing-page .problem-secondary-link:hover {
          color: var(--lp-foreground);
          opacity: 1;
        }
        .landing-page .problem-enter-btn {
          width: 100%;
          justify-content: center;
        }
        .landing-page .v5-bottom-bar {
          position: fixed;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 40;
          height: 24px;
          padding: 0 10px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          background: #0e0d0c;
        }
        .landing-page .v5-bottom-bar .font-mono {
          color: #fff;
          font-size: 10px;
          letter-spacing: 0.08em;
        }

        .landing-page .v5-hero-right {
          position: relative;
          height: 460px;
        }
        .landing-page .v5-ui-card {
          position: absolute;
          border-radius: 14px;
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.11);
          padding: 12px 14px;
          box-shadow: 0 14px 34px rgba(0, 0, 0, 0.3);
          backdrop-filter: blur(4px);
          will-change: transform;
        }
        .landing-page .v5-card-announcement {
          top: 0;
          left: 10%;
          width: 304px;
          border-color: rgba(232, 98, 42, 0.2);
        }
        .landing-page .v5-card-rota {
          top: 110px;
          right: 0;
          width: 264px;
        }
        .landing-page .v5-card-approval {
          bottom: 24px;
          left: 2%;
          width: 280px;
        }
        .landing-page .v5-card-tag {
          font-size: 10px;
          color: rgba(255, 255, 255, 0.5);
          letter-spacing: 0.1em;
          text-transform: uppercase;
          margin-bottom: 10px;
          font-weight: 600;
        }
        .landing-page .v5-card-title {
          font-family: var(--font-sans), ui-sans-serif, system-ui, sans-serif;
          font-size: 13px;
          font-weight: 600;
          margin-bottom: 4px;
          color: #faf9f6;
          letter-spacing: 0.01em;
        }
        .landing-page .v5-card-meta {
          font-size: 12px;
          color: rgba(250, 249, 246, 0.52);
        }
        .landing-page .v5-card-label {
          margin-left: 6px;
          font-size: 10.5px;
          color: rgba(250, 249, 246, 0.44);
        }
        .landing-page .v5-rota-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 13px;
          padding: 9px 0;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
          color: rgba(250, 249, 246, 0.86);
        }
        .landing-page .v5-rota-row:last-child {
          border-bottom: none;
        }
        .landing-page .v5-rota-row span:last-child {
          color: #ffb49b;
          font-size: 10.5px;
          font-weight: 600;
          background: rgba(232, 98, 42, 0.18);
          border: 1px solid rgba(232, 98, 42, 0.26);
          padding: 2px 8px;
          border-radius: 999px;
        }
        .landing-page .v5-rota-row span.v5-rota-off {
          color: rgba(250, 249, 246, 0.4);
          background: rgba(255, 255, 255, 0.07);
          border-color: rgba(255, 255, 255, 0.1);
        }
        .landing-page .v5-card-row {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 10px;
          gap: 10px;
        }
        .landing-page .v5-status-badge {
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: #fbbf24;
          border: 1px solid rgba(251, 191, 36, 0.3);
          background: rgba(251, 191, 36, 0.14);
          border-radius: 999px;
          padding: 4px 9px;
        }
        .landing-page .v5-card-meta-row {
          display: flex;
          justify-content: space-between;
          font-size: 12px;
          margin-bottom: 4px;
          color: rgba(250, 249, 246, 0.6);
        }
        .landing-page .v5-card-meta-row strong {
          font-weight: 500;
          color: #faf9f6;
        }
        .landing-page .v5-card-actions {
          margin-top: 12px;
          display: flex;
          gap: 8px;
        }
        .landing-page .v5-card-action {
          flex: 1;
          padding: 8px 0;
          font-size: 12px;
          border-radius: 10px;
          border: 1px solid rgba(255, 255, 255, 0.14);
          color: rgba(250, 249, 246, 0.84);
          background: rgba(255, 255, 255, 0.04);
        }
        .landing-page .v5-card-action.v5-card-action-accent {
          color: #ffb49b;
          border-color: rgba(232, 98, 42, 0.3);
          background: rgba(232, 98, 42, 0.16);
        }
        .landing-page .v5-btn-primary:hover,
        .landing-page .v5-btn-fun:hover {
          opacity: 0.9;
        }

        @media (max-width: 640px) {
          .landing-page .v5-nav,
          .landing-page .v5-hero {
            padding-left: 18px;
            padding-right: 18px;
          }
          .landing-page .v5-nav {
            height: 58px;
            padding-left: 14px;
            padding-right: 14px;
          }
          .landing-page .v5-logo {
            font-size: 18px;
          }
          .landing-page .v5-logo-mark {
            height: 18px;
            width: 18px;
          }
          .landing-page .v5-nav-link {
            font-size: 11px;
            letter-spacing: 0.08em;
          }
          .landing-page .v5-nav-middle {
            position: static;
            transform: none;
            margin: 0;
            flex: 1;
            justify-content: center;
            pointer-events: none;
          }
          .landing-page .v5-nav-right {
            gap: 0;
          }
          .landing-page .v5-btn-fun {
            font-size: 10.5px;
            padding: 8px 12px;
            letter-spacing: 0.06em;
          }
          .landing-page .v5-hero {
            grid-template-columns: 1fr;
            gap: 20px;
            min-height: auto;
          }
          .landing-page .v5-hero-shell {
            padding-top: 28px;
          }
          .landing-page .v5-hero-title {
            font-size: clamp(46px, 14vw, 58px);
            line-height: 1.02;
            margin-bottom: 14px;
          }
          .landing-page .v5-hero-desc {
            font-size: 16px;
            line-height: 1.5;
            margin-bottom: 20px;
          }
          .landing-page .v5-bottom-bar {
            height: 22px;
            padding: 0 8px;
            gap: 8px;
          }
          .landing-page .v5-bottom-bar .font-mono {
            font-size: 8px;
            letter-spacing: 0.04em;
            white-space: nowrap;
          }
          .landing-page .v5-bottom-bar > :first-child {
            max-width: 58%;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .landing-page .v5-hero-right {
            height: auto;
            display: grid;
            gap: 10px;
            padding-bottom: 18px;
          }
          .landing-page .v5-ui-card {
            position: relative;
            left: auto;
            right: auto;
            top: auto;
            bottom: auto;
          }
          .landing-page .v5-card-announcement {
            width: calc(100% - 34px);
          }
          .landing-page .v5-card-rota {
            width: calc(100% - 12px);
            margin-left: auto;
            margin-top: -8px;
          }
          .landing-page .v5-card-approval {
            width: calc(100% - 42px);
            margin-top: -8px;
            z-index: 2;
          }
          .landing-page .v5-hero-actions {
            flex-direction: column;
            align-items: stretch;
          }
          .landing-page .v5-btn-primary,
          .landing-page .v5-btn-secondary {
            width: 100%;
          }
          .landing-page .problem-line {
            grid-template-columns: 30px 1fr;
            gap: 10px;
          }
          .landing-page .problem-source {
            grid-column: 2;
            margin-top: 4px;
          }
          .landing-page .problem-pivot {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
