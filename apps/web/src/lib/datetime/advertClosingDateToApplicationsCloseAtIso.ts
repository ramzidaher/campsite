import { fromZonedTime } from 'date-fns-tz';

/**
 * Recruitment requests store `advert_closing_date` as a calendar date (no time zone).
 * Job listings use `applications_close_at` as timestamptz. End of that calendar day should
 * be interpreted in the organisation's IANA zone so admin UI (datetime-local) and applicants
 * see the same closing *date* as on the request form.
 */
export function advertClosingDateToApplicationsCloseAtIso(
  dateYmd: string | null | undefined,
  orgTimeZone: string | null | undefined
): string | null {
  const trimmed = String(dateYmd ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const tz = String(orgTimeZone ?? '').trim() || 'UTC';
  return fromZonedTime(`${trimmed}T23:59:59.999`, tz).toISOString();
}

/** Default scheduled publish = 09:00 on the advert release calendar date in the org timezone. */
export function advertReleaseDateToScheduledPublishAtIso(
  dateYmd: string | null | undefined,
  orgTimeZone: string | null | undefined
): string | null {
  const trimmed = String(dateYmd ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
  const tz = String(orgTimeZone ?? '').trim() || 'UTC';
  return fromZonedTime(`${trimmed}T09:00:00`, tz).toISOString();
}
