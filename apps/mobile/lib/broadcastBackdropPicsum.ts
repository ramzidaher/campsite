/**
 * Client-side backdrop grid when the web app URL is unset or `/api/unsplash/photos` fails.
 * Seeds and dimensions match web `picsumFallback` in `apps/web/src/app/api/unsplash/photos/route.ts`.
 */
export type BackdropPhotoPayload = {
  id: string;
  urls: { small: string; regular: string; full: string };
  user: { name: string; htmlProfile: string };
  downloadLocation: string | null;
};

export function buildPicsumBackdropPhotos(shuffleKey: number): BackdropPhotoPayload[] {
  const bucket = Math.abs(shuffleKey) % 10000;
  return Array.from({ length: 12 }, (_, i) => {
    const seed = `campsite-bc-${bucket}-${i}`;
    return {
      id: `picsum-${bucket}-${i}`,
      urls: {
        small: `https://picsum.photos/seed/${seed}/400/240`,
        regular: `https://picsum.photos/seed/${seed}/1920/1080`,
        full: `https://picsum.photos/seed/${seed}/2400/1600`,
      },
      user: { name: 'Lorem Picsum', htmlProfile: 'https://picsum.photos' },
      downloadLocation: null,
    };
  });
}
