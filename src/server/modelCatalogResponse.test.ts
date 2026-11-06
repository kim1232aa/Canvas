import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  hasNoPublicRemoteCatalog,
  isLookupOnlyCatalog,
  parseModelsLabCatalogResponse,
  parseRunwareCatalogResponse,
} from './modelCatalogResponse';

const serverSource = readFileSync(new URL('../../server.ts', import.meta.url), 'utf8');

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

  it('generically identifies no-public-catalog providers without being fooled by lookup-only prefix on missing-key/query states', () => {
    // Truly no catalog
    expect(hasNoPublicRemoteCatalog({ noPublicRemoteCatalog: true, catalogAvailable: false, sourceUrl: 'https://docs.mage.space/api/models/mango' })).toBe(true);
    expect(hasNoPublicRemoteCatalog({ noPublicRemoteCatalog: true, catalogAvailable: false, sourceUrl: 'https://agnes.ai' })).toBe(true);
    expect(hasNoPublicRemoteCatalog({ catalogAvailable: false })).toBe(true);
    expect(isLookupOnlyCatalog({ noPublicRemoteCatalog: true })).toBe(true);

    // Catalog exists but missing key / missing query / custom endpoint: MUST be false
    expect(hasNoPublicRemoteCatalog({ requiresApiKey: true, catalogAvailable: true, sourceNotice: 'lookup-only (no api key configured)' })).toBe(false);
    expect(hasNoPublicRemoteCatalog({ requiresSearchQuery: true, catalogAvailable: true, sourceNotice: 'lookup-only (search query required for live catalog)' })).toBe(false);
    expect(hasNoPublicRemoteCatalog({ isCustomEndpoint: true, sourceNotice: 'lookup-only (custom endpoint)' })).toBe(false);
    // Specifically lock isCustomEndpoint exclusion against catalogAvailable: false or noPublicRemoteCatalog: true
    expect(hasNoPublicRemoteCatalog({ isCustomEndpoint: true, catalogAvailable: false })).toBe(false);
    expect(hasNoPublicRemoteCatalog({ isCustomEndpoint: true, noPublicRemoteCatalog: true })).toBe(false);
    // Positive control: without isCustomEndpoint, catalogAvailable: false or noPublicRemoteCatalog: true remains true
    expect(hasNoPublicRemoteCatalog({ catalogAvailable: false })).toBe(true);
    expect(hasNoPublicRemoteCatalog({ noPublicRemoteCatalog: true })).toBe(true);

    expect(hasNoPublicRemoteCatalog({ sourceNotice: 'lookup-only (no api key configured)' })).toBe(false);
    expect(hasNoPublicRemoteCatalog({ sourceNotice: 'lookup-only (search query required for live catalog)' })).toBe(false);
    expect(hasNoPublicRemoteCatalog({ sourceNotice: 'lookup-only (custom endpoint)' })).toBe(false);
    expect(hasNoPublicRemoteCatalog({ sourceNotice: 'live-api (modelSearch)' })).toBe(false);
    expect(hasNoPublicRemoteCatalog(undefined)).toBe(false);
    expect(hasNoPublicRemoteCatalog(null)).toBe(false);
  });

  it('server.ts declares neutral boolean fields for /api/models pagination objects', () => {
    // Assert on server.ts pagination blocks
    // 1. Mage has noPublicRemoteCatalog: true
    const mageMatch = serverSource.match(/pagination\.mage\s*=\s*\{([^}]+)\}/);
    expect(mageMatch).not.toBeNull();
    expect(mageMatch![1]).toContain('noPublicRemoteCatalog: true');
    expect(mageMatch![1]).toContain('catalogAvailable: false');

    // 2. Agnes has noPublicRemoteCatalog: true
    const agnesMatch = serverSource.match(/pagination\.agnes\s*=\s*\{([^}]+)\}/);
    expect(agnesMatch).not.toBeNull();
    expect(agnesMatch![1]).toContain('noPublicRemoteCatalog: true');
    expect(agnesMatch![1]).toContain('catalogAvailable: false');

    // 3. Runware (no key) has requiresApiKey: true and does NOT have noPublicRemoteCatalog: true
    const rwNoKeyMatch = serverSource.match(/if\s*\(!runwareKey\)\s*\{[\s\S]*?pagination\.runware\s*=\s*\{([^}]+)\}/);
    expect(rwNoKeyMatch).not.toBeNull();
    expect(rwNoKeyMatch![1]).toContain('requiresApiKey: true');
    expect(rwNoKeyMatch![1]).not.toContain('noPublicRemoteCatalog: true');

    // 4. Runware (no search) has requiresSearchQuery: true and does NOT have noPublicRemoteCatalog: true
    const rwNoSearchMatch = serverSource.match(/else\s+if\s*\(!rawSearch\)\s*\{[\s\S]*?pagination\.runware\s*=\s*\{([^}]+)\}/);
    expect(rwNoSearchMatch).not.toBeNull();
    expect(rwNoSearchMatch![1]).toContain('requiresSearchQuery: true');
    expect(rwNoSearchMatch![1]).not.toContain('noPublicRemoteCatalog: true');

    // 5. ModelsLab (no key) has requiresApiKey: true and does NOT have noPublicRemoteCatalog: true
    const mlNoKeyMatch = serverSource.match(/if\s*\(!modelslabKey\)\s*\{[\s\S]*?pagination\.modelslab\s*=\s*\{([^}]+)\}/);
    expect(mlNoKeyMatch).not.toBeNull();
    expect(mlNoKeyMatch![1]).toContain('requiresApiKey: true');
    expect(mlNoKeyMatch![1]).not.toContain('noPublicRemoteCatalog: true');

    // 6. openai_compat / grok_compat has isCustomEndpoint: true and does NOT have noPublicRemoteCatalog: true
    const openaiMatch = serverSource.match(/pagination\.openai_compat\s*=\s*\{([^}]+)\}/);
    expect(openaiMatch).not.toBeNull();
    expect(openaiMatch![1]).toContain('isCustomEndpoint: true');
    expect(openaiMatch![1]).not.toContain('noPublicRemoteCatalog: true');
  });
});
