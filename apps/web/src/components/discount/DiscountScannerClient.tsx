'use client';

import { useEffect, useRef, useState } from 'react';

type VerifyTokenResponse =
  | {
      valid: true;
      name: string;
      role: string;
      department: string;
      discount_label: string | null;
      discount_value?: string | null;
      valid_at?: string | null;
    }
  | { valid: false; error?: string };

function buildDemoResult(token: string): VerifyTokenResponse {
  if (!token.trim()) {
    return { valid: false, error: 'No QR data found.' };
  }

  return {
    valid: true,
    name: 'Demo staff member',
    role: 'org_admin',
    department: 'Frontend preview',
    discount_label: 'Frontend preview only',
    discount_value: null,
    valid_at: 'Verification backend removed',
  };
}

export function DiscountScannerClient() {
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
          setResult(buildDemoResult(decodedText));
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
  }, [result, sessionKey]);

  function scanAgain() {
    busyRef.current = false;
    setResult(null);
    setSessionKey((k) => k + 1);
  }

  return (
    <div className="mx-auto max-w-lg space-y-6 px-5 py-7 sm:px-[28px]">
      <div>
        <h1 className="font-authSerif text-[22px] tracking-tight text-[#121212]">Verify staff QR</h1>
        <p className="mt-1 text-[13px] text-[#6b6b6b]">
          Point the camera at a colleague&apos;s discount QR code for a frontend-only preview.
        </p>
      </div>

      {!result ? (
        <div className="space-y-2">
          <div
            key={sessionKey}
            id="staff-discount-scanner"
            className="overflow-hidden rounded-xl border border-[#d8d8d8]"
          />
          {!scannerReady ? (
            <p className="text-[13px] text-[#6b6b6b]">Starting camera...</p>
          ) : null}
        </div>
      ) : result.valid ? (
        <div className="space-y-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <div className="rounded-lg bg-[#15803d] px-3 py-2 text-center text-[13px] font-semibold text-white">
            Valid - Active Staff
          </div>
          <dl className="space-y-2 text-[13px]">
            <div>
              <dt className="text-[#9b9b9b]">Name</dt>
              <dd className="font-medium text-[#121212]">{result.name}</dd>
            </div>
            <div>
              <dt className="text-[#9b9b9b]">Role</dt>
              <dd className="capitalize text-[#121212]">{result.role.replace(/_/g, ' ')}</dd>
            </div>
            <div>
              <dt className="text-[#9b9b9b]">Department</dt>
              <dd className="text-[#121212]">{result.department}</dd>
            </div>
            <div>
              <dt className="text-[#9b9b9b]">Entitled to</dt>
              <dd className="text-[#121212]">{result.discount_label ?? '-'}</dd>
            </div>
            {result.valid_at ? (
              <div>
                <dt className="text-[#9b9b9b]">Status</dt>
                <dd className="text-[#121212]">{result.valid_at}</dd>
              </div>
            ) : null}
          </dl>
          <button
            type="button"
            onClick={() => scanAgain()}
            className="w-full rounded-lg border border-[#d8d8d8] bg-white py-2.5 text-[13px] font-medium text-[#121212] hover:bg-[#f5f4f1]"
          >
            Scan another
          </button>
        </div>
      ) : (
        <div className="space-y-4 rounded-xl border border-red-200 bg-red-50 p-4">
          <div className="rounded-lg bg-[#b91c1c] px-3 py-2 text-center text-[13px] font-semibold text-white">
            QR preview unavailable
          </div>
          <p className="text-[13px] text-[#6b6b6b]">{result.error ?? 'Try again.'}</p>
          <button
            type="button"
            onClick={() => scanAgain()}
            className="w-full rounded-lg border border-[#d8d8d8] bg-white py-2.5 text-[13px] font-medium text-[#121212] hover:bg-[#f5f4f1]"
          >
            Scan again
          </button>
        </div>
      )}
    </div>
  );
}
