'use client';

import { createClient } from '@/lib/supabase/client';
import { callStaffEdgeFunction, type VerifyTokenResponse } from '@/lib/staffDiscountEdge';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';

export function DiscountScannerClient() {
  const supabase = useMemo(() => createClient(), []);
  const [result, setResult] = useState<VerifyTokenResponse | null>(null);
  const [scannerReady, setScannerReady] = useState(false);
  const [sessionKey, setSessionKey] = useState(0);
  const busyRef = useRef(false);

  useEffect(() => {
    if (result !== null) return;

    let cancelled = false;
    let scanner: { clear: () => Promise<void> } | null = null;

    void (async () => {
      const { Html5QrcodeScanner } = await import('html5-qrcode');
      if (cancelled) return;

      const s = new Html5QrcodeScanner(
        'staff-discount-scanner',
        { fps: 10, qrbox: { width: 260, height: 260 }, aspectRatio: 1 },
        false,
      );
      scanner = s;

      s.render(
        async (decodedText) => {
          if (busyRef.current) return;
          busyRef.current = true;
          try {
            (s as unknown as { pause: (p: boolean) => void }).pause(true);
          } catch {
            /* */
          }
          const res = await callStaffEdgeFunction(supabase, 'staff-discount-verify', {
            token: decodedText.trim(),
          });
          if (!res.ok) {
            setResult({ valid: false, error: res.message });
            busyRef.current = false;
            return;
          }
          setResult(res.data as VerifyTokenResponse);
          busyRef.current = false;
        },
        () => {},
      );
      setScannerReady(true);
    })();

    return () => {
      cancelled = true;
      setScannerReady(false);
      void scanner?.clear().catch(() => {});
    };
  }, [supabase, result, sessionKey]);

  function scanAgain() {
    busyRef.current = false;
    setResult(null);
    setSessionKey((k) => k + 1);
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <Link href="/discount" className="text-sm text-emerald-400 hover:underline">
        ← Back to discount card
      </Link>
      <div>
        <h1 className="text-xl font-semibold text-[var(--campsite-text)]">Verify staff QR</h1>
        <p className="mt-1 text-sm text-[var(--campsite-text-secondary)]">
          Point the camera at a colleague&apos;s discount QR code.
        </p>
      </div>

      {!result ? (
        <div className="space-y-2">
          <div
            key={sessionKey}
            id="staff-discount-scanner"
            className="overflow-hidden rounded-lg border border-[var(--campsite-border)]"
          />
          {!scannerReady ? (
            <p className="text-sm text-[var(--campsite-text-secondary)]">Starting camera…</p>
          ) : null}
        </div>
      ) : result.valid ? (
        <div className="space-y-4 rounded-xl border border-emerald-600/50 bg-emerald-900/20 p-4">
          <div className="rounded-md bg-emerald-600 px-3 py-2 text-center text-sm font-semibold text-white">
            Valid — Active Staff
          </div>
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="text-[var(--campsite-text-muted)]">Name</dt>
              <dd className="font-medium text-[var(--campsite-text)]">{result.name}</dd>
            </div>
            <div>
              <dt className="text-[var(--campsite-text-muted)]">Role</dt>
              <dd className="capitalize text-[var(--campsite-text)]">{result.role.replace(/_/g, ' ')}</dd>
            </div>
            <div>
              <dt className="text-[var(--campsite-text-muted)]">Department</dt>
              <dd className="text-[var(--campsite-text)]">{result.department}</dd>
            </div>
            <div>
              <dt className="text-[var(--campsite-text-muted)]">Entitled to</dt>
              <dd className="text-[var(--campsite-text)]">{result.discount_label ?? '—'}</dd>
            </div>
          </dl>
          <button
            type="button"
            onClick={() => scanAgain()}
            className="w-full rounded-lg border border-[var(--campsite-border)] py-2 text-sm"
          >
            Scan another
          </button>
        </div>
      ) : (
        <div className="space-y-4 rounded-xl border border-red-600/50 bg-red-950/30 p-4">
          <div className="rounded-md bg-red-600 px-3 py-2 text-center text-sm font-semibold text-white">
            Invalid or expired card
          </div>
          <p className="text-sm text-[var(--campsite-text-secondary)]">{result.error ?? 'Try again.'}</p>
          <button
            type="button"
            onClick={() => scanAgain()}
            className="w-full rounded-lg border border-[var(--campsite-border)] py-2 text-sm"
          >
            Scan again
          </button>
        </div>
      )}
    </div>
  );
}
