'use client';

import Link from 'next/link';

const ISSUES = [
  { quote: 'Can you re-send the rota? I cannot find it.', source: 'WhatsApp group' },
  { quote: 'Who approved Marcus’s holiday?', source: 'Someone’s inbox' },
  { quote: 'The new starter has not been set up yet.', source: 'Slack, probably' },
  { quote: 'Did anyone tell the team about the policy change?', source: 'A spreadsheet' },
  { quote: 'We had three applicants this week. I think.', source: 'Email thread' },
];

export function ProblemSection() {
  return (
    <section className="problem-section px-4 py-16 md:px-8 md:py-20">
      <h2 className="lp-sr-only">Operations problems we solve</h2>
      <div className="mx-auto max-w-7xl">
        <p className="font-mono mb-10 text-xs tracking-wider text-[color:var(--lp-text-muted)]">SOUND FAMILIAR?</p>

        <div className="problem-chaos">
          {ISSUES.map((item, index) => (
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
              Most ops work lives in the gaps between apps, inboxes, and group chats. Nothing is tracked, nothing is
              owned, and as the team grows the operational drag compounds.
            </p>
            <div className="problem-actions">
              <Link href="/register" className="v5-btn-primary">Start your workspace</Link>
              <a href="#contact" className="problem-btn-outline">Book a demo</a>
            </div>
          </article>

          <article className="problem-panel problem-panel-right">
            <div>
              <p className="font-mono problem-eyebrow problem-eyebrow-fix">The fix</p>
              <h3 className="problem-heading problem-heading-fix">One place for everything your team actually needs.</h3>
              <p className="problem-body problem-body-fix">
                Announcements, rota, HR, hiring, and approvals in a single workspace your whole team can use from day
                one.
              </p>
            </div>
            <Link href="/login" className="problem-enter-link">Enter Camp &rarr;</Link>
          </article>
        </div>
      </div>
    </section>
  );
}
