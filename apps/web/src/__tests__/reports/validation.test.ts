import { parseReportDomains, parseVisibility, sanitizeReportConfig } from '@/lib/reports/validation';

describe('reports validation', () => {
  it('sanitizes config fields against selected domains', () => {
    const config = sanitizeReportConfig(
      {
        fields: ['employee_name', 'timesheet_status', 'unknown_field'],
        filters: [
          { field: 'employee_status', op: 'equals', value: 'active' },
          { field: 'timesheet_status', op: 'contains', value: 'pending' },
        ],
        sort: [{ field: 'timesheet_status', direction: 'desc' }],
      },
      ['hr']
    );

    expect(config.fields).toEqual(['employee_name']);
    expect(config.filters).toEqual([{ field: 'employee_status', op: 'equals', value: 'active', valueTo: null }]);
    expect(config.sort).toEqual([]);
  });

  it('parses domains and visibility with safe defaults', () => {
    expect(parseReportDomains(['finance', 'invalid'])).toEqual(['finance']);
    expect(parseReportDomains('bad')).toEqual(['hr']);
    expect(parseVisibility('org')).toBe('org');
    expect(parseVisibility('anything')).toBe('private');
  });
});

