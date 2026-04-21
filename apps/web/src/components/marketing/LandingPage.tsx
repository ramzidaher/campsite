import Link from 'next/link';

import { CampsiteLogoMark } from '@/components/CampsiteLogoMark';

const features = [
  {
    index: '01',
    title: 'Comms and announcements',
    description:
      'Publish updates, approvals, and unread tracking so important messages do not get buried.',
    items: ['Broadcasts with approvals', 'Unread tracking and alerts', 'Org-wide notifications'],
  },
  {
    index: '02',
    title: 'Scheduling and attendance',
    description:
      'Manage rota requests, shift swaps, attendance, and time-off approvals from one place.',
    items: ['Rota planning and swaps', 'Attendance tools', 'Leave and absence workflows'],
  },
  {
    index: '03',
    title: 'Recruitment and onboarding',
    description:
      'Handle jobs, applications, interviews, offers, and onboarding without jumping across systems.',
    items: [
      'Public jobs pages',
      'Application and interview tracking',
      'Offer templates and onboarding',
    ],
  },
  {
    index: '04',
    title: 'People operations',
    description:
      'Support managers and HR with records, performance cycles, one-to-ones, and operational reporting.',
    items: ['HR records and org structure', 'Performance and reviews', 'One-to-ones and follow-ups'],
  },
];

const roles = [
  {
    title: 'Admins',
    text: 'Control access, permissions, departments, and system-wide operations with one clear command layer.',
  },
  {
    title: 'Managers',
    text: 'Review requests, run teams, follow recruitment activity, and keep your department coordinated.',
  },
  {
    title: 'HR teams',
    text: 'Track recruitment, onboarding, records, attendance, and performance with purpose-built workflows.',
  },
  {
    title: 'Employees',
    text: 'Get updates, manage leave, check rota, and stay connected without chasing information in chats.',
  },
];

export function LandingPage() {
  return (
    <div className="min-h-screen bg-[#faf9f6] text-[#121212]">
      <header className="sticky top-0 z-20 border-b border-[#ebe9e6]/80 bg-[#faf9f6]/80 backdrop-blur-xl">
        <div className="mx-auto flex h-[4.25rem] max-w-6xl items-center justify-between px-5 sm:px-8">
          <Link href="/" className="flex items-center gap-2.5 transition-opacity hover:opacity-85">
            <CampsiteLogoMark className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-[10px] bg-[#121212] shadow-sm" />
            <span className="font-authSerif text-xl tracking-tight">Campsite</span>
          </Link>
          <nav className="flex items-center gap-1 sm:gap-2">
            <Link
              href="/login"
              className="rounded-full px-4 py-2.5 text-sm font-medium text-[#5c5c5c] transition-colors hover:text-[#121212]"
            >
              Sign in
            </Link>
            <Link
              href="/register"
              className="rounded-full bg-[#121212] px-4 py-2.5 text-sm font-medium text-[#faf9f6] shadow-sm transition-[opacity,transform] hover:opacity-95 active:scale-[0.98]"
            >
              Get started
            </Link>
          </nav>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden px-5 pb-32 pt-24 sm:px-8 sm:pb-44 sm:pt-36">
          <div
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_70%_55%_at_50%_0%,rgba(196,165,116,0.09),transparent)]"
            aria-hidden
          />
          <div className="relative mx-auto max-w-4xl text-center">
            <p className="mb-8 inline-flex items-center gap-2 rounded-full border border-[#e8e6e3] bg-white/60 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8a8a8a] shadow-sm backdrop-blur-sm">
              <span className="h-1 w-1 rounded-full bg-[#15803d]" aria-hidden />
              Common Ground Studios
            </p>
            <h1 className="font-authSerif text-[2.75rem] leading-[1.06] tracking-[-0.025em] sm:text-[4rem] sm:leading-[1.04] lg:text-[5.25rem] lg:leading-[1.03]">
              Your team,{' '}
              <em className="italic text-[#6b6b6b]">connected</em>
              <br />
              and organised.
            </h1>
            <p className="mx-auto mt-8 max-w-xl text-base leading-relaxed text-[#5c5c5c] sm:text-lg">
              A calm, focused workspace for internal comms and day-to-day operations — for
              organisations that want more than a group chat and a spreadsheet.
            </p>
            <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <Link
                href="/register"
                className="inline-flex h-[3.25rem] items-center justify-center rounded-[10px] bg-[#121212] px-9 text-sm font-medium text-[#faf9f6] shadow-[0_1px_2px_rgba(0,0,0,0.06)] transition-[opacity,transform] hover:opacity-95 active:scale-[0.99]"
              >
                Create an account
              </Link>
              <Link
                href="/login"
                className="inline-flex h-[3.25rem] items-center justify-center rounded-[10px] border border-[#d8d6d2] bg-white px-9 text-sm font-medium text-[#121212] shadow-sm transition-colors hover:bg-[#f5f3ef]"
              >
                Sign in
              </Link>
            </div>
          </div>
        </section>

        <section className="border-t border-[#ebe9e6]">
          <div className="mx-auto max-w-6xl px-5 pb-10 pt-16 sm:px-8 sm:pt-20">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8a8a8a]">
              What you can run in Campsite
            </p>
            <h2 className="mt-3 font-authSerif text-3xl leading-tight tracking-tight sm:text-4xl">
              More than messaging.{' '}
              <span className="text-[#8a8a8a]">A full operations workspace.</span>
            </h2>
          </div>
          <div className="grid grid-cols-1 gap-px bg-[#ebe9e6] border-t border-[#ebe9e6] sm:grid-cols-2">
            {features.map((feature) => (
              <article key={feature.index} className="bg-[#faf9f6] px-8 py-14 sm:px-14 sm:py-16">
                <span className="block font-authSerif text-[4rem] leading-none tracking-tight text-[#e8e6e3] sm:text-[5.5rem]">
                  {feature.index}
                </span>
                <h3 className="mt-5 font-authSerif text-2xl tracking-tight sm:text-3xl">
                  {feature.title}
                </h3>
                <p className="mt-4 text-sm leading-relaxed text-[#5c5c5c] sm:text-base">
                  {feature.description}
                </p>
                <ul className="mt-7 space-y-3">
                  {feature.items.map((item) => (
                    <li key={item} className="flex items-start gap-3 text-sm text-[#3d3d3d]">
                      <span className="mt-[0.45rem] h-1.5 w-1.5 shrink-0 rounded-full bg-[#c4b89a]" />
                      {item}
                    </li>
                  ))}
                </ul>
              </article>
            ))}
          </div>
        </section>

        <section className="border-t border-[#ebe9e6] px-5 py-20 sm:px-8 sm:py-28">
          <div className="mx-auto max-w-6xl">
            <div className="mb-10 max-w-xl">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#8a8a8a]">
                Built for every role
              </p>
              <h2 className="mt-3 font-authSerif text-3xl leading-tight tracking-tight sm:text-4xl">
                One platform, role-aware by design.
              </h2>
            </div>
            <div className="overflow-hidden rounded-2xl border border-[#ebe9e6] grid grid-cols-1 gap-px bg-[#ebe9e6] sm:grid-cols-2 lg:grid-cols-4">
              {roles.map((role) => (
                <article key={role.title} className="bg-white px-7 py-9">
                  <h3 className="font-authSerif text-xl tracking-tight">{role.title}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-[#5c5c5c]">{role.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="border-t border-[#ebe9e6] bg-[#f5f3ef] px-5 py-24 sm:px-8 sm:py-32">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="font-authSerif text-[2rem] leading-snug tracking-tight sm:text-[2.75rem] sm:leading-[1.1]">
              Replace scattered tools with one calm system.
            </h2>
            <p className="mx-auto mt-6 max-w-lg text-sm leading-relaxed text-[#5c5c5c] sm:text-base">
              Instead of separate chats, spreadsheets, and disconnected HR workflows, Campsite gives
              your organisation a shared operating layer for communication and people operations.
            </p>
            <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
              <Link
                href="/register"
                className="inline-flex h-[3.25rem] items-center justify-center rounded-[10px] bg-[#121212] px-9 text-sm font-medium text-[#faf9f6] transition-[opacity,transform] hover:opacity-95 active:scale-[0.99]"
              >
                Create an account
              </Link>
              <Link
                href="/login"
                className="inline-flex h-[3.25rem] items-center justify-center rounded-[10px] border border-[#d8d6d2] bg-white px-9 text-sm font-medium text-[#121212] transition-colors hover:bg-[#ede9e4]"
              >
                Sign in to your workspace
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-[#ebe9e6] bg-[#f5f3ef]/50 px-5 py-12 sm:px-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-8 sm:flex-row sm:items-start">
          <div>
            <div className="flex items-center gap-2.5">
              <CampsiteLogoMark className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg bg-[#121212]" />
              <span className="font-authSerif text-lg tracking-tight">Campsite</span>
            </div>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-[#7a7a7a]">
              Internal communications for teams and organisations — from Common Ground Studios Ltd.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm font-medium text-[#5c5c5c] sm:justify-end">
            <Link href="/terms" className="transition-colors hover:text-[#121212]">
              Terms
            </Link>
            <Link href="/privacy" className="transition-colors hover:text-[#121212]">
              Privacy
            </Link>
            <Link href="/login" className="transition-colors hover:text-[#121212]">
              Sign in
            </Link>
            <Link href="/register" className="transition-colors hover:text-[#121212]">
              Register
            </Link>
          </div>
          <p className="text-center text-xs text-[#9b9b9b] sm:text-right">
            © {new Date().getFullYear()} Common Ground Studios Ltd
          </p>
        </div>
      </footer>
    </div>
  );
}
