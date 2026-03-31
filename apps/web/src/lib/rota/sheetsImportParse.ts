import * as chrono from 'chrono-node';
import { format } from 'date-fns';
import { fromZonedTime } from 'date-fns-tz';

/** Extract spreadsheet id from a Google Sheets URL. */
export function extractSpreadsheetId(url: string): string | null {
  const m = url.trim().match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return m?.[1] ?? null;
}

/** A -> 0, B -> 1, ..., Z -> 25, AA -> 26. */
export function columnLettersToIndex(letters: string): number {
  const s = letters.trim().toUpperCase().replace(/[^A-Z]/g, '');
  if (!s.length) return 0;
  let n = 0;
  for (const c of s) {
    n = n * 26 + (c.charCodeAt(0) - 64);
  }
  return n - 1;
}

export function quoteSheetNameForRange(name: string): string {
  const escaped = name.replace(/'/g, "''");
  return `'${escaped}'`;
}

/** Parse sheet date cell to `yyyy-MM-dd` or null. */
export function parseDateCellToYmd(cell: string): string | null {
  const t = cell.trim();
  if (!t) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m) {
    const day = String(Number(m[1])).padStart(2, '0');
    const month = String(Number(m[2])).padStart(2, '0');
    const y = m[3]!;
    return `${y}-${month}-${day}`;
  }
  const d = chrono.parseDate(t);
  if (!d || Number.isNaN(d.getTime())) return null;
  return format(d, 'yyyy-MM-dd');
}

/** Normalize "9:30" or "09:30" to "09:30:00". */
export function normalizeTimeToHms(cell: string): string | null {
  const t = cell.trim();
  if (!t) return null;
  const isoLike = t.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (isoLike) {
    const h = isoLike[1]!.padStart(2, '0');
    const mi = isoLike[2]!;
    const s = (isoLike[3] ?? '00').padStart(2, '0');
    return `${h}:${mi}:${s}`;
  }
  return null;
}

/** Wall clock in org IANA zone (or UTC) to UTC `Date`. */
export function zonedWallToUtc(ymd: string, hms: string, ianaTz: string | null): Date {
  const tz = ianaTz?.trim() ? ianaTz.trim() : 'UTC';
  try {
    return fromZonedTime(`${ymd} ${hms}`, tz);
  } catch {
    return fromZonedTime(`${ymd} ${hms}`, 'UTC');
  }
}

export function cellAt(row: string[] | undefined, colIndex: number): string {
  if (!row || colIndex < 0) return '';
  return String(row[colIndex] ?? '').trim();
}
