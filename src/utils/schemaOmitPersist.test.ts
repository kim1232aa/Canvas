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
  it('preset seeds schemaProperties → steps/CFG not_sent before any Schema GET', () => {
    const p = muapiPreset();
    const ckpt = p.nodes.find((n) => n.type === 'CheckpointLoaderSimple')!;
    const raw = String(ckpt.values.custom_parameters || '');
    const declared = readDeclaredSchemaProperties(raw);
    expect(declared && declared.size > 0).toBe(true);
    expect(declared!.has('steps')).toBe(false);
    expect(declared!.has('cfg')).toBe(false);
    // Same merge NodeItem uses (cold cache keeps node props).
    const merged = withCachedSchemaProperties('muapi', 'flux-1-dev-style-lora-inference', raw);
    expect(schemaSendStatus('muapi', 'steps', undefined, merged)).toBe('not_sent');
    expect(schemaSendStatus('muapi', 'cfg', undefined, merged)).toBe('not_sent');
  });

  it('hard refresh must NOT drop scoped schemaProperties (else sampler shows empty steps/CFG shells)', () => {
    const p = muapiPreset();
    const board = {
      id: 'board-muapi',
      name: 'MuAPI',
      description: '',
      updatedAt: 0,
      nodes: JSON.parse(JSON.stringify(p.nodes)),
      connections: JSON.parse(JSON.stringify(p.connections)),
      spatialFrames: JSON.parse(JSON.stringify(p.spatialFrames || [])),
    };
    const ckptBefore = board.nodes.find((n: any) => n.type === 'CheckpointLoaderSimple')!;
    expect(schemaSendStatus('muapi', 'steps', undefined, ckptBefore.values.custom_parameters)).toBe('not_sent');

    const storage = memStorage();
    saveWorkspaceCache([board], board.id, 'graph', storage);
    expect(storage._store[BOARDS_KEY]).toBeTruthy();

    const { active } = loadWorkspaceCache([board], storage);
    expect(active.id).toBe(board.id);
    const ckptAfter = active.nodes.find((n: any) => n.type === 'CheckpointLoaderSimple')!;
    const props = readDeclaredSchemaProperties(ckptAfter.values?.custom_parameters);
    expect(props && [...props]).toEqual(
      expect.arrayContaining(['prompt', 'lora_url', 'lora_weight', 'aspect_ratio']),
    );
    const merged = withCachedSchemaProperties(
      'muapi',
      'flux-1-dev-style-lora-inference',
      ckptAfter.values?.custom_parameters,
    );
    expect(schemaSendStatus('muapi', 'steps', undefined, merged)).toBe('not_sent');
    expect(schemaSendStatus('muapi', 'cfg', undefined, merged)).toBe('not_sent');
  });

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

  it('resetRunState alone keeps omit badges for any schema-driven preset with seeded props', () => {
    const p = muapiPreset();
    const restored = resetRunState({
      id: 'x',
      name: 'x',
      nodes: JSON.parse(JSON.stringify(p.nodes)),
      connections: [],
      spatialFrames: [],
    } as any);
    const ckpt = restored.nodes.find((n: any) => n.type === 'CheckpointLoaderSimple')!;
    expect(schemaSendStatus('muapi', 'steps', undefined, ckpt.values.custom_parameters)).toBe('not_sent');
  });
});
