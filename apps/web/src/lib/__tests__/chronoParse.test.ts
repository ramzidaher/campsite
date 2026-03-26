import * as chrono from 'chrono-node';

describe('chrono-node (broadcast body dates)', () => {
  it('parses a forward meeting phrase', () => {
    const ref = new Date('2025-06-01T12:00:00.000Z');
    const results = chrono.parse('Meeting next Monday at 3pm', ref, { forwardDate: true });
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].start).toBeDefined();
  });
});
