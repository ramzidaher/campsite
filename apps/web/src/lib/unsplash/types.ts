export type UnsplashPhotoPayload = {
  id: string;
  urls: { small: string; regular: string; full: string };
  alt?: string | null;
  user: { name: string; htmlProfile: string };
  downloadLocation: string | null;
};
