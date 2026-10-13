import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildAgnesVideoRequest, agnesVideoId } from './agnesVideoRequest';

const serverSource = readFileSync(new URL('../../server.ts', import.meta.url), 'utf8');

describe('server closeout wiring contracts', () => {
  it('production Agnes route uses the builder, actual request metadata, and strict video_id polling contract', () => {
    expect(serverSource).toContain("import {buildAgnesVideoRequest, agnesVideoId} from './src/server/agnesVideoRequest.ts';");
    expect(serverSource).toContain('builtAgnes = buildAgnesVideoRequest(model, req.body)');
    expect(serverSource).toContain('videoId = agnesVideoId(submitData)');
    expect(serverSource).toContain('actualRequest: agnesPayload');
    expect(serverSource).toContain('requestMetadata');
    expect(() => agnesVideoId({ id: 'task_fixture' })).toThrow(/video_id/);
    expect(buildAgnesVideoRequest('agnes-video-2.5', { custom_parameters: { mode: 'reference', images: ['https://example.com/ref.png'], resolution: 'unknown-explicit' } }).payload).toMatchObject({ mode: 'reference', resolution: 'unknown-explicit' });
  });

  it('Gemini route records omissions without putting them in the SDK request', () => {
    expect(serverSource).toContain('const parameterOmissions = sanitizeGenerationMetadata(req.body.parameterOmissions || []);');
    expect(serverSource).toContain('stage: \'parameter-omissions\'');
    expect(serverSource).toContain('parameterOmissions,');
    expect(serverSource).toContain('const actualRequest = { model: actualModel, contents: { parts }, config: sentConfig };');
  });

  it('Replicate model-schema route queries official Replicate model endpoint and extracts openapi inputSchema', () => {
    expect(serverSource).toContain("if (provider === 'replicate') {");
    expect(serverSource).toContain('https://api.replicate.com/v1/models/${encodeURIComponent(owner)}/${encodeURIComponent(name)}');
    expect(serverSource).toContain('const inputSchema = openapi?.components?.schemas?.Input || null;');
  });
});
