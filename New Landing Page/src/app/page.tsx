"use client";

import { useState, useEffect, useRef, type MouseEvent } from "react";
import Image from "next/image";
import Link from "next/link";

// Navigation Component
function Navigation() {
  const [isDarkMode, setIsDarkMode] = useState(false);

  const toggleDarkMode = () => {
    setIsDarkMode(!isDarkMode);
    document.body.classList.toggle("dark");
    localStorage.setItem("theme", isDarkMode ? "light" : "dark");
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 px-4 py-4 md:px-8">
      <nav className="grid grid-cols-[1fr_auto_1fr] items-center">
        <div className="flex items-center gap-6">
          <Link href="/" className="font-mono">
            CAMPSITE
          </Link>
          <button
            type="button"
            onClick={toggleDarkMode}
            className="font-mono hidden md:block"
          >
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
              className="font-mono text-[11px] tracking-[0.18em] uppercase inline-flex items-center rounded-full border px-4 py-2 transition-opacity"
              style={{
                borderColor: "var(--foreground)",
                color: "var(--background)",
                backgroundColor: "var(--foreground)",
              }}
            >
              LET&apos;S TALK
            </a>

            <div
              className="absolute right-0 top-full mt-2 min-w-[150px] rounded-xl border p-1.5 opacity-0 pointer-events-none translate-y-1 transition-all duration-150 group-hover:opacity-100 group-hover:pointer-events-auto group-hover:translate-y-0 group-focus-within:opacity-100 group-focus-within:pointer-events-auto group-focus-within:translate-y-0"
              style={{
                borderColor: "var(--border)",
                backgroundColor: "var(--surface)",
              }}
            >
              <Link
                href="/login"
                className="font-mono text-[11px] tracking-[0.18em] uppercase block rounded-lg px-3 py-2"
              >
                Login
              </Link>
              <Link
                href="/register"
                className="font-mono text-[11px] tracking-[0.18em] uppercase block rounded-lg px-3 py-2"
              >
                Register
              </Link>
            </div>
          </div>
        </div>
      </nav>
    </header>
  );
}

// Real-time Clock Component
function Clock() {
  const [time, setTime] = useState("");
  const location = "LONDON, UK";

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const timeStr = now.toLocaleTimeString("en-US", {
        hour12: false,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        timeZone: "Europe/London",
      });
      setTime(timeStr);
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="font-mono">
      {location} {time}
    </div>
  );
}

function BottomLeftTagline() {
  const taglines = [
    "BY PEOPLE, FOR PEOPLE OPERATIONS.",
    "BUILT BY PEOPLE, FOR PEOPLE TEAMS.",
    "PEOPLE OPS, MADE BY ACTUAL PEOPLE.",
    "FOR PEOPLE TEAMS, BY PEOPLE PEOPLE.",
    "LESS ADMIN. MORE ACTUAL PEOPLE.",
    "HR, BUT MAKE IT HUMAN.",
    "KEEP THE HUMANS. DROP THE CHAOS.",
    "PEOPLE STUFF, WITHOUT THE STUFFINESS.",
    "BY PEOPLE. FOR PEOPLE. ZERO NONSENSE.",
    "YOUR TEAM RUNS ON PEOPLE, NOT SPREADSHEETS.",
    "MADE FOR PEOPLE WHO MANAGE PEOPLE.",
    "WE PUT THE \"HUMAN\" BACK IN HR.",
  ];
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(Math.floor(Math.random() * taglines.length));
  }, [taglines.length]);

  return (
    <p className="font-mono">{taglines[index]}</p>
  );
}

// Hero Section
function HeroSection() {
  const sectionRef = useRef<HTMLElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [hoverOffset, setHoverOffset] = useState({ x: 0, y: 0 });
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  const setRestingPosition = () => {
    if (!sectionRef.current || !cardRef.current) return;
    const sectionRect = sectionRef.current.getBoundingClientRect();
    const cardRect = cardRef.current.getBoundingClientRect();
    const paddingX = 24;
    const paddingY = 24;
    const x = Math.max(0, sectionRect.width - cardRect.width - paddingX);
    const y = Math.max(0, sectionRect.height - cardRect.height - paddingY);
    setHoverOffset({ x, y });
  };

  useEffect(() => {
    setRestingPosition();
    window.addEventListener("resize", setRestingPosition);
    return () => window.removeEventListener("resize", setRestingPosition);
  }, []);

  const handleHeroMouseMove = (event: MouseEvent<HTMLElement>) => {
    if (!cardRef.current) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const cardRect = cardRef.current.getBoundingClientRect();
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    const normalizedX = mouseX / rect.width - 0.5;
    const normalizedY = mouseY / rect.height - 0.5;
    const targetX = mouseX - cardRect.width / 2;
    const targetY = mouseY - cardRect.height / 2;
    const boundedX = Math.max(0, Math.min(rect.width - cardRect.width, targetX));
    const boundedY = Math.max(0, Math.min(rect.height - cardRect.height, targetY));

    setHoverOffset({
      x: boundedX,
      y: boundedY,
    });
    // Floating paper feel: movement direction causes opposite-side "push" tilt.
    setTilt({
      x: -normalizedY * 14,
      y: normalizedX * 16,
    });
  };

  const handleHeroMouseLeave = () => {
    setRestingPosition();
    setTilt({ x: 0, y: 0 });
  };

  return (
    <section
      ref={sectionRef}
      className="min-h-screen pt-20 pb-12 px-4 md:px-8 relative overflow-hidden"
      onMouseMove={handleHeroMouseMove}
      onMouseLeave={handleHeroMouseLeave}
    >
      <div className="max-w-7xl mx-auto relative min-h-[calc(100vh-8rem)]">
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <h1 className="font-grot text-[clamp(3.5rem,14vw,10rem)] leading-[0.85] text-center">
            <span className="block">RUN</span>
            <span className="block">
              YOUR <span style={{ color: "#f38f0c" }}>TEAM</span>
            </span>
            <span className="block">BETTER</span>
          </h1>
        </div>

        {/* Portfolio Image */}
        <div
          ref={cardRef}
          className="hero-image absolute top-0 left-0 w-full max-w-[260px] md:max-w-[320px] lg:max-w-[350px] z-10"
          style={{
            transform: `perspective(1200px) translate3d(${hoverOffset.x}px, ${hoverOffset.y}px, 0) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) rotateZ(-5deg)`,
            transition: "transform 1100ms cubic-bezier(0.16, 1, 0.3, 1)",
            willChange: "transform",
            transformStyle: "preserve-3d",
          }}
        >
          <Image
            src="https://ext.same-assets.com/2006936780/61881084.jpeg"
            alt="Portfolio Preview"
            width={350}
            height={450}
            className="rounded-lg shadow-2xl"
          />
        </div>
      </div>
    </section>
  );
}

// Featured Client Section (Qonto)
function FeaturedClientSection() {
  return (
    <section className="px-4 md:px-8 py-8">
      <div className="max-w-7xl mx-auto">
        <div
          className="w-full aspect-[16/9] md:aspect-[21/9] rounded-lg flex items-center justify-center relative overflow-hidden"
          style={{ backgroundColor: "var(--surface)" }}
        >
          <div
            className="w-32 h-32 md:w-48 md:h-48 rounded-full flex items-center justify-center border"
            style={{
              backgroundColor: "var(--background)",
              borderColor: "var(--border)",
            }}
          >
            <svg viewBox="0 0 200 50" className="w-24 md:w-36">
              <text
                x="50%"
                y="50%"
                dominantBaseline="middle"
                textAnchor="middle"
                className="font-grot"
                style={{ fontSize: "40px", fill: "var(--foreground)" }}
              >
                Qonto
              </text>
            </svg>
          </div>
        </div>
      </div>
    </section>
  );
}

// Statement Section
function StatementSection() {
  return (
    <section className="px-4 md:px-8 py-20 md:py-32">
      <div className="max-w-5xl mx-auto">
        <p className="font-mono text-xs tracking-wider mb-4">
          CREATIVE STUDIO BUILDING PREMIUM BRANDS
        </p>
        <div className="font-grot text-center">
          <p className="text-[clamp(1.5rem,5vw,3.5rem)] leading-[1.1] mb-4">
            IT'S NEVER "JUST A WEBSITE."
          </p>
          <p className="text-[clamp(1.5rem,5vw,3.5rem)] leading-[1.1] mb-4">
            EVERY <span className="underline-hover">DETAIL</span> MATTERS.
          </p>
          <p className="text-[clamp(1.5rem,5vw,3.5rem)] leading-[1.1] mb-4">
            WE CRAFT DIGITAL
          </p>
          <p className="text-[clamp(1.5rem,5vw,3.5rem)] leading-[1.1] mb-4">
            EXPERIENCES.
          </p>
          <p className="text-[clamp(1.5rem,5vw,3.5rem)] leading-[1.1] mb-4">
            YOUR DESIGN. OUR
          </p>
          <p className="text-[clamp(1.5rem,5vw,3.5rem)] leading-[1.1] mb-4">
            OBSESSION.
          </p>
          <p className="text-[clamp(1.5rem,5vw,3.5rem)] leading-[1.1] mb-4">
            YOUR BRAND. OUR
          </p>
          <p className="text-[clamp(1.5rem,5vw,3.5rem)] leading-[1.1]">
            <span className="underline-hover">PLAYGROUND</span>.
          </p>
        </div>
      </div>
    </section>
  );
}

// Projects Marquee
function ProjectsMarquee() {
  return (
    <div className="overflow-hidden py-8">
      <div className="flex animate-marquee whitespace-nowrap">
        <span className="font-grot text-[clamp(4rem,15vw,12rem)] mx-8">
          PLAYGROUND
        </span>
        <span className="font-grot text-[clamp(4rem,15vw,12rem)] mx-8">
          PLAYGROUND
        </span>
        <span className="font-grot text-[clamp(4rem,15vw,12rem)] mx-8">
          PLAYGROUND
        </span>
        <span className="font-grot text-[clamp(4rem,15vw,12rem)] mx-8">
          PLAYGROUND
        </span>
      </div>
    </div>
  );
}

// Projects Section
function ProjectsSection() {
  const projects = [
    {
      title: "Matera",
      image: "https://ext.same-assets.com/2006936780/327861123.jpeg",
      subtitle: "Le syndic du 21ème siècle",
    },
    {
      title: "Chance",
      image: "https://ext.same-assets.com/2006936780/1619281868.jpeg",
      subtitle: "Rencontrer l'amour pro",
    },
    {
      title: "Silvr",
      image: "https://ext.same-assets.com/2006936780/922578132.jpeg",
      subtitle: "Supercharged Business Loans",
    },
    {
      title: "Intramuros",
      image: "https://ext.same-assets.com/2006936780/2307783140.jpeg",
      subtitle: "Magazine",
    },
  ];

  return (
    <section className="px-4 md:px-8 py-16">
      <div className="max-w-7xl mx-auto">
        <p className="font-mono text-xs tracking-wider mb-12">SELECTED PROJECTS</p>

        <ProjectsMarquee />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-12">
          {projects.map((project, index) => (
            <a
              key={project.title}
              href="#"
              className="project-card block rounded-lg overflow-hidden aspect-[4/3] relative"
            >
              <Image
                src={project.image}
                alt={project.title}
                fill
                className="object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent opacity-0 hover:opacity-100 transition-opacity flex items-end p-6">
                <div>
                  <p className="font-mono text-xs text-[color:var(--background)]/80">{project.subtitle}</p>
                  <p className="font-grot text-2xl text-[color:var(--background)]">{project.title}</p>
                </div>
              </div>
            </a>
          ))}
        </div>
      </div>
    </section>
  );
}

// Services Section
function ServicesSection() {
  const services = [
    "ART DIRECTION",
    "BRANDING",
    "WEBFLOW",
    "UI/UX DESIGN",
    "GSAP ANIMATIONS",
    "3D & MOTION",
    "ADVERTISING",
    "SEO & CONTENT",
  ];

  return (
    <section className="px-4 md:px-8 py-20 md:py-32">
      <div className="max-w-5xl mx-auto">
        <p className="font-mono text-xs tracking-wider mb-12">SERVICES</p>

        <div className="text-center space-y-2">
          {services.map((service, index) => (
            <p
              key={service}
              className="font-grot text-[clamp(2rem,6vw,5rem)] service-item"
            >
              {service}
            </p>
          ))}
        </div>

        <div className="flex justify-center mt-12">
          <a
            href="#"
            className="font-mono text-xs tracking-wider flex items-center gap-2"
          >
            SEE ALL
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M3 8H13M13 8L8 3M13 8L8 13"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </a>
        </div>
      </div>
    </section>
  );
}

// Client Logos Section
function ClientLogosSection() {
  return (
    <section className="px-4 md:px-8 py-16 overflow-hidden">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between gap-8 flex-wrap md:flex-nowrap">
          {/* Qonto */}
          <div className="h-8 md:h-10 opacity-80 hover:opacity-100 transition-opacity">
            <svg viewBox="0 0 100 28" className="h-full w-auto" fill="currentColor">
              <text x="0" y="22" className="font-grot" style={{ fontSize: '24px' }}>Qonto</text>
            </svg>
          </div>
          {/* Matera */}
          <div className="h-8 md:h-10 opacity-80 hover:opacity-100 transition-opacity flex items-center gap-1">
            <svg viewBox="0 0 20 20" className="h-6 w-6" fill="currentColor">
              <path d="M10 0L20 10L10 20L0 10L10 0ZM10 4L4 10L10 16L16 10L10 4Z"/>
            </svg>
            <span className="font-grot text-lg md:text-xl">matera</span>
          </div>
          {/* Chance */}
          <div className="h-8 md:h-10 opacity-80 hover:opacity-100 transition-opacity">
            <span className="font-grot text-lg md:text-xl tracking-wider">CHANCE</span>
          </div>
          {/* Silvr */}
          <div className="h-8 md:h-10 opacity-80 hover:opacity-100 transition-opacity border border-current rounded px-3 py-1 flex items-center">
            <span className="font-mono text-sm md:text-base tracking-wider">SILVR</span>
          </div>
          {/* Alan */}
          <div className="h-8 md:h-10 opacity-80 hover:opacity-100 transition-opacity flex items-center gap-1">
            <div className="flex gap-0.5">
              <div className="w-2 h-2 rounded-full bg-current"/>
              <div className="w-2 h-2 rounded-full bg-current"/>
            </div>
            <span className="font-grot text-lg md:text-xl">alan</span>
          </div>
        </div>
      </div>
    </section>
  );
}

// CTA Section
function CTASection() {
  return (
    <section id="contact" className="px-4 md:px-8 py-20 md:py-32">
      <div className="max-w-5xl mx-auto">
        <div className="relative">
          <h2 className="font-grot text-[clamp(3rem,10vw,8rem)] leading-[0.9]">
            <span className="inline-flex items-center gap-4">
              LET'S WORK
            </span>
            <br />
            <span className="inline-flex items-center gap-4">
              <span className="relative w-16 h-16 md:w-20 md:h-20 rounded-full overflow-hidden inline-block align-middle">
                <Image
                  src="https://ext.same-assets.com/2006936780/1797457886.jpeg"
                  alt="Team"
                  fill
                  className="object-cover"
                />
              </span>
              TOGETHER
            </span>
          </h2>
        </div>

        <div className="mt-12 max-w-lg">
          <p className="text-lg md:text-xl mb-2" style={{ fontFamily: "var(--font-inter), ui-sans-serif, system-ui", fontWeight: 400 }}>
            Work with us if average isn't your thing.
          </p>
          <p className="text-lg md:text-xl mb-8" style={{ fontFamily: "var(--font-inter), ui-sans-serif, system-ui", fontWeight: 400 }}>
            Drop it, we'll build it!
          </p>

          <a
            href="mailto:hello@campsite.com"
            className="font-mono text-xs tracking-wider flex items-center gap-2"
          >
            SAY HELLO
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M3 8H13M13 8L8 3M13 8L8 13"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </a>
        </div>
      </div>
    </section>
  );
}

// Footer Section
function Footer() {
  const portfolioImages = [
    "https://ext.same-assets.com/2006936780/630733741.webp",
    "https://ext.same-assets.com/2006936780/285698998.webp",
    "https://ext.same-assets.com/2006936780/1212099148.webp",
    "https://ext.same-assets.com/2006936780/1538916670.webp",
    "https://ext.same-assets.com/2006936780/4246339478.webp",
  ];

  return (
    <footer className="px-4 md:px-8 py-16 mt-12">
      <div className="max-w-7xl mx-auto">
        {/* Portfolio Thumbnails */}
        <div className="flex gap-4 mb-12 overflow-x-auto pb-4">
          {portfolioImages.map((img, i) => (
            <div
              key={`footer-img-${i}`}
              className="w-24 h-16 md:w-32 md:h-20 rounded overflow-hidden flex-shrink-0"
            >
              <Image
                src={img}
                alt={`Portfolio ${i + 1}`}
                width={128}
                height={80}
                className="object-cover w-full h-full"
              />
            </div>
          ))}
        </div>

        {/* Footer Content */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
          {/* Left Column - Navigation */}
          <div>
            <nav className="space-y-2 mb-8">
              <Link href="/" className="font-mono text-xs tracking-wider block">
                HOME
              </Link>
              <Link href="/work" className="font-mono text-xs tracking-wider block">
                WORK
              </Link>
              <Link href="/services" className="font-mono text-xs tracking-wider block">
                SERVICES
              </Link>
              <Link href="/studio" className="font-mono text-xs tracking-wider block">
                STUDIO
              </Link>
              <Link href="/plans" className="font-mono text-xs tracking-wider block">
                PLANS
              </Link>
              <Link href="/approach" className="font-mono text-xs tracking-wider block">
                APPROACH
              </Link>
              <Link href="/news" className="font-mono text-xs tracking-wider block">
                NEWS
              </Link>
            </nav>

            <nav className="space-y-2">
              <a
                href="https://youtube.com/@GabrielSchemoul"
                className="font-mono text-xs tracking-wider block"
              >
                YOUTUBE
              </a>
              <a
                href="https://linkedin.com/company/studio-namma"
                className="font-mono text-xs tracking-wider block"
              >
                LINKEDIN
              </a>
              <a
                href="https://instagram.com/studio.namma"
                className="font-mono text-xs tracking-wider block"
              >
                INSTAGRAM
              </a>
              <Link href="/legal" className="font-mono text-xs tracking-wider block">
                LEGAL
              </Link>
              <Link href="/fr" className="font-mono text-xs tracking-wider block">
                SITE EN FRANCAIS
              </Link>
            </nav>
          </div>

          {/* Right Column - Info */}
          <div>
            <p className="font-mono text-xs tracking-wider mb-6">
              WE ARE A CREATIVE STUDIO BASED IN
              <br />
              PARIS, BARCELONA & LONDON.
            </p>

            <p className="font-mono text-xs tracking-wider mb-6">
              BIG PROJECT? CRAZY THOUGHT? OR
              <br />
              JUST FEEL LIKE CHATTING?
            </p>

            <a
              href="#contact"
              className="font-mono text-xs tracking-wider mb-8 block"
            >
              LET'S TALK!
            </a>

            <a
              href="mailto:hello@campsite.com"
              className="font-mono text-xs tracking-wider mb-12 block"
            >
              HELLO@CAMPSITE.COM
            </a>

            <p className="font-mono text-xs tracking-wider">
              COPYRIGHT 2025
              <br />
              CAMPSITE
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}

// Cookie Banner
function CookieBanner() {
  const [isVisible, setIsVisible] = useState(true);

  if (!isVisible) return null;

  return (
    <div className="fixed bottom-4 left-4 max-w-sm p-6 cookie-banner text-[color:var(--foreground)] rounded-lg z-50">
      <p className="text-sm mb-4">
        We care about your data, and we'd use cookies only to improve your
        experience. By using this website, you accept our{" "}
        <Link href="/legal" className="underline">
          Cookies Policy
        </Link>
        .
      </p>
      <button
        type="button"
        onClick={() => setIsVisible(false)}
        className="font-mono text-xs tracking-wider flex items-center gap-2"
      >
        ACCEPT COOKIES
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M3 8H13M13 8L8 3M13 8L8 13"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </div>
  );
}

// Main Page Component
export default function Home() {
  return (
    <main className="min-h-screen">
      <Navigation />
      <div className="fixed bottom-0 left-0 z-40 p-2">
        <BottomLeftTagline />
      </div>
      <div className="fixed bottom-0 right-0 z-40 p-2">
        <Clock />
      </div>
      <HeroSection />
      <FeaturedClientSection />
      <StatementSection />
      <ProjectsSection />
      <ServicesSection />
      <ClientLogosSection />
      <CTASection />
      <Footer />
      <CookieBanner />
    </main>
  );
}
