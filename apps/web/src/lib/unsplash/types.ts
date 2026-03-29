export type UnsplashPhotoPayload = {
  id: string;
  urls: { small: string; regular: string; full: string };
  user: { name: string; htmlProfile: string };
  downloadLocation: string | null;
};
