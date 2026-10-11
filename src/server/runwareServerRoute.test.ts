import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const serverSource = readFileSync(new URL('../../server.ts', import.meta.url), 'utf8');

describe('Server Runware and ModelsLab Routes Contract', () => {
  it('Runware route is registered in LARGE_BODY_ROUTES and calls buildRunwareImageRequest', () => {
    expect(serverSource).toContain("'/api/engine/runware/generate'");
    expect(serverSource).toContain('buildRunwareImageRequest');
    expect(serverSource).toContain('parseRunwareImageResponse');
    expect(serverSource).toContain("provider: 'runware'");
  });

  it('ModelsLab route is registered in LARGE_BODY_ROUTES and calls buildModelsLabImageRequest', () => {
    expect(serverSource).toContain("'/api/engine/modelslab/generate'");
    expect(serverSource).toContain('buildModelsLabImageRequest');
    expect(serverSource).toContain('parseModelsLabResponse');
    expect(serverSource).toContain("provider: 'modelslab'");
  });

  it('supports runware and modelslab in AUTH_META and POOL_KEY_FIELDS', () => {
    expect(serverSource).toContain("runware: { settings: ['runwareKey'], env: 'runwareKey' }");
    expect(serverSource).toContain("modelslab: { settings: ['modelslabKey'], env: 'modelslabKey' }");
    expect(serverSource).toContain("headerPrefix: 'x-runware'");
    expect(serverSource).toContain("headerPrefix: 'x-modelslab'");
    expect(serverSource).toContain("VALID_STRATEGY_PROVIDERS = new Set([\n  'fal',");
    expect(serverSource).toContain("'runware'");
    expect(serverSource).toContain("'modelslab'");
  });

  it('masks apiKey in ModelsLab responses and uses official fetch contract for async jobs', () => {
    expect(serverSource).toContain('sanitizeModelsLabPayload');
    expect(serverSource).toContain('buildModelsLabFetchRequest');
  });
});
