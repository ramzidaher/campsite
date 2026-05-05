import type { CalendarificHolidaysResponse, CalendarificHoliday } from '@/lib/calendarific/types';

const CALENDARIFIC_BASE = 'https://calendarific.com/api/v2/holidays';

export type FetchCalendarificResult =
  | { ok: true; holidays: CalendarificHoliday[] }
  | { ok: false; status: number; message: string };

export async function fetchCalendarificHolidaysForYear(
  apiKey: string,
  country: string,
  year: number,
  signal?: AbortSignal
): Promise<FetchCalendarificResult> {
  const url = new URL(CALENDARIFIC_BASE);
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('country', country.trim().toUpperCase());
  url.searchParams.set('year', String(year));

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal,
      cache: 'no-store',
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Network error';
    return { ok: false, status: 0, message: msg };
  }

  const text = await res.text();
  let json: CalendarificHolidaysResponse | null = null;
  try {
    json = JSON.parse(text) as CalendarificHolidaysResponse;
  } catch {
    return { ok: false, status: res.status, message: 'Invalid JSON from Calendarific' };
  }

  if (!res.ok) {
    const metaCode = json?.meta?.code;
    return {
      ok: false,
      status: res.status,
      message: `Calendarific HTTP ${res.status}${metaCode != null ? ` (meta ${metaCode})` : ''}`,
    };
  }

  const list = json?.response?.holidays;
  if (!Array.isArray(list)) {
    return { ok: false, status: res.status, message: 'Calendarific response missing holidays array' };
  }

  return { ok: true, holidays: list };
}
