'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { CampfireLoaderInline } from '@/components/CampfireLoaderInline';
import { CampsiteLogoMark } from '@/components/CampsiteLogoMark';

function Navigation() {
  const [isDarkMode, setIsDarkMode] = useState(false);

  const toggleDarkMode = () => {
    setIsDarkMode(!isDarkMode);
    document.body.classList.toggle('dark');
    localStorage.setItem('theme', isDarkMode ? 'light' : 'dark');
  };

  return (
    <header className="fixed left-0 right-0 top-0 z-50 px-4 py-4 md:px-8">
      <nav className="grid grid-cols-[1fr_auto_1fr] items-center">
        <div className="flex items-center gap-6">
          <Link href="/" className="inline-flex items-center gap-2.5 font-mono">
            <CampsiteLogoMark className="flex h-6 w-6 items-center justify-center overflow-hidden rounded-md bg-[#292f33]" />
            CAMPSITE
          </Link>
          <button type="button" onClick={toggleDarkMode} className="font-mono hidden md:block">
            DARK MODE
          </button>
        </div>
        <button type="button" className="font-mono justify-self-center">
          MENU
        </button>
        <div className="flex items-center justify-end">
          <div className="group relative">
            <a
              href="#contact"
              className="font-mono inline-flex items-center text-[11px] uppercase tracking-[0.18em] transition-opacity"
              style={{ color: 'var(--lp-foreground)' }}
            >
              LET&apos;S TALK
            </a>

            <div className="absolute right-0 top-full min-w-[130px] pt-1.5">
              <div
                className="pointer-events-none translate-y-1 opacity-0 transition-all duration-150 group-focus-within:pointer-events-auto group-focus-within:translate-y-0 group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100"
              >
                <Link href="/login" className="font-mono block py-1.5 text-[11px] uppercase tracking-[0.18em] text-[color:var(--lp-foreground)]/90 hover:underline">
                  Login
                </Link>
                <Link href="/register" className="font-mono block py-1.5 text-[11px] uppercase tracking-[0.18em] text-[color:var(--lp-foreground)]/70 hover:text-[color:var(--lp-foreground)] hover:underline">
                  Register
                </Link>
              </div>
            </div>
          </div>
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
  const sectionRef = useRef<HTMLElement | null>(null);
  const [scrollProgress, setScrollProgress] = useState(0);

  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = 0;
        const section = sectionRef.current;
        if (!section) return;
        const rect = section.getBoundingClientRect();
        const sectionTravel = Math.max(1, rect.height * 0.85);
        // 0 at page top; increases only as hero scrolls past viewport top.
        const raw = -rect.top / sectionTravel;
        const clamped = Math.max(0, Math.min(1, raw));
        setScrollProgress(clamped);
      });
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      if (raf) window.cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  const headingScale = 1 + scrollProgress * 1.05;
  const headingY = -scrollProgress * 120;
  const headingOpacity = 1 - scrollProgress * 0.45;

  return (
    <section
      ref={sectionRef}
      className="relative min-h-screen overflow-hidden px-4 pb-12 pt-20 md:px-8"
    >
      <div className="relative mx-auto min-h-[calc(100vh-8rem)] max-w-7xl">
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <h1
            className="font-grot text-center text-[clamp(3.5rem,14vw,10rem)] leading-[0.85]"
            style={{
              transform: `translateY(${headingY}px) scale(${headingScale})`,
              opacity: headingOpacity,
              transition: 'transform 120ms linear, opacity 120ms linear',
              willChange: 'transform, opacity',
            }}
          >
            <span className="block">RUN</span>
            <span className="block">
              YOUR <span style={{ color: '#f38f0c' }}>TEAM</span>
            </span>
            <span className="block">BETTER</span>
          </h1>
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

function ProjectsMarquee() {
  return (
    <div className="overflow-hidden py-8">
      <div className="animate-marquee flex whitespace-nowrap">
        <span className="font-grot mx-8 text-[clamp(4rem,15vw,12rem)]">CAMPSITE MODULES</span>
        <span className="font-grot mx-8 text-[clamp(4rem,15vw,12rem)]">CAMPSITE MODULES</span>
        <span className="font-grot mx-8 text-[clamp(4rem,15vw,12rem)]">CAMPSITE MODULES</span>
        <span className="font-grot mx-8 text-[clamp(4rem,15vw,12rem)]">CAMPSITE MODULES</span>
      </div>
    </div>
  );
}

function ProjectsSection() {
  const features: FeatureSpotlight[] = [
    {
      title: 'Broadcasts',
      subtitle: 'Company-wide updates that people actually read.',
      bullets: ['Audience targeting by team/location', 'Read visibility and follow-through'],
      gradient: 'linear-gradient(145deg, #d8d9ff 0%, #c9d6ff 40%, #f0f3ff 100%)',
      kind: 'broadcasts',
    },
    {
      title: 'Rota & Attendance',
      subtitle: 'Clear scheduling with fewer last-minute surprises.',
      bullets: ['Shift planning and swap handling', 'Attendance view in one place'],
      gradient: 'linear-gradient(145deg, #fff0d3 0%, #ffe0aa 44%, #fff5e4 100%)',
      kind: 'rota',
    },
    {
      title: 'Recruitment',
      subtitle: 'Move from applicants to offers without tool-hopping.',
      bullets: ['Pipeline stages and interview flow', 'Hiring visibility for managers and HR'],
      gradient: 'linear-gradient(145deg, #d9f1e5 0%, #bee6d2 44%, #eefaf3 100%)',
      kind: 'recruitment',
    },
    {
      title: 'People Ops',
      subtitle: 'Run reviews and records with shared context.',
      bullets: ['Centralized people information', 'Performance cycle tracking'],
      gradient: 'linear-gradient(145deg, #f2def8 0%, #e9cdf6 42%, #f9effd 100%)',
      kind: 'peopleOps',
    },
  ];

  return (
    <section className="px-4 py-16 md:px-8">
      <div className="mx-auto max-w-7xl">
        <p className="font-mono mb-12 text-xs tracking-wider">SELECTED FEATURES</p>
        <ProjectsMarquee />
        <div className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-2">
          {features.map((feature) => (
            <FeatureSpotlightCard key={feature.title} feature={feature} />
          ))}
        </div>
      </div>
    </section>
  );
}

type FeatureSpotlight = {
  title: string;
  subtitle: string;
  bullets: string[];
  gradient: string;
  kind: 'broadcasts' | 'rota' | 'recruitment' | 'peopleOps';
};

function FeatureMiniMockup({ kind }: { kind: FeatureSpotlight['kind'] }) {
  if (kind === 'broadcasts') {
    return (
      <div className="flex h-full flex-col">
        <div className="mb-2 flex items-center justify-between text-[10px] font-semibold text-black/55">
          <span>Broadcasts</span>
          <span>3 unread</span>
        </div>
        <div className="space-y-2">
          {[
            ['Q4 update published', '52/58 read'],
            ['Policy reminder', '44/58 read'],
            ['Team social invite', '31/58 read'],
          ].map(([title, read]) => (
            <div key={title as string} className="rounded-lg border border-black/10 bg-white/70 px-3 py-2">
              <p className="text-[11px] font-medium">{title as string}</p>
              <p className="mt-1 text-[10px] text-black/55">{read as string}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 space-y-1">
          <div className="h-1.5 rounded-full bg-black/10">
            <div className="h-full w-[88%] rounded-full bg-black/35" />
          </div>
          <div className="h-1.5 rounded-full bg-black/10">
            <div className="h-full w-[74%] rounded-full bg-black/25" />
          </div>
        </div>
      </div>
    );
  }
  if (kind === 'rota') {
    return (
      <div className="flex h-full flex-col">
        <div className="mb-2 text-[10px] font-semibold text-black/55">This week rota</div>
        <div className="grid grid-cols-6 gap-1.5">
          <div />
          {['M', 'T', 'W', 'T', 'F'].map((d, i) => (
            <div key={`${d}-${i}`} className="text-center text-[10px] font-semibold text-black/55">{d}</div>
          ))}
          {[
            ['AM', [1, 1, 0, 1, 1]],
            ['PM', [1, 0, 1, 1, 1]],
            ['EV', [0, 1, 1, 0, 1]],
          ].map(([label, row]) => (
            <div key={label as string} className="contents">
              <div className="flex items-center text-[10px] font-medium text-black/50">{label as string}</div>
              {(row as number[]).map((on, i) => (
                <div key={i} className={`h-6 rounded-md ${on ? 'bg-black/25' : 'border border-dashed border-black/25 bg-white/40'}`} />
              ))}
            </div>
          ))}
        </div>
        <div className="mt-auto pt-3 text-[10px] text-black/55">2 swaps pending approval</div>
      </div>
    );
  }
  if (kind === 'recruitment') {
    return (
      <div className="flex h-full flex-col">
        <div className="mb-2 text-[10px] font-semibold text-black/55">Hiring pipeline</div>
        <div className="grid grid-cols-3 gap-2">
          {[
            ['Applied', 12],
            ['Interview', 4],
            ['Offer', 1],
          ].map(([label, count]) => (
            <div key={label as string} className="rounded-lg border border-black/10 bg-white/55 p-2">
              <p className="text-[10px] font-semibold text-black/60">{label as string}</p>
              <p className="font-grot mt-1 text-xl leading-none">{count as number}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 space-y-1.5">
          {['Sarah Morrow', 'James Harlow', 'Priya Singh'].map((name) => (
            <div key={name} className="rounded-md border border-black/10 bg-white/65 px-2.5 py-1.5 text-[10px]">
              {name}
            </div>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 text-[10px] font-semibold text-black/55">People ops status</div>
      <div className="space-y-2.5">
        {[
          ['Profiles complete', '84%'],
          ['Reviews in progress', '12'],
          ['Onboarding tasks', '7'],
        ].map(([label, value]) => (
          <div key={label as string} className="flex items-center justify-between rounded-lg border border-black/10 bg-white/55 px-3 py-2">
            <span className="text-[11px] text-black/65">{label as string}</span>
            <span className="text-[11px] font-semibold">{value as string}</span>
          </div>
        ))}
      </div>
      <div className="mt-auto grid grid-cols-3 gap-1.5 pt-3">
        <div className="rounded-md bg-black/15 px-2 py-1 text-center text-[10px]">HR</div>
        <div className="rounded-md bg-black/15 px-2 py-1 text-center text-[10px]">Ops</div>
        <div className="rounded-md bg-black/15 px-2 py-1 text-center text-[10px]">Mgr</div>
      </div>
    </div>
  );
}

function FeatureSpotlightCard({ feature }: { feature: FeatureSpotlight }) {
  const [badgePos, setBadgePos] = useState({ x: 52, y: 24 });
  const [isActive, setIsActive] = useState(false);

  const handleMove = (event: React.MouseEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    setBadgePos({
      x: Math.max(16, Math.min(84, x)),
      y: Math.max(12, Math.min(80, y)),
    });
    setIsActive(true);
  };

  const resetBadge = () => {
    setIsActive(false);
    setBadgePos({ x: 52, y: 24 });
  };

  return (
    <article
      className="project-card group relative aspect-[5/4] overflow-hidden rounded-2xl border p-4 md:p-5"
      style={{ borderColor: 'var(--lp-border)', background: feature.gradient }}
      onMouseMove={handleMove}
      onMouseEnter={() => setIsActive(true)}
      onMouseLeave={resetBadge}
    >
      <div className="absolute inset-0 p-4 md:p-5">
        <div
          className={`h-full rounded-xl border border-black/10 bg-white/40 p-4 md:p-5 transition-all duration-500 ${isActive ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-85'}`}
        >
          <FeatureMiniMockup kind={feature.kind} />
        </div>
      </div>

      <div
        className={`pointer-events-none absolute z-[3] rounded-xl bg-[#1e33ff] px-4 py-2 font-mono text-[12px] tracking-[0.12em] text-white shadow-lg transition-all duration-500 ${isActive ? 'opacity-100' : 'opacity-0'}`}
        style={{
          left: `${badgePos.x}%`,
          top: `${badgePos.y}%`,
          transform: 'translate(-50%, -50%) rotate(-6deg)',
        }}
      >
        {feature.title.toUpperCase()}
      </div>
    </article>
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
      <div className="fixed bottom-0 left-0 z-40 p-2"><BottomLeftTagline /></div>
      <div className="fixed bottom-0 right-0 z-40 p-2"><Clock /></div>
      <main className="min-h-screen">
        <HeroSection />
        <StatementSection />
        <ProjectsSection />
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
        }
        body.dark .landing-page {
          --lp-background: #121212;
          --lp-surface: #1a1a1a;
          --lp-foreground: #faf9f6;
          --lp-text-secondary: #808080;
          --lp-text-muted: #b0b0b0;
          --lp-border: #2a2a2a;
          --lp-accent: #faf9f6;
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
      `}</style>
    </div>
  );
}
