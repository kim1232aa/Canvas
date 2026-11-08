import { describe, expect, it } from 'vitest';
import { CANVAS_TIME_ZONE, formatBeijingHms } from './dateFormat';

describe('formatBeijingHms', () => {
  it('defaults to Asia/Shanghai HH:MM:SS', () => {
    expect(CANVAS_TIME_ZONE).toBe('Asia/Shanghai');
    expect(formatBeijingHms('2026-10-15T10:22:33.000Z')).toBe('18:22:33');
  });
  it('honours an explicit zone and returns empty string for an invalid date', () => {
    expect(formatBeijingHms('2026-10-15T10:22:33.000Z', 'UTC')).toBe('10:22:33');
    expect(formatBeijingHms('not-a-date')).toBe('');
  });
});
