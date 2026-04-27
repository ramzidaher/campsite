'use client';

import { Navigation } from '@/components/landing/Navigation';
import { BottomBar } from '@/components/landing/BottomBar';
import { HeroSection } from '@/components/landing/HeroSection';
import { StatementSection } from '@/components/landing/StatementSection';
import { ProblemSection } from '@/components/landing/ProblemSection';
import { CTASection } from '@/components/landing/CTASection';
import { Footer } from '@/components/landing/Footer';
import { CookieBanner } from '@/components/landing/CookieBanner';

export function LandingPage() {
  return (
    <div className="landing-page min-h-screen bg-[color:var(--lp-background)] text-[color:var(--lp-foreground)]">
      <Navigation />
      <BottomBar />
      <main className="min-h-screen pb-[calc(var(--bottom-bar-height)+10px)]">
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
          --problem-panel-bg: linear-gradient(180deg, #f6f1ea 0%, #f1ece5 100%);
          --problem-fix-eyebrow: var(--lp-text-muted);
          --problem-fix-heading: var(--lp-foreground);
          --problem-fix-body: var(--lp-text-secondary);
          --bottom-bar-height: 24px;
          --lp-chrome-bg: #f6f1ea;
          --lp-chrome-fg: #201a16;
          --lp-chrome-muted: rgba(32, 26, 22, 0.74);
          --lp-hero-bg: #f6f1ea;
          --lp-hero-fg: #1f1915;
          --lp-hero-desc: rgba(36, 29, 24, 0.72);
          --lp-hero-card-bg: rgba(255, 255, 255, 0.56);
          --lp-hero-card-border: rgba(31, 25, 21, 0.14);
          --lp-hero-card-title: #241d18;
          --lp-hero-card-meta: rgba(36, 29, 24, 0.68);
          --lp-hero-card-label: rgba(36, 29, 24, 0.56);
          --lp-hero-row: rgba(31, 25, 21, 0.12);
        }
        body.dark .landing-page {
          --lp-background: #121212;
          --lp-surface: #1a1a1a;
          --lp-foreground: #faf9f6;
          --lp-text-secondary: #808080;
          --lp-text-muted: #b0b0b0;
          --lp-border: #2a2a2a;
          --problem-panel-bg: linear-gradient(180deg, #141210 0%, #12100e 100%);
          --problem-fix-eyebrow: var(--lp-text-muted);
          --problem-fix-heading: var(--lp-foreground);
          --problem-fix-body: var(--lp-text-secondary);
          --lp-chrome-bg: #0e0d0c;
          --lp-chrome-fg: #faf9f6;
          --lp-chrome-muted: rgba(255, 255, 255, 0.86);
          --lp-hero-bg: #0e0d0c;
          --lp-hero-fg: #f0ebe3;
          --lp-hero-desc: rgba(240, 235, 227, 0.7);
          --lp-hero-card-bg: rgba(255, 255, 255, 0.03);
          --lp-hero-card-border: rgba(255, 255, 255, 0.11);
          --lp-hero-card-title: #faf9f6;
          --lp-hero-card-meta: rgba(250, 249, 246, 0.52);
          --lp-hero-card-label: rgba(250, 249, 246, 0.44);
          --lp-hero-row: rgba(255, 255, 255, 0.08);
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
        .landing-page .lp-sr-only {
          border: 0;
          clip: rect(0, 0, 0, 0);
          height: 1px;
          margin: -1px;
          overflow: hidden;
          padding: 0;
          position: absolute;
          white-space: nowrap;
          width: 1px;
        }
        .landing-page a { transition: opacity 0.2s ease; }
        .landing-page a:hover { opacity: 0.7; }
        @keyframes cta-smoke-rise {
          0% { transform: translateY(0) scale(1); opacity: 0; }
          15% { opacity: 0.45; }
          100% { transform: translateY(-42px) translateX(7px) scale(1.7); opacity: 0; }
        }
        .landing-page .cta-smoke-wisp {
          filter: blur(2px);
          animation: cta-smoke-rise 2.4s ease-out infinite;
          will-change: transform;
        }
        .landing-page .cta-smoke-wisp-delay-1 { animation-delay: 0.7s; }
        .landing-page .cta-smoke-wisp-delay-2 { animation-delay: 1.4s; }
        .landing-page .cookie-banner {
          backdrop-filter: blur(14px);
          background: color-mix(in srgb, #0f0e0d 82%, transparent);
          border: 1px solid color-mix(in srgb, #ffffff 14%, transparent);
          box-shadow: 0 18px 42px rgba(0, 0, 0, 0.42);
          bottom: calc(var(--bottom-bar-height) + 10px);
        }
        body.dark .landing-page .cookie-banner {
          background: color-mix(in srgb, #0f0e0d 84%, transparent);
          border: 1px solid rgba(255, 255, 255, 0.14);
        }
        .landing-page .cookie-banner-kicker {
          color: rgba(240, 235, 227, 0.62);
        }
        .landing-page .cookie-banner-copy {
          color: rgba(240, 235, 227, 0.82);
          line-height: 1.5;
        }
        .landing-page .cookie-banner-link {
          color: #f2b89e;
          text-underline-offset: 3px;
          text-decoration-thickness: 1px;
        }
        .landing-page .cookie-banner-actions {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .landing-page .cookie-banner-accept {
          border: 1px solid rgba(232, 98, 42, 0.55);
          background: #e8622a;
          color: #fff;
          border-radius: 999px;
          padding: 8px 14px;
          font-size: 10px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .landing-page .cookie-banner-dismiss {
          border: 1px solid rgba(255, 255, 255, 0.2);
          background: transparent;
          color: rgba(240, 235, 227, 0.84);
          border-radius: 999px;
          padding: 8px 14px;
          font-size: 10px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .landing-page .v5-nav-wrap { position: sticky; top: 0; z-index: 50; background: var(--lp-chrome-bg); border-bottom: 1px solid color-mix(in srgb, var(--lp-border) 64%, transparent); }
        .landing-page .v5-nav { position: relative; display: flex; justify-content: space-between; align-items: center; height: 64px; padding: 0 18px; width: 100%; }
        .landing-page .v5-nav-left,
        .landing-page .v5-nav-right { display: flex; align-items: center; flex-shrink: 0; }
        .landing-page .v5-nav-left { gap: 22px; }
        .landing-page .v5-nav-middle { position: absolute; left: 50%; transform: translateX(-50%); display: flex; align-items: center; }
        .landing-page .v5-nav-right { gap: 10px; }
        .landing-page .v5-logo-wrap { display: inline-flex; align-items: center; gap: 8px; text-decoration: none; color: inherit; }
        .landing-page .v5-logo-mark { display: flex; height: 26px; width: 26px; align-items: center; justify-content: center; overflow: hidden; border-radius: 7px; background: #292f33; }
        .landing-page .v5-logo { font-family: var(--font-auth-serif), Georgia, ui-serif, serif; font-size: 22px; font-weight: 600; letter-spacing: -0.02em; white-space: nowrap; color: var(--lp-chrome-fg); }
        .landing-page .v5-nav-link { font-size: 13px; color: var(--lp-chrome-fg); letter-spacing: 0.04em; text-transform: uppercase; white-space: nowrap; }
        .landing-page .v5-nav-talk { color: var(--lp-chrome-muted); }
        .landing-page .v5-nav-talk {
          position: relative;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 2px 0;
        }
        .landing-page .v5-talk-popover {
          position: absolute;
          left: 50%;
          top: calc(100% + 9px);
          transform: translateX(-50%) translateY(-6px) scale(0.96);
          opacity: 0;
          pointer-events: none;
          border-radius: 999px;
          padding: 7px 11px;
          font-size: 9px;
          letter-spacing: 0.08em;
          color: #fff;
          background: #e8622a;
          border: 1px solid rgba(255, 255, 255, 0.22);
          box-shadow: 0 10px 26px rgba(232, 98, 42, 0.35);
          transition: opacity 0.2s ease, transform 0.2s ease;
          white-space: nowrap;
          z-index: 60;
        }
        .landing-page .v5-nav-talk:hover .v5-talk-popover,
        .landing-page .v5-nav-talk:focus-visible .v5-talk-popover {
          opacity: 1;
          transform: translateX(-50%) translateY(0) scale(1);
        }
        .landing-page .v5-btn-fun { font-size: 13px; border-radius: 999px; white-space: nowrap; text-decoration: none; display: inline-flex; align-items: center; justify-content: center; padding: 9px 18px; color: #fff; background: #e8622a; border: 1px solid rgba(255, 255, 255, 0.14); font-weight: 600; letter-spacing: 0.03em; text-transform: uppercase; box-shadow: 0 0 0 2px rgba(232, 98, 42, 0.2); }

        .landing-page .v5-hero-shell { padding: 56px 0 48px; background: var(--lp-hero-bg); color: var(--lp-hero-fg); }
        .landing-page .v5-hero { padding: 0 32px; max-width: 1180px; margin: 0 auto; display: grid; grid-template-columns: 1fr 1fr; align-items: center; gap: 48px; min-height: calc(100vh - 180px); }
        .landing-page .v5-hero-left { max-width: 540px; }
        .landing-page .v5-avatars { display: flex; }
        .landing-page .v5-avatar { width: 22px; height: 22px; border-radius: 50%; border: 1.5px solid #1a1815; margin-left: -6px; font-size: 9px; font-weight: 500; display: flex; align-items: center; justify-content: center; color: #fff; }
        .landing-page .v5-avatar:first-child { margin-left: 0; }
        .landing-page .v5-av1 { background: #3a5a8a; }
        .landing-page .v5-av2 { background: #5a3a7a; }
        .landing-page .v5-av3 { background: #3a7a5a; }
        .landing-page .v5-av4 { background: #7a5a3a; }
        .landing-page .v5-hero-title { font-family: var(--font-auth-serif), Georgia, ui-serif, serif; font-size: clamp(52px, 5.2vw, 74px); font-weight: 700; line-height: 1.03; letter-spacing: -0.03em; margin-bottom: 20px; max-width: 620px; white-space: normal; }
        .landing-page .v5-hero-title em { display: block; font-style: italic; color: #e8622a; }
        .landing-page .v5-hero-desc { font-size: 18px; line-height: 1.6; color: var(--lp-hero-desc); max-width: 500px; margin: 0 0 28px; font-weight: 300; }
        .landing-page .v5-hero-actions { display: flex; gap: 14px; align-items: center; margin-bottom: 16px; }
        .landing-page .v5-btn-primary { background: #e8622a; color: #fff; font-size: 15px; font-weight: 500; padding: 13px 24px; border-radius: 10px; border: 1px solid rgba(255, 255, 255, 0.08); display: inline-flex; align-items: center; justify-content: center; text-decoration: none; }
        .landing-page .v5-btn-secondary { background: transparent; color: var(--lp-hero-desc); font-size: 15px; font-weight: 400; padding: 13px 20px; border-radius: 10px; border: 1px solid color-mix(in srgb, var(--lp-hero-fg) 24%, transparent); cursor: pointer; }

        .landing-page .problem-chaos { border-top: 1px solid rgba(255, 255, 255, 0.14); border-bottom: 1px solid rgba(255, 255, 255, 0.14); margin-bottom: 32px; }
        .landing-page .problem-line { display: grid; grid-template-columns: 36px minmax(0, 1fr) auto; gap: 14px; align-items: baseline; padding: 16px 0; border-top: 1px solid rgba(255, 255, 255, 0.1); }
        .landing-page .problem-line:first-child { border-top: 0; }
        .landing-page .problem-index { font-size: 11px; letter-spacing: 0.08em; color: var(--lp-text-muted); opacity: 0.8; }
        .landing-page .problem-quote { font-family: var(--font-auth-serif), Georgia, ui-serif, serif; font-size: clamp(22px, 2.4vw, 34px); font-style: italic; line-height: 1.25; color: color-mix(in srgb, var(--lp-foreground) 70%, transparent); transition: color 0.25s ease; }
        .landing-page .problem-line:hover .problem-quote { color: var(--lp-foreground); }
        .landing-page .problem-source { font-size: 11px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--lp-text-muted); opacity: 0.7; white-space: nowrap; transition: opacity 0.25s ease, color 0.25s ease; }
        .landing-page .problem-line:hover .problem-source { opacity: 0.95; color: color-mix(in srgb, var(--lp-foreground) 60%, var(--lp-text-muted)); }
        .landing-page .problem-pivot { display: grid; grid-template-columns: 1fr 1fr; gap: 1px; background: var(--lp-border); border: 1px solid var(--lp-border); }
        .landing-page .problem-panel { padding: 36px 32px; }
        .landing-page .problem-panel-left { background: var(--problem-panel-bg); }
        .landing-page .problem-panel-right { background: var(--problem-panel-bg); display: flex; flex-direction: column; justify-content: space-between; gap: 22px; border-left: 1px solid var(--lp-border); }
        .landing-page .problem-eyebrow { margin-bottom: 16px; color: var(--lp-text-muted); }
        .landing-page .problem-heading { font-family: var(--font-auth-serif), Georgia, ui-serif, serif; font-size: clamp(1.8rem, 3.3vw, 2.6rem); line-height: 1.1; letter-spacing: -0.02em; margin-bottom: 12px; color: var(--lp-foreground); }
        .landing-page .problem-body { max-width: 38ch; line-height: 1.65; color: var(--lp-text-secondary); }
        .landing-page .problem-eyebrow-fix { color: var(--problem-fix-eyebrow); }
        .landing-page .problem-heading-fix { color: var(--problem-fix-heading); }
        .landing-page .problem-body-fix { color: var(--problem-fix-body); max-width: 40ch; }
        .landing-page .problem-actions { margin-top: 22px; display: flex; align-items: center; flex-wrap: wrap; gap: 10px; }
        .landing-page .problem-btn-outline {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 46px;
          padding: 13px 24px;
          border-radius: 10px;
          border: 1px solid color-mix(in srgb, var(--lp-foreground) 22%, transparent);
          color: var(--lp-foreground);
          background: transparent;
          font-size: 15px;
          font-weight: 500;
          text-decoration: none;
        }
        .landing-page .problem-enter-link {
          align-self: flex-end;
          display: inline-flex;
          align-items: center;
          font-size: 13px;
          letter-spacing: 0.04em;
          text-transform: uppercase;
          color: var(--lp-text-secondary);
          text-decoration: none;
        }
        .landing-page .problem-enter-link:hover {
          color: var(--lp-foreground);
        }

        .landing-page .cta-form { display: flex; gap: 10px; align-items: stretch; flex-wrap: nowrap; max-width: 760px; margin: 0 auto; }
        .landing-page .cta-email-input { flex: 1; min-width: 0; height: 54px; border-radius: 12px; border: 1px solid var(--lp-border); background: color-mix(in srgb, var(--lp-surface) 92%, transparent); color: var(--lp-foreground); padding: 0 14px; font-size: 15px; }
        .landing-page .cta-email-input::placeholder { color: var(--lp-text-muted); }
        .landing-page .cta-submit-btn { height: 54px; min-height: 54px; border-radius: 12px; padding: 0 24px; white-space: nowrap; }

        .landing-page .v5-bottom-bar { position: fixed; left: 0; right: 0; bottom: 0; z-index: 40; height: var(--bottom-bar-height); padding: 0 10px; display: flex; align-items: center; justify-content: space-between; background: var(--lp-chrome-bg); border-top: 1px solid color-mix(in srgb, var(--lp-border) 64%, transparent); }
        .landing-page .v5-bottom-bar .font-mono { color: var(--lp-chrome-fg); font-size: 10px; letter-spacing: 0.08em; }
        .landing-page .v5-bottom-right { display: inline-flex; align-items: center; gap: 8px; }
        .landing-page .v5-theme-toggle {
          position: relative;
          display: inline-flex;
          align-items: center;
          width: 36px;
          height: 20px;
          border: 1px solid color-mix(in srgb, var(--lp-chrome-fg) 26%, transparent);
          border-radius: 999px;
          background: color-mix(in srgb, var(--lp-chrome-fg) 10%, transparent);
          padding: 2px;
        }
        .landing-page .v5-theme-toggle-thumb {
          display: block;
          width: 14px;
          height: 14px;
          border-radius: 50%;
          background: var(--lp-chrome-fg);
          transform: translateX(0);
          transition: transform 0.18s ease;
        }
        .landing-page .v5-theme-toggle[data-mode='dark'] .v5-theme-toggle-thumb {
          transform: translateX(16px);
        }

        .landing-page .v5-hero-right { position: relative; height: 460px; --hero-parallax: 0px; }
        .landing-page .v5-ui-card { position: absolute; border-radius: 14px; background: var(--lp-hero-card-bg); border: 1px solid var(--lp-hero-card-border); padding: 12px 14px; box-shadow: 0 14px 34px rgba(0, 0, 0, 0.3); backdrop-filter: blur(4px); will-change: transform; }
        .landing-page .v5-card-parallax-1 { transform: translate3d(calc(var(--hero-parallax) * -0.03), calc(var(--hero-parallax) * -0.12), 0); }
        .landing-page .v5-card-parallax-2 { transform: translate3d(calc(var(--hero-parallax) * 0.04), calc(var(--hero-parallax) * -0.18), 0); }
        .landing-page .v5-card-parallax-3 { transform: translate3d(calc(var(--hero-parallax) * -0.05), calc(var(--hero-parallax) * -0.08), 0); }
        .landing-page .v5-card-announcement { top: 0; left: 10%; width: 304px; border-color: rgba(232, 98, 42, 0.2); }
        .landing-page .v5-card-rota { top: 110px; right: 0; width: 264px; }
        .landing-page .v5-card-approval { bottom: 24px; left: 2%; width: 280px; }
        .landing-page .v5-card-tag { font-size: 10px; color: color-mix(in srgb, var(--lp-hero-card-meta) 84%, transparent); letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 10px; font-weight: 600; }
        .landing-page .v5-card-title { font-family: var(--font-sans), ui-sans-serif, system-ui, sans-serif; font-size: 13px; font-weight: 600; margin-bottom: 4px; color: var(--lp-hero-card-title); letter-spacing: 0.01em; }
        .landing-page .v5-card-meta { font-size: 12px; color: var(--lp-hero-card-meta); }
        .landing-page .v5-card-label { margin-left: 6px; font-size: 10.5px; color: var(--lp-hero-card-label); }
        .landing-page .v5-rota-row { display: flex; align-items: center; justify-content: space-between; font-size: 13px; padding: 9px 0; border-bottom: 1px solid var(--lp-hero-row); color: color-mix(in srgb, var(--lp-hero-card-title) 90%, transparent); }
        .landing-page .v5-rota-row:last-child { border-bottom: none; }
        .landing-page .v5-rota-row span:last-child { color: #ffb49b; font-size: 10.5px; font-weight: 600; background: rgba(232, 98, 42, 0.18); border: 1px solid rgba(232, 98, 42, 0.26); padding: 2px 8px; border-radius: 999px; }
        .landing-page .v5-rota-row span.v5-rota-off { color: color-mix(in srgb, var(--lp-hero-card-title) 44%, transparent); background: color-mix(in srgb, var(--lp-hero-card-title) 12%, transparent); border-color: color-mix(in srgb, var(--lp-hero-card-title) 16%, transparent); }
        .landing-page .v5-card-row { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px; gap: 10px; }
        .landing-page .v5-status-badge { font-size: 10px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: #fbbf24; border: 1px solid rgba(251, 191, 36, 0.3); background: rgba(251, 191, 36, 0.14); border-radius: 999px; padding: 4px 9px; }
        .landing-page .v5-card-meta-row { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 4px; color: color-mix(in srgb, var(--lp-hero-card-meta) 90%, transparent); }
        .landing-page .v5-card-meta-row strong { font-weight: 500; color: var(--lp-hero-card-title); }
        .landing-page .v5-card-actions { margin-top: 12px; display: flex; gap: 8px; }
        .landing-page .v5-card-action { flex: 1; padding: 8px 0; font-size: 12px; border-radius: 10px; border: 1px solid color-mix(in srgb, var(--lp-hero-card-title) 18%, transparent); color: color-mix(in srgb, var(--lp-hero-card-title) 84%, transparent); background: color-mix(in srgb, var(--lp-hero-card-title) 7%, transparent); }
        .landing-page .v5-card-action.v5-card-action-accent { color: #ffb49b; border-color: rgba(232, 98, 42, 0.3); background: rgba(232, 98, 42, 0.16); }
        .landing-page .v5-btn-primary:hover,
        .landing-page .v5-btn-fun:hover { opacity: 0.9; }

        @media (max-width: 768px) {
          .landing-page { --bottom-bar-height: 22px; }
          .landing-page .v5-nav,
          .landing-page .v5-hero { padding-left: 18px; padding-right: 18px; }
          .landing-page .v5-nav { height: 58px; padding-left: 14px; padding-right: 14px; overflow: hidden; gap: 8px; }
          .landing-page .v5-nav-middle { display: none; }
          .landing-page .v5-nav-right { margin-left: auto; min-width: 0; }
          .landing-page .v5-logo { font-size: 18px; }
          .landing-page .v5-logo-mark { height: 21px; width: 21px; }
          .landing-page .v5-btn-fun { font-size: 10.5px; padding: 8px 12px; letter-spacing: 0.06em; }
          .landing-page .problem-pivot { grid-template-columns: 1fr; }
          .landing-page .problem-panel-right { border-left: 0; border-top: 1px solid var(--lp-border); }
          .landing-page .cta-form { align-items: stretch; flex-wrap: wrap; }
          .landing-page .cta-email-input,
          .landing-page .cta-submit-btn { width: 100%; }
          .landing-page .cookie-banner { left: 8px; right: 8px; max-width: none; bottom: calc(var(--bottom-bar-height) + 8px); }
        }
        @media (max-width: 640px) {
          .landing-page .v5-hero { grid-template-columns: 1fr; gap: 20px; min-height: auto; }
          .landing-page .v5-hero-shell { padding-top: 28px; }
          .landing-page .v5-hero-title { font-size: clamp(46px, 14vw, 58px); line-height: 1.02; margin-bottom: 14px; }
          .landing-page .v5-hero-desc { font-size: 16px; line-height: 1.5; margin-bottom: 20px; }
          .landing-page .v5-bottom-bar { padding: 0 8px; gap: 8px; }
          .landing-page .v5-bottom-bar .font-mono { font-size: 8px; letter-spacing: 0.04em; white-space: nowrap; }
          .landing-page .v5-bottom-bar > :first-child { max-width: 58%; overflow: hidden; text-overflow: ellipsis; }
          .landing-page .v5-bottom-right { gap: 6px; }
          .landing-page .v5-theme-toggle { width: 32px; height: 18px; padding: 2px; }
          .landing-page .v5-theme-toggle-thumb { width: 12px; height: 12px; }
          .landing-page .v5-theme-toggle[data-mode='dark'] .v5-theme-toggle-thumb { transform: translateX(14px); }
          .landing-page .v5-hero-right { height: auto; display: grid; gap: 10px; padding-bottom: 18px; }
          .landing-page .v5-ui-card { position: relative; left: auto; right: auto; top: auto; bottom: auto; transform: none; }
          .landing-page .v5-card-announcement { width: calc(100% - 34px); }
          .landing-page .v5-card-rota { width: calc(100% - 12px); margin-left: auto; margin-top: -8px; }
          .landing-page .v5-card-approval { width: calc(100% - 42px); margin-top: -8px; z-index: 2; }
          .landing-page .v5-hero-actions { flex-direction: column; align-items: stretch; }
          .landing-page .v5-btn-primary,
          .landing-page .v5-btn-secondary { width: 100%; }
          .landing-page .problem-line { grid-template-columns: 30px 1fr; gap: 10px; }
          .landing-page .problem-source { grid-column: 2; margin-top: 4px; }
        }
      `}</style>
    </div>
  );
}
