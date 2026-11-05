import { describe, expect, it } from 'vitest';
import {
  CIVITAI_VIDEO_DOWNLOAD_MARGIN_MS,
  CIVITAI_VIDEO_POLL_BUDGET_MS,
  CIVITAI_VIDEO_SCHEMA_TIMEOUT_MS,
  CIVITAI_VIDEO_SOCKET_TIMEOUT_MS,
  CIVITAI_VIDEO_SUBMIT_WAIT_SECONDS,
  civitaiVideoPollDelayMs,
  civitaiVideoPollPlan,
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

  it('keeps polling after the old 60 second window and stops at the 10 minute budget', () => {
    const plan = civitaiVideoPollPlan(CIVITAI_VIDEO_POLL_BUDGET_MS);
    const total = plan.reduce((sum, step) => sum + step.delayMs, 0);
    expect(total).toBeGreaterThan(60_000);
    expect(total).toBeLessThanOrEqual(CIVITAI_VIDEO_POLL_BUDGET_MS);
    expect(plan.length).toBeGreaterThan(20);
  });

  it('keeps the socket open past the submit wait, the poll budget, the schema fetch and the download', () => {
    const floor =
      CIVITAI_VIDEO_POLL_BUDGET_MS +
      CIVITAI_VIDEO_SUBMIT_WAIT_SECONDS * 1000 +
      CIVITAI_VIDEO_SCHEMA_TIMEOUT_MS +
      CIVITAI_VIDEO_DOWNLOAD_MARGIN_MS;
    expect(CIVITAI_VIDEO_SOCKET_TIMEOUT_MS).toBeGreaterThan(floor);
    expect(CIVITAI_VIDEO_SOCKET_TIMEOUT_MS).not.toBe(120_000);
  });
});
