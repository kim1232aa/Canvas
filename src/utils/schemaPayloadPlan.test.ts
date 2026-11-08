import { describe, expect, it } from 'vitest';
import { planCanvasField } from './schemaPayloadPlan';

const ctx = (declared: string[]) => ({
  declared: new Set(declared),
  hasReferenceImage: true,
  schemaFieldsOnly: true,
});

describe('video field aliases stay schema-driven', () => {
  it('maps Together video names only when the schema declares them', () => {
    const declared = ['seconds', 'ratio', 'start_image'];
    expect(planCanvasField('duration', ctx(declared))).toEqual({ send: true, target: 'seconds' });
    expect(planCanvasField('aspect_ratio', ctx(declared))).toEqual({ send: true, target: 'ratio' });
    expect(planCanvasField('image_url', ctx(declared))).toEqual({ send: true, target: 'start_image' });
  });

  it('keeps the canvas name when the schema declares neither the name nor an alias', () => {
    const imageSchema = ['prompt', 'width', 'height'];
    expect(planCanvasField('duration', ctx(imageSchema)).target).toBe('duration');
    expect(planCanvasField('aspect_ratio', ctx(imageSchema)).target).toBe('aspect_ratio');
    expect(planCanvasField('image_url', ctx(imageSchema)).target).toBe('image_url');
  });

  it('prefers a declared native name over an alias', () => {
    expect(planCanvasField('duration', ctx(['duration', 'seconds'])).target).toBe('duration');
    expect(planCanvasField('aspect_ratio', ctx(['aspect_ratio', 'ratio'])).target).toBe('aspect_ratio');
  });

  it('maps num_frames to frames_num (Novita img2video) only when the schema declares it', () => {
    expect(planCanvasField('num_frames', ctx(['model_name', 'frames_num', 'frames_per_second']))).toEqual({ send: true, target: 'frames_num' });
    expect(planCanvasField('fps', ctx(['frames_num', 'frames_per_second']))).toEqual({ send: true, target: 'frames_per_second' });
    expect(planCanvasField('num_frames', ctx(['prompt', 'seed'])).target).toBe('num_frames');
  });

  it('keeps num_frames > frames > frames_num priority and a user-declared native name', () => {
    expect(planCanvasField('num_frames', ctx(['num_frames', 'frames_num'])).target).toBe('num_frames');
    expect(planCanvasField('num_frames', ctx(['frames', 'frames_num'])).target).toBe('frames');
    expect(planCanvasField('num_frames', ctx(['frames_num', 'frames'])).target).toBe('frames');
  });
});
