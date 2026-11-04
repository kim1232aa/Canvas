import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { sentHistoryNumbers } from './historySent';

describe('history records what was actually sent', () => {
  it('ModelScope size string "832x1216" → width/height (hist_1793769370924_ysr4f case)', () => {
    expect(sentHistoryNumbers({ actualParameters: { model: 'Tongyi-MAI/Z-Image-Turbo', size: '832x1216', seed: 42, steps: 8, guidance: 1 } }))
      .toEqual({ width: 832, height: 1216, seed: 42, steps: 8, cfg: 1 });
  });
  it('last submission parameters (Together case) and image_size object', () => {
    expect(sentHistoryNumbers({ submissions: [{ parameters: { width: 1024, height: 1024, steps: 20, cfg: 1, seed: 42 } }] }))
      .toEqual({ width: 1024, height: 1024, seed: 42, steps: 20, cfg: 1 });
    expect(sentHistoryNumbers({ actualRequest: { parameters: { image_size: { width: 640, height: 960 } } } })).toMatchObject({ width: 640, height: 960 });
  });
  it('nothing sent → nothing filled (no defaults)', () => {
    expect(sentHistoryNumbers({})).toEqual({});
    expect(sentHistoryNumbers({ actualParameters: { size: '1:1' } })).toEqual({ width: undefined, height: undefined, seed: undefined, steps: undefined, cfg: undefined });
  });
  it('recordHistoryItem uses it', () => {
    expect(readFileSync('server.ts', 'utf8')).toMatch(/sentHistoryNumbers\(/);
  });
});

describe('request log covers every upstream call', () => {
  const src = readFileSync('server.ts', 'utf8');
  it('logs on res.json and on close (routes that end without JSON)', () => {
    expect(src).toMatch(/res\.on\('close', \(\) => logOnce\(/);
    expect(src).toMatch(/logOnce\(body\)/);
    expect(src).not.toMatch(/log write is best-effort/);
  });
});
