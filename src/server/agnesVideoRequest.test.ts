import { describe, expect, it } from 'vitest';
import { buildAgnesVideoRequest, agnesVideoId } from './agnesVideoRequest';

const model = 'agnes-video-2.5';
describe('Agnes video advanced request contract', () => {
  it('preserves literal URL-like prompt provenance', () => {
    for (const prompt of ['https:// is the literal caption on a sign', 'https://EXAMPLE.com/caption']) {
      const built = buildAgnesVideoRequest(model, {prompt});
      expect(built.payload.prompt).toBe(prompt);
      expect(built.requestedParameters.prompt).toBe(prompt);
    }
  });
  it('rejects JSON type coercion for known fields in both top-level and advanced inputs', () => {
    for (const field of ['seed', 'seconds', 'duration', 'size', 'n', 'mode', 'aspect_ratio']) {
      for (const value of [false, true, [], [field === 'size' ? '720P' : field === 'mode' ? 'text' : field === 'aspect_ratio' ? '16:9' : 8], {}]) {
        expect(() => buildAgnesVideoRequest(model, {[field]: value})).toThrow();
        expect(() => buildAgnesVideoRequest(model, {custom_parameters: {[field]: value}})).toThrow();
      }
    }
    expect(() => buildAgnesVideoRequest(model, {seed: '0'})).toThrow(/seed/);
    expect(() => buildAgnesVideoRequest(model, {n: '1'})).toThrow(/n/);
    expect(buildAgnesVideoRequest(model, {duration: 8, seed: 0, n: 1}).payload).toMatchObject({seconds: '8', seed: 0, n: 1});
    expect(buildAgnesVideoRequest(model, {duration: '8'}).payload.seconds).toBe('8');
    const built = buildAgnesVideoRequest(model, {duration: 5, custom_parameters: {duration: 8}});
    expect(built.customParameters.duration).toBe(8);
    expect(built.overrides.seconds).toEqual({before: 5, after: 8});
    expect(built.payload.seconds).toBe('8');
  });
  it('maps site aliases, preserves custom false/zero/unknown and records overrides', () => {
    const body = { model, prompt: 'original', duration: 5, size: '720P', resolution: 'experimental', seed: 42, custom_parameters: { prompt: 'advanced', seconds: '12', size: '2K', seed: 0, future_flag: false } };
    const built = buildAgnesVideoRequest(model, body);
    expect(built.payload).toMatchObject({ model, prompt: 'advanced', seconds: '12', size: '2K', resolution: 'experimental', seed: 0, future_flag: false, mode: 'text' });
    expect(built.payload).not.toHaveProperty('custom_parameters');
    expect(built.overrides.seed).toEqual({ before: 42, after: 0 });
    expect(built.requestedParameters).toEqual(body);
    expect(built.fieldStatus.resolution).toBe('unverified');
  });
  it('uses only explicit media intent and accepts official modes', () => {
    expect(buildAgnesVideoRequest(model, { image_url: 'https://example.com/first.png' }).payload).toMatchObject({ mode: 'keyframe', first_frame: 'https://example.com/first.png' });
    expect(buildAgnesVideoRequest(model, { custom_parameters: { mode: 'reference', images: ['https://example.com/ref.png'], videos: [{ url: 'https://example.com/ref.mp4', start_seconds: 0, require_audio: false }] } }).payload).toMatchObject({ mode: 'reference', videos: [{ start_seconds: 0, require_audio: false }] });
    expect(buildAgnesVideoRequest(model, { last_frame: 'https://example.com/last.png' }).payload.mode).toBe('keyframe');
    expect(() => buildAgnesVideoRequest(model, { image_url: 'a', custom_parameters: { mode: 'reference', images: ['b'] } })).toThrow(/mode|媒体/);
  });
  it('rejects verified invalid final fields locally and never invents unknown model schema', () => {
    for (const custom_parameters of [{ seconds: '3' }, { n: 2 }, { mode: 'reference' }, { mode: 'text', first_frame: 'a' }, { mode: 'keyframe', images: ['a'] }, { size: '1280x720' }]) expect(() => buildAgnesVideoRequest(model, { custom_parameters })).toThrow();
    expect(() => buildAgnesVideoRequest('agnes-video-2.5-flash', { custom_parameters: { size: '2K' } })).toThrow(/720P/);
    expect(() => buildAgnesVideoRequest('agnes-video-2.5-flash', { mode: 'reference', videos: [{ url: 'a' }] })).toThrow(/videos/);
    expect(buildAgnesVideoRequest('custom-video', { size: '8K', custom_parameters: { seconds: 0, future: false } }).payload).toMatchObject({ size: '8K', seconds: 0, future: false });
  });
  it('requires object JSON and protects model/provider/endpoint/credentials and prototype boundaries', () => {
    for (const custom_parameters of [null, [], 'bad', { model: 'other' }, { provider: 'fal' }, { baseUrl: 'https://example.com' }, { apiKey: 'fixture' }, { headers: {} }, JSON.parse('{"__proto__":{"polluted":true}}')]) expect(() => buildAgnesVideoRequest(model, { custom_parameters })).toThrow(/对象|边界/);
  });
  it('requires video_id rather than silently using task id', () => {
    expect(agnesVideoId({ video_id: 'video_fixture', id: 'task_fixture' })).toBe('video_fixture');
    expect(() => agnesVideoId({ id: 'task_fixture' })).toThrow(/video_id/);
  });
});
