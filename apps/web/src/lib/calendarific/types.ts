/** Subset of Calendarific v2 holiday objects we persist and map. */
export type CalendarificHoliday = {
  name: string;
  description?: string;
  date?: { iso?: string; datetime?: { year: number; month: number; day: number } };
  type?: string[];
};

export type CalendarificHolidaysResponse = {
  meta?: { code?: number };
  response?: { holidays?: CalendarificHoliday[] };
};
