import { describe, expect, it } from 'vitest';
import { withGeminiImageResponseModality } from './geminiImageConfig';

describe('withGeminiImageResponseModality', () => {
  it('requests image output when no response modalities were supplied', () => {
    expect(withGeminiImageResponseModality({ imageConfig: { aspectRatio: '16:9' } })).toEqual({
      imageConfig: { aspectRatio: '16:9' },
      responseModalities: ['IMAGE'],
    });
  });

  it('preserves caller supplied modalities, including text only', () => {
    expect(withGeminiImageResponseModality({ responseModalities: ['TEXT'] })).toEqual({ responseModalities: ['TEXT'] });
    expect(withGeminiImageResponseModality({ responseModalities: [] })).toEqual({ responseModalities: [] });
  });
});
