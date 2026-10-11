import { describe, expect, it } from 'vitest';
import { agnesVideoSize } from './agnesVideoContract';

describe('Agnes Video 2.5 size contract', () => {
  it('accepts only the official resolution tiers for general Agnes video', () => {
    for (const tier of ['720P', '1080P', '1K', '2K']) expect(agnesVideoSize(tier, 'agnes-video-2.5')).toBe(tier);
  });

  it('strictly enforces 720P for agnes-video-2.5-flash per official documentation', () => {
    expect(agnesVideoSize('720P', 'agnes-video-2.5-flash')).toBe('720P');
    expect(() => agnesVideoSize('1080P', 'agnes-video-2.5-flash')).toThrow(/size must be 720P/);
    expect(() => agnesVideoSize('2K', 'agnes-video-2.5-flash')).toThrow(/size must be 720P/);
  });

  it('rejects pixel dimensions and unknown tiers with the official list', () => {
    expect(() => agnesVideoSize('1024x1024')).toThrow(/720P.*1080P.*1K.*2K/);
    expect(() => agnesVideoSize('4K')).toThrow(/720P/);
    expect(() => agnesVideoSize('720p')).toThrow(/720P/);
  });
});
