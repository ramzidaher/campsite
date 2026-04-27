'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BroadcastBodyEditor } from '@/components/broadcasts/BroadcastBodyEditor';
import { LegalMarkdownArticle } from '@/components/legal/LegalMarkdownArticle';
import {
  listLegalAcceptanceEvents,
  upsertPlatformLegalSettings,
  type FounderLegalAcceptanceEvent,
} from '@/app/(founders)/founders/platform-actions';
import { extractMarkdownHeadings, type MarkdownHeading } from '@/lib/legal/markdownHeadings';
import { PUBLIC_LEGAL_DOCS, type LegalPublicDocId } from '@/lib/legal/publicLegalDocs';
import type { PlatformLegalSettings } from '@/lib/legal/types';

type DocTab = LegalPublicDocId;

const DOC_LIST = PUBLIC_LEGAL_DOCS.map(({ id, label }) => ({ id, label }));

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
  const [eventsBusy, setEventsBusy] = useState(false);
  const [eventsError, setEventsError] = useState<string | null>(null);
  const [acceptanceEvents, setAcceptanceEvents] = useState<FounderLegalAcceptanceEvent[]>([]);
  const [tocQuery, setTocQuery] = useState('');
  const pendingHeadingScroll = useRef<string | null>(null);

  const currentMarkdown = tab === 'terms' ? termsMd : tab === 'privacy' ? privacyMd : dataMd;
  const setCurrentMarkdown = useCallback(
    (m: string) => {
      if (tab === 'terms') setTermsMd(m);
      else if (tab === 'privacy') setPrivacyMd(m);
      else setDataMd(m);
    },
    [tab]
  );

  const q = tocQuery.trim().toLowerCase();

  const tocByDoc = useMemo(() => {
    const map: Record<DocTab, MarkdownHeading[]> = {
      terms: extractMarkdownHeadings(termsMd),
      privacy: extractMarkdownHeadings(privacyMd),
      data_processing: extractMarkdownHeadings(dataMd),
    };
    return map;
  }, [termsMd, privacyMd, dataMd]);

  const visibleDocs = useMemo(() => {
    if (!q) return DOC_LIST;
    return DOC_LIST.filter(({ id, label }) => {
      if (id === tab) return true;
      if (label.toLowerCase().includes(q)) return true;
      return tocByDoc[id].some((h) => h.text.toLowerCase().includes(q));
    });
  }, [q, tocByDoc, tab]);

  const filterHeading = useCallback(
    (h: MarkdownHeading) => {
      if (!q) return true;
      return h.text.toLowerCase().includes(q);
    },
    [q]
  );

  const scrollToHeading = useCallback(
    (headingId: string, doc: DocTab) => {
      if (tab !== doc) {
        pendingHeadingScroll.current = headingId;
        setTab(doc);
        return;
      }
      document.getElementById(headingId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
    [tab]
  );

  useEffect(() => {
    const id = pendingHeadingScroll.current;
    if (!id) return;
    pendingHeadingScroll.current = null;
    const t = window.setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
    return () => window.clearTimeout(t);
  }, [tab, currentMarkdown]);

  const loadAcceptanceEvents = useCallback(async () => {
    setEventsBusy(true);
    setEventsError(null);
    const res = await listLegalAcceptanceEvents({
      bundleVersion: bundleVersion.trim() || null,
      limit: 25,
      offset: 0,
    });
    setEventsBusy(false);
    if (!res.ok) {
      setEventsError(res.error);
      return;
    }
    setAcceptanceEvents(res.data);
  }, [bundleVersion]);

  useEffect(() => {
    void loadAcceptanceEvents();
  }, [loadAcceptanceEvents]);

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

      <div
        style={{
          display: 'flex',
          gap: 0,
          alignItems: 'flex-start',
          marginBottom: 16,
        }}
      >
        {/* Left: TOC + search (release-notes style) */}
        <aside
          className="legal-policies-toc"
          style={{
            width: 280,
            flexShrink: 0,
            marginRight: 20,
            padding: '14px 12px',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 10,
            maxHeight: 'calc(100vh - 160px)',
            position: 'sticky',
            top: 12,
            overflowY: 'auto',
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--text3)',
              marginBottom: 10,
            }}
          >
            Table of contents
          </div>
          <div className="search-bar" style={{ marginBottom: 14 }}>
            <span style={{ color: 'var(--text3)', fontSize: 12 }} aria-hidden>
              🔍
            </span>
            <input
              type="search"
              placeholder="Search"
              value={tocQuery}
              onChange={(e) => setTocQuery(e.target.value)}
              aria-label="Filter table of contents"
            />
          </div>
          <nav style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {visibleDocs.length === 0 ? (
              <div style={{ fontSize: 12, color: 'var(--text3)', padding: '8px 0' }}>No sections match.</div>
            ) : (
              visibleDocs.map(({ id, label }) => {
                const headings = tocByDoc[id].filter(filterHeading);
                const isActive = tab === id;
                return (
                  <div key={id}>
                    <button
                      type="button"
                      onClick={() => setTab(id)}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        padding: '8px 10px',
                        borderRadius: 8,
                        border: 'none',
                        background: isActive ? 'var(--surface3)' : 'transparent',
                        color: 'var(--text)',
                        fontSize: 13,
                        fontWeight: isActive ? 600 : 500,
                        cursor: 'pointer',
                        lineHeight: 1.35,
                      }}
                    >
                      {label}
                    </button>
                    {isActive && headings.length > 0 ? (
                      <div style={{ paddingLeft: 8, marginTop: 2, marginBottom: 8 }}>
                        {headings.map((h) => (
                          <button
                            key={`${id}-${h.id}`}
                            type="button"
                            onClick={() => scrollToHeading(h.id, id)}
                            style={{
                              display: 'block',
                              width: '100%',
                              textAlign: 'left',
                              padding: '5px 8px 5px',
                              paddingLeft: h.level === 3 ? 18 : 10,
                              border: 'none',
                              background: 'transparent',
                              color: 'var(--text2)',
                              fontSize: 12,
                              cursor: 'pointer',
                              lineHeight: 1.35,
                              borderRadius: 6,
                            }}
                          >
                            {h.text}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
          </nav>
          <div
            style={{
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--text3)',
              marginTop: 16,
              marginBottom: 8,
              paddingTop: 12,
              borderTop: '1px solid var(--border)',
            }}
          >
            Bundle
          </div>
          <div style={{ fontSize: 12, color: 'var(--text2)', lineHeight: 1.45 }}>
            <span style={{ color: 'var(--text3)' }}>Version</span> {bundleVersion}
            <br />
            <span style={{ color: 'var(--text3)' }}>Effective</span> {effectiveLabel}
          </div>
        </aside>

        {/* Main column */}
        <div style={{ flex: 1, minWidth: 0 }}>
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
              Editor & preview
            </div>
            <p style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 14 }}>
              Document: <strong style={{ color: 'var(--text)' }}>{DOC_LIST.find((d) => d.id === tab)?.label}</strong>
              {' · '}
              Use the left sidebar to switch documents or jump to a section in the preview.
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              <div>
                <div
                  style={{
                    fontSize: 11.5,
                    color: 'var(--text3)',
                    marginBottom: 8,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                  }}
                >
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
                <div
                  style={{
                    fontSize: 11.5,
                    color: 'var(--text3)',
                    marginBottom: 8,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                  }}
                >
                  Preview (member view)
                </div>
                <div
                  className="campsite-paper rounded-lg border border-[var(--campsite-border)] bg-[var(--campsite-bg)] p-4"
                  style={{ minHeight: 320, maxHeight: 480, overflow: 'auto' }}
                >
                  <LegalMarkdownArticle markdown={currentMarkdown} withHeadingAnchors />
                </div>
              </div>
            </div>

            <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void handleSave()}>
                {busy ? 'Saving…' : 'Save & publish'}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={eventsBusy}
                onClick={() => void loadAcceptanceEvents()}
              >
                {eventsBusy ? 'Refreshing consent log…' : 'Refresh consent log'}
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

          <div className="card card-pad" style={{ marginTop: 16 }}>
            <div className="section-title" style={{ marginBottom: 8 }}>
              Legal acceptance audit log
            </div>
            <p style={{ fontSize: 12.5, color: 'var(--text2)', lineHeight: 1.55, marginBottom: 12 }}>
              Immutable events for legal acceptance, including accepted bundle version, timestamp, and legal text
              fingerprint hash.
            </p>
            {eventsError ? (
              <div style={{ marginBottom: 12, fontSize: 12.5, color: 'var(--red)' }}>Error: {eventsError}</div>
            ) : null}
            {acceptanceEvents.length === 0 ? (
              <div style={{ fontSize: 12.5, color: 'var(--text3)' }}>
                {eventsBusy ? 'Loading acceptance records…' : 'No acceptance records found for this bundle yet.'}
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', padding: '8px 6px', borderBottom: '1px solid var(--border)' }}>Accepted</th>
                      <th style={{ textAlign: 'left', padding: '8px 6px', borderBottom: '1px solid var(--border)' }}>Email</th>
                      <th style={{ textAlign: 'left', padding: '8px 6px', borderBottom: '1px solid var(--border)' }}>Bundle</th>
                      <th style={{ textAlign: 'left', padding: '8px 6px', borderBottom: '1px solid var(--border)' }}>Source</th>
                      <th style={{ textAlign: 'left', padding: '8px 6px', borderBottom: '1px solid var(--border)' }}>IP</th>
                      <th style={{ textAlign: 'left', padding: '8px 6px', borderBottom: '1px solid var(--border)' }}>Host/Path</th>
                      <th style={{ textAlign: 'left', padding: '8px 6px', borderBottom: '1px solid var(--border)' }}>Fingerprint</th>
                    </tr>
                  </thead>
                  <tbody>
                    {acceptanceEvents.map((row) => (
                      <tr key={row.id}>
                        <td style={{ padding: '8px 6px', borderBottom: '1px solid var(--border)' }}>
                          {new Date(row.accepted_at).toLocaleString()}
                        </td>
                        <td style={{ padding: '8px 6px', borderBottom: '1px solid var(--border)' }}>{row.email ?? '-'}</td>
                        <td style={{ padding: '8px 6px', borderBottom: '1px solid var(--border)' }}>
                          <code style={{ fontSize: 11.5 }}>{row.bundle_version}</code>
                        </td>
                        <td style={{ padding: '8px 6px', borderBottom: '1px solid var(--border)' }}>{row.acceptance_source}</td>
                        <td style={{ padding: '8px 6px', borderBottom: '1px solid var(--border)' }}>{row.request_ip ?? '-'}</td>
                        <td style={{ padding: '8px 6px', borderBottom: '1px solid var(--border)' }}>
                          {(row.request_host ?? '-') + (row.request_path ? ` ${row.request_path}` : '')}
                        </td>
                        <td style={{ padding: '8px 6px', borderBottom: '1px solid var(--border)' }}>
                          <code style={{ fontSize: 11.5 }}>{row.legal_text_sha256.slice(0, 16)}…</code>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
