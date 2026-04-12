'use client';

import { useCallback, useState } from 'react';
import { BroadcastBodyEditor } from '@/components/broadcasts/BroadcastBodyEditor';
import { LegalMarkdownArticle } from '@/components/legal/LegalMarkdownArticle';
import { upsertPlatformLegalSettings } from '@/app/(founders)/founders/platform-actions';
import type { PlatformLegalSettings } from '@/lib/legal/types';

type DocTab = 'terms' | 'privacy' | 'data_processing';

export function FounderLegalPoliciesPanel({
  initial,
  onSaved,
}: {
  initial: PlatformLegalSettings;
  onSaved?: (next: PlatformLegalSettings) => void;
}) {
  const [bundleVersion, setBundleVersion] = useState(initial.bundle_version);
  const [effectiveLabel, setEffectiveLabel] = useState(initial.effective_label);
  const [termsMd, setTermsMd] = useState(initial.terms_markdown);
  const [privacyMd, setPrivacyMd] = useState(initial.privacy_markdown);
  const [dataMd, setDataMd] = useState(initial.data_processing_markdown);
  const [tab, setTab] = useState<DocTab>('terms');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const currentMarkdown = tab === 'terms' ? termsMd : tab === 'privacy' ? privacyMd : dataMd;
  const setCurrentMarkdown = useCallback(
    (m: string) => {
      if (tab === 'terms') setTermsMd(m);
      else if (tab === 'privacy') setPrivacyMd(m);
      else setDataMd(m);
    },
    [tab]
  );

  async function handleSave() {
    setMessage(null);
    setBusy(true);
    const res = await upsertPlatformLegalSettings({
      bundleVersion: bundleVersion.trim(),
      effectiveLabel: effectiveLabel.trim(),
      termsMarkdown: termsMd,
      privacyMarkdown: privacyMd,
      dataProcessingMarkdown: dataMd,
    });
    setBusy(false);
    if (!res.ok) {
      setMessage(`Error: ${res.error}`);
      return;
    }
    const next: PlatformLegalSettings = {
      bundle_version: bundleVersion.trim(),
      effective_label: effectiveLabel.trim(),
      terms_markdown: termsMd,
      privacy_markdown: privacyMd,
      data_processing_markdown: dataMd,
      updated_at: new Date().toISOString(),
    };
    onSaved?.(next);
    setMessage('Saved. Public pages and new registrations will use this bundle version.');
  }

  return (
    <div>
      <div className="page-title">Legal policies</div>
      <div className="page-sub" style={{ marginBottom: 20 }}>
        Edit Terms, Privacy, and Data processing in Markdown (same format as broadcasts). Saving updates live public pages.
      </div>

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <div className="section-title" style={{ marginBottom: 14 }}>
          Version
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div className="field">
            <label htmlFor="legal-bundle">Bundle version</label>
            <input
              id="legal-bundle"
              value={bundleVersion}
              onChange={(e) => setBundleVersion(e.target.value)}
              placeholder="e.g. 2026-06-01"
            />
          </div>
          <div className="field">
            <label htmlFor="legal-effective">Effective date (label)</label>
            <input
              id="legal-effective"
              value={effectiveLabel}
              onChange={(e) => setEffectiveLabel(e.target.value)}
              placeholder="e.g. 1 June 2026"
            />
          </div>
        </div>
      </div>

      <div className="card card-pad">
        <div className="section-title" style={{ marginBottom: 12 }}>
          Documents
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
          {(
            [
              ['terms', 'Terms of service'],
              ['privacy', 'Privacy policy'],
              ['data_processing', 'Data processing'],
            ] as const
          ).map(([k, label]) => (
            <button
              key={k}
              type="button"
              className={`filter-pill${tab === k ? ' active' : ''}`}
              onClick={() => setTab(k)}
            >
              {label}
            </button>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <div style={{ fontSize: 11.5, color: 'var(--text3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Editor
            </div>
            <div
              className="campsite-paper rounded-lg border border-[var(--campsite-border)] bg-[var(--campsite-bg)] p-3"
              style={{ minHeight: 320 }}
            >
              <BroadcastBodyEditor
                key={tab}
                markdown={currentMarkdown}
                onMarkdownChange={setCurrentMarkdown}
                placeholder="Write Markdown…"
              />
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11.5, color: 'var(--text3)', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Preview (member view)
            </div>
            <div
              className="campsite-paper rounded-lg border border-[var(--campsite-border)] bg-[var(--campsite-bg)] p-4"
              style={{ minHeight: 320, maxHeight: 480, overflow: 'auto' }}
            >
              <LegalMarkdownArticle markdown={currentMarkdown} />
            </div>
          </div>
        </div>

        <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void handleSave()}>
            {busy ? 'Saving…' : 'Save & publish'}
          </button>
          {message ? (
            <span
              style={{
                fontSize: 13,
                color: message.startsWith('Error:') ? 'var(--red)' : 'var(--green)',
              }}
            >
              {message}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
