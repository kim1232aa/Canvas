/**
 * Real-UI repro: 仅载入 preset → save workspace → hard refresh (loadWorkspaceCache/resetRunState).
 * Sampler hide of steps/CFG depends on schemaSendStatus === not_sent, which needs schemaProperties
 * on the Checkpoint custom_parameters (or a ready Schema cache). Stripping them on reload breaks the UI.
 */
import { describe, expect, it } from 'vitest';
import { WORKFLOW_PRESETS } from '../constants/presets';
import { schemaSendStatus } from './schemaSendStatus';
import { readDeclaredSchemaProperties } from './schemaSendHint';
import { withCachedSchemaProperties } from '../services/modelSchemaCache';
import {
  loadWorkspaceCache,
  saveWorkspaceCache,
  resetRunState,
  stripDerivedSchema,
  BOARDS_KEY,
  ACTIVE_BOARD_KEY,
  MODE_KEY,
} from './workspaceCache';

function muapiPreset() {
  const p = WORKFLOW_PRESETS.find((x) => x.id === 'std-muapi-t2i');
  if (!p) throw new Error('std-muapi-t2i missing');
  return p;
}

function memStorage(seed: Record<string, string> = {}) {
  const store = { ...seed };
  return {
    getItem: (k: string) => (k in store ? store[k] : null),
    setItem: (k: string, v: string) => {
      store[k] = v;
    },
    _store: store,
  };
}

describe('schema omit persists across workspace reload (real UI path)', () => {

  it('stripDerivedSchema keeps schemaProperties+scope; only drops ephemeral session flags', () => {
    const raw = JSON.stringify({
      _canvas: {
        scope: { provider: 'muapi', model: 'flux-1-dev-style-lora-inference' },
        schemaProperties: ['prompt', 'lora_url'],
        schemaLoading: true,
        schemaUnavailable: true,
        hasReferenceImage: true,
        schemaUnprobed: true,
        schemaConfirmedFields: ['prompt'],
      },
      userKey: 1,
    });
    const out = JSON.parse(stripDerivedSchema(raw));
    expect(out.userKey).toBe(1);
    expect(out._canvas.schemaProperties).toEqual(['prompt', 'lora_url']);
    expect(out._canvas.scope).toEqual({ provider: 'muapi', model: 'flux-1-dev-style-lora-inference' });
    expect(out._canvas.schemaLoading).toBeUndefined();
    expect(out._canvas.schemaUnavailable).toBeUndefined();
    expect(out._canvas.hasReferenceImage).toBeUndefined();
    // Confirmed / unprobed are Schema-GET session hints — drop on reload (live GET re-applies).
    expect(out._canvas.schemaConfirmedFields).toBeUndefined();
    expect(out._canvas.schemaUnprobed).toBeUndefined();
  });
});
