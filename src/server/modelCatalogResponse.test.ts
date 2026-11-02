import { describe, expect, it } from 'vitest';
import { parseModelsLabCatalogResponse, parseRunwareCatalogResponse } from './modelCatalogResponse';

describe('Runware and ModelsLab catalog response parsing', () => {
  it('preserves the complete non-2xx response and actual upstream status', () => {
    const body = `upstream failure ${'x'.repeat(500)}`;
    const runware = parseRunwareCatalogResponse(429, body);
    const modelslab = parseModelsLabCatalogResponse(402, body);

    expect(runware).toMatchObject({ ok: false, status: 429, upstreamStatus: 429, errorSource: 'upstream', details: body, rawResponse: body });
    expect(modelslab).toMatchObject({ ok: false, status: 402, upstreamStatus: 402, errorSource: 'upstream', details: body, rawResponse: body });
  });

  it('surfaces successful HTTP responses with invalid JSON instead of converting them to empty catalogs', () => {
    for (const parse of [parseRunwareCatalogResponse, parseModelsLabCatalogResponse]) {
      const result = parse(200, '<html>proxy challenge</html>');
      expect(result).toMatchObject({ ok: false, status: 200, upstreamStatus: 200, errorSource: 'upstream', details: '<html>proxy challenge</html>', rawResponse: '<html>proxy challenge</html>' });
      if (!result.ok) expect(result.error).toContain('无效 JSON');
    }
  });

  it('rejects unexpected 2xx response shapes while retaining the raw body', () => {
    const runwareBody = JSON.stringify({ data: [{ taskType: 'modelSearch', results: 'not-an-array' }] });
    const modelslabBody = JSON.stringify({ status: 'error', message: 'catalog unavailable' });
    const malformedRows = JSON.stringify({ data: [{ results: [null] }] });
    expect(parseRunwareCatalogResponse(200, runwareBody)).toMatchObject({ ok: false, upstreamStatus: 200, rawResponse: runwareBody, details: runwareBody });
    expect(parseModelsLabCatalogResponse(200, modelslabBody)).toMatchObject({ ok: false, upstreamStatus: 200, rawResponse: modelslabBody, details: modelslabBody });
    expect(parseRunwareCatalogResponse(200, malformedRows)).toMatchObject({ ok: false, rawResponse: malformedRows });
  });

  it('accepts only provider-shaped success payloads and redacts echoed credentials in errors', () => {
    expect(parseRunwareCatalogResponse(200, JSON.stringify({ data: [{ results: [], totalResults: 0 }] }))).toMatchObject({ ok: true, data: { results: [], totalResults: 0 } });
    expect(parseModelsLabCatalogResponse(200, '[]')).toMatchObject({ ok: true, data: [] });

    const key = 'models-lab-private-key';
    const body = `{"message":"bad key ${key}"}`;
    const result = parseModelsLabCatalogResponse(401, body, key);
    expect(result).toMatchObject({ ok: false, rawResponse: `{"message":"bad key [credential redacted]"}` });
    expect(JSON.stringify(result)).not.toContain(key);
  });
});
