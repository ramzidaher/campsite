'use client';

import type { UnsplashPhotoPayload } from '@/lib/unsplash/types';
import { useCallback, useEffect, useId, useState, type ReactNode } from 'react';

type BackdropMode = 'none' | 'image';

function SegmentBtn({
  active = false,
  disabled,
  label,
  onClick,
  children,
}: {
  active?: boolean;
  disabled?: boolean;
  label: string;
  onClick?: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={disabled ? undefined : onClick}
      className={[
        'flex h-10 flex-1 items-center justify-center rounded-xl text-[#121212] transition-all',
        disabled ? 'cursor-not-allowed opacity-35' : '',
        active && !disabled
          ? 'bg-white shadow-[0_1px_4px_rgba(0,0,0,0.12)] ring-1 ring-black/[0.06]'
          : !disabled
            ? 'hover:bg-black/[0.04]'
            : '',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

export function BroadcastBackdropPicker({
  open,
  onOpenChange,
  coverImageUrl,
  canSetCover,
  coverBusy,
  backdropBlur,
  onBackdropBlurChange,
  onApplyImageUrl,
  onRemoveCover,
  onUploadClick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  coverImageUrl: string | null;
  canSetCover: boolean;
  coverBusy: boolean;
  backdropBlur: boolean;
  onBackdropBlurChange: (blur: boolean) => void;
  onApplyImageUrl: (url: string, downloadLocation?: string | null) => void;
  onRemoveCover: () => void;
  onUploadClick: () => void;
}) {
  const dialogTitleId = useId();
  const [photos, setPhotos] = useState<UnsplashPhotoPayload[]>([]);
  const [photosLoading, setPhotosLoading] = useState(false);
  const [photosErr, setPhotosErr] = useState<string | null>(null);
  const [source, setSource] = useState<'unsplash' | 'picsum' | null>(null);
  const [mode, setMode] = useState<BackdropMode>('image');
  const [shuffleKey, setShuffleKey] = useState(0);

  const loadPhotos = useCallback(async () => {
    setPhotosLoading(true);
    setPhotosErr(null);
    try {
      const res = await fetch(`/api/unsplash/photos?k=${shuffleKey}`, {
        credentials: 'include',
        cache: 'no-store',
      });
      const data = (await res.json()) as {
        ok?: boolean;
        photos?: UnsplashPhotoPayload[];
        source?: string;
        error?: string;
      };
      if (!res.ok || !data.photos?.length) {
        setPhotosErr(data.error ?? 'Could not load images.');
        setPhotos([]);
        return;
      }
      setPhotos(data.photos);
      setSource(data.source === 'unsplash' ? 'unsplash' : 'picsum');
    } catch {
      setPhotosErr('Network error.');
      setPhotos([]);
    } finally {
      setPhotosLoading(false);
    }
  }, [shuffleKey]);

  useEffect(() => {
    if (!open) return;
    setPhotos([]);
    void loadPhotos();
  }, [open, loadPhotos]);

  useEffect(() => {
    if (coverImageUrl) setMode('image');
    else setMode('none');
  }, [coverImageUrl]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/20 p-4 sm:p-6"
      role="presentation"
      onClick={() => onOpenChange(false)}
    >
      <div
        className="flex max-h-[min(90vh,640px)] w-full max-w-[400px] flex-col overflow-hidden rounded-[20px] border border-[#e8e8e8] bg-white shadow-[0_24px_80px_rgba(0,0,0,0.18)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby={dialogTitleId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 pb-2 pt-4">
          <h2 id={dialogTitleId} className="text-[17px] font-semibold tracking-tight text-[#121212]">
            Backdrop
          </h2>
          <button
            type="button"
            className="flex h-9 w-9 items-center justify-center rounded-full text-[#6b6b6b] transition hover:bg-[#f0f0ef] hover:text-[#121212]"
            aria-label="Close"
            onClick={() => onOpenChange(false)}
          >
            <span className="text-lg leading-none" aria-hidden>
              ×
            </span>
          </button>
        </div>

        <div className="px-4 pb-3">
          <div className="flex gap-1 rounded-2xl bg-[#ecebe8] p-1">
            <SegmentBtn
              label="No backdrop"
              active={mode === 'none'}
              disabled={!canSetCover || coverBusy}
              onClick={() => {
                setMode('none');
                if (coverImageUrl) onRemoveCover();
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                <circle cx="12" cy="12" r="9" />
                <path d="m5 5 14 14" />
              </svg>
            </SegmentBtn>
            <SegmentBtn label="Solid colour (soon)" disabled>
              <span className="h-4 w-4 rounded border-2 border-current opacity-40" />
            </SegmentBtn>
            <SegmentBtn label="Gradient (soon)" disabled>
              <span className="h-4 w-4 rounded border-2 border-dashed border-current opacity-40" />
            </SegmentBtn>
            <SegmentBtn
              label="Image backdrop"
              active={mode === 'image'}
              disabled={!canSetCover}
              onClick={() => setMode('image')}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75">
                <rect x="3" y="5" width="18" height="14" rx="2" />
                <circle cx="8.5" cy="10" r="1.5" fill="currentColor" stroke="none" />
                <path d="m21 15-5-5-4 4-2-2-5 5" />
              </svg>
            </SegmentBtn>
          </div>
        </div>

        {mode === 'image' ? (
          <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
            {photosLoading ? (
              <p className="py-8 text-center text-sm text-[#6b6b6b]">Loading images...</p>
            ) : photosErr ? (
              <p className="py-4 text-center text-sm text-red-800" role="alert">
                {photosErr}
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-2" role="list" aria-label="Backdrop image choices">
                {photos.map((p) => {
                  const selected = coverImageUrl === p.urls.regular;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      disabled={!canSetCover || coverBusy}
                      onClick={() => onApplyImageUrl(p.urls.regular, p.downloadLocation)}
                      aria-label={`Use backdrop image by ${p.user?.name ?? 'Unsplash contributor'}`}
                      aria-pressed={selected}
                      className={[
                        'aspect-[4/3] overflow-hidden rounded-xl bg-[#ecebe8] ring-2 ring-offset-2 ring-offset-white transition',
                        selected ? 'ring-[#121212]' : 'ring-transparent hover:ring-[#d0d0d0]',
                        !canSetCover || coverBusy ? 'opacity-50' : '',
                      ].join(' ')}
                    >
                      <img src={p.urls.small} alt={p.alt ?? 'Backdrop preview'} className="h-full w-full object-cover" />
                    </button>
                  );
                })}
              </div>
            )}

            <div className="mt-4 grid grid-cols-3 gap-2">
              <button
                type="button"
                disabled={!canSetCover || coverBusy || photosLoading}
                onClick={() => setShuffleKey((k) => k + 1)}
                className="flex flex-col items-center gap-1 rounded-xl border border-[#e4e4e4] bg-[#fafaf9] py-3 text-[11px] font-medium text-[#121212] transition hover:bg-[#f0f0ef] disabled:opacity-50"
              >
                <span className="text-base" aria-hidden>
                  ↻
                </span>
                Shuffle
              </button>
              <a
                href="https://unsplash.com"
                target="_blank"
                rel="noreferrer"
                className="flex flex-col items-center gap-1 rounded-xl border border-[#e4e4e4] bg-[#fafaf9] py-3 text-[11px] font-medium text-[#121212] transition hover:bg-[#f0f0ef]"
              >
                <span className="text-[13px] font-bold tracking-tight" aria-hidden>
                  U
                </span>
                Unsplash
              </a>
              <button
                type="button"
                disabled={!canSetCover || coverBusy}
                onClick={() => {
                  onUploadClick();
                  onOpenChange(false);
                }}
                className="flex flex-col items-center gap-1 rounded-xl border border-[#e4e4e4] bg-[#fafaf9] py-3 text-[11px] font-medium text-[#121212] transition hover:bg-[#f0f0ef] disabled:opacity-50"
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  className="text-[#121212]"
                  aria-hidden
                >
                  <rect x="3" y="5" width="18" height="14" rx="2" />
                  <path d="M9 11h6M12 8v6" strokeLinecap="round" />
                </svg>
                Insert image
              </button>
            </div>

            {source === 'unsplash' && photos.length > 0 ? (
              <p className="mt-3 text-center text-[10px] leading-relaxed text-[#9b9b9b]">
                Photos from{' '}
                <a href="https://unsplash.com" target="_blank" rel="noreferrer" className="underline underline-offset-2">
                  Unsplash
                </a>
              </p>
            ) : null}

            <div className="mt-4 flex items-center justify-between rounded-xl border border-[#e8e8e8] bg-[#fafaf9] px-3 py-2.5">
              <span className="text-[13px] font-medium text-[#121212]">Blur image</span>
              <button
                type="button"
                role="switch"
                aria-checked={backdropBlur}
                disabled={!coverImageUrl}
                onClick={() => onBackdropBlurChange(!backdropBlur)}
                className={[
                  'relative h-[26px] w-[44px] shrink-0 rounded-full border-0 transition-colors',
                  backdropBlur ? 'bg-[#121212]' : 'bg-[#d8d8d8]',
                  !coverImageUrl ? 'cursor-not-allowed opacity-40' : '',
                ].join(' ')}
              >
                <span
                  className={[
                    'absolute top-[3px] block h-5 w-5 rounded-full bg-white shadow transition-transform',
                    backdropBlur ? 'translate-x-[22px]' : 'translate-x-[3px]',
                  ].join(' ')}
                />
              </button>
            </div>
          </div>
        ) : (
          <div className="px-4 pb-6 pt-2 text-center text-sm text-[#6b6b6b]">No backdrop is shown behind the card.</div>
        )}
      </div>
    </div>
  );
}
