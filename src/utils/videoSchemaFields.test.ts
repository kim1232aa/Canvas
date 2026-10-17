/** videoschema-2026-10-17: duration / aspect_ratio from the selected endpoint's official fal OpenAPI (enums copied from fal.ai/api/openapi/queue/openapi.json). */
import { describe, expect, it, vi } from 'vitest';
vi.mock('../services/api', () => ({ getStoredApiKeys: () => ({}) }));
import { ensureModelSchema } from '../services/modelSchemaCache';
import { videoDurationBounds, videoSchemaField, videoSchemaValueIssue, videoSchemaIssues } from './frontendParameters';
const flush = () => new Promise((r) => setTimeout(r, 0));
const load = async (model: string, properties: any) => { ensureModelSchema('fal', model, (async () => new Response(JSON.stringify({ inputSchema: { properties } }), { status: 200 })) as any); await flush(); await flush(); };
const K26 = 'fal-ai/kling-video/v2.6/pro/text-to-video', K3I = 'fal-ai/kling-video/v3/standard/image-to-video', K3T = 'fal-ai/kling-video/v3/standard/text-to-video';
const k3 = ['3','4','5','6','7','8','9','10','11','12','13','14','15'];

describe('video Schema fields', () => {
  it('Kling 2.6 Pro duration 5/10, aspect 16:9/9:16/1:1', async () => {
    await load(K26, { prompt: {}, duration: { enum: ['5', '10'], type: 'string' }, aspect_ratio: { enum: ['16:9', '9:16', '1:1'] } });
    expect(videoDurationBounds('fal', K26).options).toEqual(['5', '10']);
    expect(videoSchemaField('fal', K26, 'aspect_ratio')).toEqual({ state: 'declared', options: ['16:9', '9:16', '1:1'] });
  });
  it('Kling 3.0 duration 3–15; I2V has no aspect_ratio → absent (control hidden)', async () => {
    await load(K3I, { prompt: {}, start_image_url: {}, duration: { enum: k3 } });
    await load(K3T, { prompt: {}, duration: { enum: k3 }, aspect_ratio: { enum: ['16:9', '9:16', '1:1'] } });
    expect(videoDurationBounds('fal', K3I).options).toEqual(k3);
    expect(videoSchemaField('fal', K3I, 'aspect_ratio').state).toBe('absent');
    expect(videoSchemaField('fal', K3T, 'aspect_ratio').state).toBe('declared');
  });
  it('never clamps: out-of-enum stored value is invalid and blocks run', async () => {
    await load(K26, { duration: { enum: ['5', '10'] } });
    expect(videoSchemaValueIssue('fal', K26, 'duration', 15)).toContain('不在这个模型的可选值里');
    expect(videoSchemaValueIssue('fal', K26, 'duration', '10')).toBeNull();
    expect(videoSchemaValueIssue('fal', K3I, 'aspect_ratio', '16:9')).toContain('不接收');
    expect(videoSchemaIssues([{ type: 'AIVideoNode', values: { targetProvider: 'fal', model: K3I, duration: '12', aspect_ratio: '' } }])).toBeNull();
    expect(videoSchemaIssues([{ type: 'AIVideoNode', values: { targetProvider: 'fal', model: K26, duration: 15 } }])).toMatch(/视频时长（秒）/);
  });
  it('Schema not loaded → unknown, no invented limits', () => {
    expect(videoSchemaField('fal', 'fal-ai/never-loaded', 'duration').state).toBe('unknown');
    expect(videoSchemaValueIssue('fal', 'fal-ai/never-loaded', 'duration', 99)).toBeNull();
  });
});
