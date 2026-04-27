/** Product mark: `apps/web/public/Campsite Logo.svg` (URL-encoded path). */
export const CAMPSITE_LOGO_SRC = '/Campsite%20Logo.svg';

type CampsiteLogoMarkProps = {
  /** Classes for the outer box (size, rounded corners, background). */
  className: string;
};

export function CampsiteLogoMark({ className }: CampsiteLogoMarkProps) {
  return (
    <span
      className={className}
      aria-hidden="true"
      style={{
        backgroundImage: `url("${CAMPSITE_LOGO_SRC}")`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'center',
        backgroundSize: 'calc(100% - 6px) calc(100% - 6px)',
      }}
    />
  );
}
