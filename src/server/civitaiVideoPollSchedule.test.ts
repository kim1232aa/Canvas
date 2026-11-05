import { describe, expect, it } from 'vitest';
import {
  CIVITAI_VIDEO_POLL_BUDGET_MS,
  CIVITAI_VIDEO_SUBMIT_WAIT_SECONDS,
  civitaiVideoPollDelayMs,
} from './civitaiVideoPollSchedule';

describe('Civitai video poll schedule', () => {
  it('follows the documented cadence 2s, 5s, 10s, 15s, then 30s', () => {
    expect([0, 1, 2, 3, 4, 5, 12].map(civitaiVideoPollDelayMs)).toEqual([
      2000, 5000, 10000, 15000, 30000, 30000, 30000,
    ]);
  });

  it('waits longer than the old 20×3s window and keeps submit wait under 100s', () => {
    expect(CIVITAI_VIDEO_POLL_BUDGET_MS).toBeGreaterThan(20 * 3000);
    expect(CIVITAI_VIDEO_SUBMIT_WAIT_SECONDS).toBeLessThan(100);
    expect(CIVITAI_VIDEO_SUBMIT_WAIT_SECONDS).toBeGreaterThan(0);
  });
});
