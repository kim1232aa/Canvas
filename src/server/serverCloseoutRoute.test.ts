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

  it('OpenAI and Grok image routes retain every returned image and merge custom JSON', () => {
    for (const marker of ['app.post([\'/api/engine/openai_compat/generate\'', 'app.post([\'/api/engine/grok_compat/generate\'']) {
      const start = serverSource.indexOf(marker);
      const route = serverSource.slice(start, serverSource.indexOf('app.post', start + marker.length));
      expect(route).toContain('recordAdditionalImages(data.data');
      expect(route).toContain('custom_parameters');
    }
  });

  it('Gemini route records omissions without putting them in the SDK request', () => {
    expect(serverSource).toContain('const parameterOmissions = sanitizeGenerationMetadata(req.body.parameterOmissions || []);');
    expect(serverSource).toContain('stage: \'parameter-omissions\'');
    expect(serverSource).toContain('parameterOmissions,');
    expect(serverSource).toContain('actualRequest: { model, contents: { parts }, config }');
  });
});
