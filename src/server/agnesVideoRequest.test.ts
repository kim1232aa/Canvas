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
  it('maps site aliases, preserves custom false/zero/unknown and records overrides', () => {
    const body = { model, prompt: 'original', duration: 5, size: '720P', resolution: 'experimental', seed: 42, custom_parameters: { prompt: 'advanced', seconds: '12', size: '2K', seed: 0, future_flag: false } };
    const built = buildAgnesVideoRequest(model, body);
    expect(built.payload).toMatchObject({ model, prompt: 'advanced', seconds: '12', size: '2K', resolution: 'experimental', seed: 0, future_flag: false, mode: 'text' });
    expect(built.payload).not.toHaveProperty('custom_parameters');
    expect(built.overrides.seed).toEqual({ before: 42, after: 0 });
    expect(built.requestedParameters).toEqual(body);
    expect(built.fieldStatus.resolution).toBe('unverified');
  });
  it('never sends root _canvas UI metadata (including nsfwOmitted); user fields stay verbatim', () => {
    const built = buildAgnesVideoRequest(model, { prompt: 'a lighthouse at dusk', custom_parameters: { seed: 3, future_flag: false, _canvas: { scope: { provider: 'agnes', model }, schemaProperties: ['seed'], nsfwOmitted: ['safe_mode'] } } });
    expect(JSON.stringify(built.payload)).not.toMatch(/_canvas|nsfwOmitted/);
    expect(built.payload).toMatchObject({ model, prompt: 'a lighthouse at dusk', seed: 3, future_flag: false, mode: 'text' });
  });
  it('requires object JSON and protects model/provider/endpoint/credentials and prototype boundaries', () => {
    for (const custom_parameters of [null, [], 'bad', { model: 'other' }, { provider: 'fal' }, { baseUrl: 'https://example.com' }, { apiKey: 'fixture' }, { headers: {} }, JSON.parse('{"__proto__":{"polluted":true}}')]) expect(() => buildAgnesVideoRequest(model, { custom_parameters })).toThrow(/对象|边界/);
  });
  it('requires video_id rather than silently using task id', () => {
    expect(agnesVideoId({ video_id: 'video_fixture', id: 'task_fixture' })).toBe('video_fixture');
    expect(() => agnesVideoId({ id: 'task_fixture' })).toThrow(/video_id/);
  });
});
