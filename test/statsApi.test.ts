import { describe, expect, it } from 'vitest';
import { startOfMonth } from '../src/worker/statsApi';

describe('startOfMonth', () => {
  it('uses the site timezone', () => {
    // 01:30 on 1 Nov in India is still 31 Oct in UTC.
    expect(new Date(startOfMonth(Date.parse('2026-10-31T20:00:00Z'), 'Asia/Kolkata')).toISOString()).toBe('2026-10-31T18:30:00.000Z');
    expect(new Date(startOfMonth(Date.parse('2026-10-31T20:00:00Z'), 'UTC')).toISOString()).toBe('2026-10-01T00:00:00.000Z');
    expect(new Date(startOfMonth(Date.parse('2026-03-15T12:00:00Z'), 'America/New_York')).toISOString()).toBe('2026-03-01T05:00:00.000Z');
  });
});
