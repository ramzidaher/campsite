'use client';

import { submitOfferSignature } from '@/app/(public)/jobs/offer-sign/actions';
import Link from 'next/link';
import { useCallback, useRef, useState, useTransition } from 'react';

type Row = {
  body_html: string;
  status: string;
  org_name: string;
  candidate_name: string;
  job_title: string;
};

export function OfferSignClient({ token, initial }: { token: string; initial: Row }) {
  const [row, setRow] = useState(initial);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [typedName, setTypedName] = useState('');
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const hasInk = useRef(false);

  const clearCanvas = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    hasInk.current = false;
  }, []);

  const getPngDataUrl = (): string | null => {
    const c = canvasRef.current;
    if (!c) return null;
    try {
      return c.toDataURL('image/png');
    } catch {
      return null;
    }
  };

  const onDecline = () => {
    if (!window.confirm('Decline this offer? HR will be notified on the next refresh of their pipeline.')) return;
    setMsg(null);
    startTransition(async () => {
      const r = await submitOfferSignature(token, { decline: true });
      if (!r.ok) {
        setMsg({ type: 'err', text: r.error ?? 'Could not update.' });
        return;
      }
      setRow((x) => ({ ...x, status: 'declined', body_html: '' }));
      setMsg({ type: 'ok', text: 'You have declined this offer.' });
    });
  };

  const onSign = () => {
    setMsg(null);
    const name = typedName.trim();
    if (!name) {
      setMsg({ type: 'err', text: 'Please type your full name as it appears on the offer.' });
      return;
    }
    const sig = getPngDataUrl();
    if (!sig || sig === document.createElement('canvas').toDataURL()) {
      setMsg({ type: 'err', text: 'Please add your signature in the box (draw with your mouse or finger).' });
      return;
    }
    startTransition(async () => {
      const r = await submitOfferSignature(token, {
        decline: false,
        typedName: name,
        signatureDataUrl: sig,
      });
      if (!r.ok) {
        setMsg({ type: 'err', text: r.error ?? 'Could not sign.' });
        return;
      }
      setRow((x) => ({ ...x, status: 'signed', body_html: '' }));
      setMsg({
        type: 'ok',
        text: 'Thank you — your offer is signed. A PDF copy is being sent to your email and to HR.',
      });
    });
  };

  const srcDoc = `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>
    body{font-family:system-ui,-apple-system,sans-serif;padding:20px;line-height:1.55;color:#121212;max-width:720px;margin:0 auto;}
    h1,h2,h3{font-weight:600;}
    ul{padding-left:1.25rem;}
  </style></head><body>${row.body_html || ''}</body></html>`;

  if (row.status === 'signed') {
    return (
      <div className="mx-auto max-w-lg px-5 py-16 text-center">
        <p className="font-authSerif text-xl text-[#121212]">Offer signed</p>
        <p className="mt-3 text-[14px] text-[#505050]">
          Thanks, {initial.candidate_name}. Check your email for a PDF copy.
        </p>
      </div>
    );
  }

  if (row.status === 'declined') {
    return (
      <div className="mx-auto max-w-lg px-5 py-16 text-center">
        <p className="font-authSerif text-xl text-[#121212]">Offer declined</p>
        <p className="mt-3 text-[14px] text-[#505050]">Your response has been recorded.</p>
      </div>
    );
  }

  if (row.status !== 'sent') {
    return (
      <div className="mx-auto max-w-lg px-5 py-16 text-center">
        <p className="text-[14px] text-[#6b6b6b]">This offer link is no longer valid.</p>
        <Link href="/jobs" className="mt-4 inline-block text-[#008B60]">
          Job listings
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#faf9f6] pb-16 text-[#121212]">
      <header className="border-b border-[#ececec] bg-white px-5 py-4">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[#9b9b9b]">{row.org_name}</p>
        <h1 className="font-authSerif text-[22px] tracking-tight">Offer — {row.job_title}</h1>
        <p className="mt-1 text-[13px] text-[#6b6b6b]">{row.candidate_name}</p>
        <p className="mt-1 text-[12px] text-[#9b9b9b]">Secure signing link. No account required.</p>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-8">
        {msg ? (
          <div
            role={msg.type === 'err' ? 'alert' : 'status'}
            className={[
              'mb-4 rounded-lg border px-3 py-2 text-[14px]',
              msg.type === 'err' ? 'border-red-200 bg-red-50 text-red-900' : 'border-emerald-200 bg-emerald-50 text-emerald-950',
            ].join(' ')}
          >
            {msg.text}
          </div>
        ) : null}

        <section className="rounded-xl border border-[#e8e8e8] bg-white shadow-sm">
          <iframe title="Offer letter" className="h-[min(60vh,560px)] w-full rounded-t-xl border-0" srcDoc={srcDoc} />
        </section>

        <section className="mt-8 space-y-4 rounded-xl border border-[#e8e8e8] bg-white p-5 shadow-sm">
          <h2 className="text-[13px] font-semibold text-[#121212]">Your signature</h2>
          <p className="text-[12px] text-[#6b6b6b]">
            Review the letter, draw your signature, type your full name, then confirm. Once submitted, HR and you
            automatically receive a signed PDF copy.
          </p>
          <label className="block text-[12px] font-medium text-[#505050]">
            Full name (must match)
            <input
              value={typedName}
              onChange={(e) => setTypedName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[#d8d8d8] px-3 py-2 text-[14px]"
              autoComplete="name"
            />
          </label>
          <div>
            <p className="text-[12px] font-medium text-[#505050]">Sign in the box</p>
            <canvas
              ref={(el) => {
                canvasRef.current = el;
                if (el && !el.dataset.ready) {
                  el.dataset.ready = '1';
                  el.width = Math.min(720, typeof window !== 'undefined' ? window.innerWidth - 48 : 720);
                  el.height = 140;
                  const ctx = el.getContext('2d');
                  if (ctx) {
                    ctx.fillStyle = '#fff';
                    ctx.fillRect(0, 0, el.width, el.height);
                    ctx.strokeStyle = '#121212';
                    ctx.lineWidth = 2;
                    ctx.lineCap = 'round';
                  }
                }
              }}
              className="mt-1 w-full max-w-[720px] cursor-crosshair touch-none rounded-lg border border-[#d8d8d8] bg-white"
              onPointerDown={(e) => {
                const c = canvasRef.current;
                if (!c) return;
                e.currentTarget.setPointerCapture(e.pointerId);
                drawing.current = true;
                const ctx = c.getContext('2d');
                if (!ctx) return;
                const r = c.getBoundingClientRect();
                ctx.beginPath();
                ctx.moveTo(e.clientX - r.left, e.clientY - r.top);
              }}
              onPointerMove={(e) => {
                if (!drawing.current) return;
                hasInk.current = true;
                const c = canvasRef.current;
                if (!c) return;
                const ctx = c.getContext('2d');
                if (!ctx) return;
                const r = c.getBoundingClientRect();
                ctx.lineTo(e.clientX - r.left, e.clientY - r.top);
                ctx.stroke();
              }}
              onPointerUp={() => {
                drawing.current = false;
              }}
              onPointerLeave={() => {
                drawing.current = false;
              }}
            />
            <button
              type="button"
              onClick={clearCanvas}
              className="mt-2 text-[13px] text-[#008B60] underline"
            >
              Clear signature
            </button>
          </div>

          <div className="flex flex-wrap gap-3 pt-2">
            <button
              type="button"
              disabled={pending}
              onClick={onSign}
              className="rounded-lg bg-[#008B60] px-4 py-2.5 text-[14px] font-medium text-white disabled:opacity-60"
            >
              {pending ? 'Submitting…' : 'Accept & sign offer'}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={onDecline}
              className="rounded-lg border border-[#d8d8d8] bg-white px-4 py-2.5 text-[14px] text-[#b91c1c]"
            >
              Decline offer
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
