import { describe, expect, it } from 'vitest';
import { togetherVideoFrameMedia } from './schemaProviders';

const videoSchema = {
  properties: {
    prompt: { type: 'string' },
    seconds: { type: 'string' },
    ratio: { type: 'string' },
    media: { type: 'object' },
  },
};

describe('Together video start frame', () => {
  it('nests the canvas image under media.frame_images when the schema declares media', () => {
    expect(togetherVideoFrameMedia(videoSchema, 'https://example.test/start.png')).toEqual({
      media: { frame_images: [{ input_image: 'https://example.test/start.png', frame: 0 }] },
    });
  });

  it('does nothing for an image schema, or a video schema that already has image_url', () => {
    expect(togetherVideoFrameMedia({ properties: { prompt: {}, image_url: {} } }, 'https://x/a.png')).toBeUndefined();
    expect(togetherVideoFrameMedia({
      properties: { ...videoSchema.properties, image_url: { type: 'string' } },
    }, 'https://x/a.png')).toBeUndefined();
  });

  it('does nothing when no reference image was given', () => {
    expect(togetherVideoFrameMedia(videoSchema, '')).toBeUndefined();
    expect(togetherVideoFrameMedia(videoSchema, undefined)).toBeUndefined();
  });
});
