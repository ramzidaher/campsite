import Link from 'next/link';

import { CampsiteLogoMark } from '@/components/CampsiteLogoMark';

function ProductPreview() {
  return (
    <div className="relative mx-auto w-full max-w-[520px] lg:mx-0 lg:max-w-none">
      <div
        className="pointer-events-none absolute -inset-8 rounded-[2rem] bg-gradient-to-br from-[#121212]/[0.06] via-transparent to-[#c4a574]/[0.08] blur-2xl"
        aria-hidden
      />
      <div className="relative rounded-2xl border border-[#e4e2de] bg-white p-2 shadow-[0_32px_64px_-16px_rgba(18,18,18,0.14),0_0_0_1px_rgba(18,18,18,0.04)]">
        <div className="flex items-center gap-1.5 px-3 py-2">
          <span className="h-2.5 w-2.5 rounded-full bg-[#e8e6e3]" aria-hidden />
          <span className="h-2.5 w-2.5 rounded-full bg-[#e8e6e3]" aria-hidden />
          <span className="h-2.5 w-2.5 rounded-full bg-[#e8e6e3]" aria-hidden />
          <span className="ml-2 flex-1 rounded-md bg-[#f3f1ed] py-1 text-center text-[10px] text-[#9b9b9b]">
            camp-site.co.uk
          </span>
        </div>
        <div className="mt-1 flex h-[min(320px,52vw)] min-h-[240px] overflow-hidden rounded-xl bg-[#f6f5f2] sm:h-[340px] sm:min-h-[280px]">
          <div className="flex w-[32%] min-w-[100px] flex-col bg-[#121212] px-3 py-4">
            <div className="mb-5 flex items-center gap-2">
              <CampsiteLogoMark className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-lg bg-white/10" />
              <div className="h-2 w-14 rounded bg-white/25" aria-hidden />
            </div>
            <div className="space-y-2.5">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className={[
                    'h-2 rounded',
                    i === 1 ? 'w-[85%] bg-white/35' : 'w-[70%] bg-white/12',
                  ].join(' ')}
                  aria-hidden
                />
              ))}
            </div>
            <div className="mt-auto space-y-2 border-t border-white/10 pt-4">
              <div className="h-2 w-[55%] rounded bg-white/10" aria-hidden />
              <div className="h-2 w-[40%] rounded bg-white/10" aria-hidden />
            </div>
          </div>
          <div className="flex flex-1 flex-col p-4 sm:p-5">
            <div className="mb-4 flex items-center justify-between gap-2">
              <div className="h-3 w-28 rounded-md bg-[#dcd9d4]" aria-hidden />
              <div className="h-7 w-20 rounded-lg bg-[#121212]/90" aria-hidden />
            </div>
            <div className="space-y-3">
              <div className="rounded-xl border border-[#e8e6e3] bg-white p-3 shadow-sm">
                <div className="mb-2 h-2 w-3/4 max-w-[200px] rounded bg-[#e8e6e3]" aria-hidden />
                <div className="space-y-1.5">
                  <div className="h-1.5 w-full rounded bg-[#f0eeea]" aria-hidden />
                  <div className="h-1.5 w-[92%] rounded bg-[#f0eeea]" aria-hidden />
                  <div className="h-1.5 w-[78%] rounded bg-[#f0eeea]" aria-hidden />
                </div>
              </div>
              <div className="rounded-xl border border-[#e8e6e3] bg-white p-3 shadow-sm">
                <div className="mb-2 h-2 w-1/2 max-w-[140px] rounded bg-[#e8e6e3]" aria-hidden />
                <div className="h-1.5 w-full rounded bg-[#f0eeea]" aria-hidden />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

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
        <section className="relative overflow-hidden">
          <div
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(18,18,18,0.07),transparent)]"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute -right-[20%] top-1/4 h-[min(90vw,520px)] w-[min(90vw,520px)] rounded-full border border-[#121212]/[0.05]"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute -left-[15%] bottom-0 h-[min(70vw,400px)] w-[min(70vw,400px)] rounded-full border border-[#121212]/[0.035]"
            aria-hidden
          />

          <div className="relative mx-auto max-w-6xl px-5 pb-24 pt-14 sm:px-8 sm:pb-32 sm:pt-20 lg:grid lg:grid-cols-[1fr_min(46%,480px)] lg:items-center lg:gap-x-16 lg:gap-y-12 lg:pb-36 lg:pt-24">
            <div className="text-center lg:text-left">
              <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#e8e6e3] bg-white/60 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8a8a8a] shadow-sm backdrop-blur-sm">
                <span className="h-1 w-1 rounded-full bg-[#15803d]" aria-hidden />
                Common Ground Studios
              </p>
              <h1 className="font-authSerif text-[2.5rem] leading-[1.08] tracking-[-0.02em] sm:text-5xl sm:leading-[1.06] lg:text-[3.5rem] lg:leading-[1.05]">
                Your team,
                <br className="hidden sm:block" />{' '}
                <span className="text-[#3d3d3d]">
                  <em className="italic text-[#525252]">connected</em> and organised.
                </span>
              </h1>
              <p className="mx-auto mt-6 max-w-md text-[1.05rem] leading-relaxed text-[#5c5c5c] lg:mx-0 lg:max-w-lg lg:text-lg">
                A calm, focused workspace for internal comms and day-to-day operations - for organisations
                that want more than a group chat and a spreadsheet.
              </p>
              <div className="mt-10 flex flex-col items-stretch gap-3 sm:flex-row sm:justify-center lg:justify-start">
                <Link
                  href="/register"
                  className="inline-flex h-[3.25rem] items-center justify-center rounded-[10px] bg-[#121212] text-sm font-medium text-[#faf9f6] shadow-[0_1px_2px_rgba(0,0,0,0.06)] transition-[opacity,transform] hover:opacity-95 active:scale-[0.99] sm:min-w-[168px]"
                >
                  Create an account
                </Link>
                <Link
                  href="/login"
                  className="inline-flex h-[3.25rem] items-center justify-center rounded-[10px] border border-[#d8d6d2] bg-white text-sm font-medium text-[#121212] shadow-sm transition-colors hover:bg-[#f5f3ef] sm:min-w-[168px]"
                >
                  Sign in
                </Link>
              </div>
              <p className="mx-auto mt-8 max-w-sm text-xs leading-relaxed text-[#9b9b9b] lg:mx-0">
                Already with Campsite? Sign in with your work email, or use the link your organisation sent
                you.
              </p>
            </div>

            <div className="mt-16 lg:mt-0">
              <ProductPreview />
            </div>
          </div>
        </section>

        <section className="relative border-t border-[#ebe9e6] bg-[#121212] px-5 py-20 text-[#faf9f6] sm:px-8 sm:py-28">
          <div
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_80%_at_100%_50%,rgba(255,255,255,0.06),transparent)]"
            aria-hidden
          />
          <div
            className="pointer-events-none absolute left-1/2 top-1/2 h-[min(100vw,420px)] w-[min(100vw,420px)] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/[0.06]"
            aria-hidden
          />
          <div className="relative mx-auto max-w-2xl text-center">
            <h2 className="font-authSerif text-[1.75rem] leading-snug tracking-tight sm:text-3xl sm:leading-tight">
              Start in minutes. Your manager approves access when you&apos;re ready.
            </h2>
            <p className="mt-5 text-sm leading-relaxed text-white/50 sm:text-base">
              Register with your organisation email. Most teams hear back within a working day.
            </p>
            <Link
              href="/register"
              className="mt-10 inline-flex h-[3.25rem] items-center justify-center rounded-[10px] bg-[#faf9f6] px-10 text-sm font-medium text-[#121212] transition-[opacity,transform] hover:opacity-95 active:scale-[0.99]"
            >
              Get started
            </Link>
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
              Internal communications for teams and organisations - from Common Ground Studios Ltd.
            </p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm font-medium text-[#5c5c5c] sm:justify-end">
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
