export type CalendarSyncEntityType = 'shift' | 'calendar-event' | 'one-on-one' | 'leave';
export type CalendarSyncAction = 'upsert' | 'delete';

type CalendarSyncBody = {
  type: CalendarSyncEntityType;
  id: string;
  action: CalendarSyncAction;
};

const CALENDAR_SYNC_ENDPOINTS = ['/api/google/sync', '/api/microsoft/sync'] as const;

export function queueEntityCalendarSync(body: CalendarSyncBody): void {
  for (const endpoint of CALENDAR_SYNC_ENDPOINTS) {
    void fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => {});
  }
}
