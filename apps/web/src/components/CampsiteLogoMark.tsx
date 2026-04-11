/** Product mark: `apps/web/public/Campsite Logo.svg` (URL-encoded path). */
export const CAMPSITE_LOGO_SRC = '/Campsite%20Logo.svg';

type CampsiteLogoMarkProps = {
  /** Classes for the outer box (size, rounded corners, background). */
  className: string;
};

export function CampsiteLogoMark({ className }: CampsiteLogoMarkProps) {
  return (
    <span className={className}>
      <img
        src={CAMPSITE_LOGO_SRC}
        alt=""
        className="h-full w-full object-contain p-[3px]"
        width={1024}
        height={1024}
        draggable={false}
      />
    </span>
  );
}
