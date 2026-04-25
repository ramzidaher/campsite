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
          <Link href="/login" className="v5-btn-fun">Enter Camp -&gt;</Link>
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
          <div className="v5-ui-card v5-card-announcement">
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

          <div className="v5-ui-card v5-card-rota">
            <div className="v5-card-tag">Today&apos;s rota</div>
            <div className="v5-rota-row"><span>Katie L.</span><span>09:00-17:00</span></div>
            <div className="v5-rota-row"><span>Marcus B.</span><span>12:00-20:00</span></div>
            <div className="v5-rota-row"><span>Tara H.</span><span className="v5-rota-off">Day off</span></div>
            <div className="v5-rota-row"><span>Owen R.</span><span>14:00-22:00</span></div>
          </div>

          <div className="v5-ui-card v5-card-approval">
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
      <div className="v5-bottom-bar">
        <BottomLeftTagline />
        <Clock />
      </div>
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
          padding: 9px 16px;
          color: #fff;
          background: #e8622a;
          border: 1px solid rgba(255, 255, 255, 0.14);
          font-weight: 700;
          letter-spacing: 0.04em;
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
          .landing-page .v5-nav-link {
            font-size: 13px;
          }
          .landing-page .v5-nav-middle {
            left: auto;
            right: 18px;
            transform: none;
            margin-right: 148px;
          }
          .landing-page .v5-hero {
            grid-template-columns: 1fr;
            gap: 26px;
            min-height: auto;
          }
          .landing-page .v5-hero-shell {
            padding-top: 36px;
          }
          .landing-page .v5-bottom-bar {
            height: 22px;
            padding: 0 8px;
          }
          .landing-page .v5-bottom-bar .font-mono {
            font-size: 9px;
            letter-spacing: 0.06em;
          }
          .landing-page .v5-hero-right {
            height: 340px;
          }
          .landing-page .v5-card-announcement {
            left: 0;
            width: 260px;
          }
          .landing-page .v5-card-rota {
            right: 0;
            width: 220px;
          }
          .landing-page .v5-card-approval {
            left: 0;
            width: 250px;
          }
          .landing-page .v5-hero-actions {
            flex-direction: column;
            align-items: stretch;
          }
          .landing-page .v5-btn-primary,
          .landing-page .v5-btn-secondary {
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
}
