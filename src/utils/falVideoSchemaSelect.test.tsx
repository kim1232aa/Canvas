/**
 * Fal video Schema fetch: select path must call noteUserModelSelection (same as 自定义模型 onCommit).
 * Loading a saved board hydrates Schema via App's debounced videoSchemaHydrateKey effect.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { hasModelSchemaFetch } from './schemaSendHint';

describe('Fal video model Schema fetch paths', () => {
  it('AIVideoNode model <select> onChange calls noteUserModelSelection (not only 自定义模型 onCommit)', () => {
    const src = readFileSync(join(__dirname, '../components/NodeItem.tsx'), 'utf8');
    expect(src).toMatch(
      /data-testid="node-video-model-select"[\s\S]*?onChange=\{\(e\) => \{ const v = e\.target\.value; onUpdateValue\(node\.id, widget\.name, v\); noteUserModelSelection\(currentProv, v\); \}\}/,
    );
    // Custom commit path still present
    expect(src).toMatch(/onCommit=\{\(v\) => \{ noteUserModelSelection\(currentProv, v\); \}\}/);
  });

  it('App hydrates Schema for AIVideoNode on saved-board model list (debounced)', () => {
    const src = readFileSync(join(__dirname, '../App.tsx'), 'utf8');
    expect(src).toContain('videoSchemaHydrateKey');
    expect(src).toMatch(/hasModelSchemaFetch\(p\)\) noteUserModelSelection\(p, m\)/);
    expect(hasModelSchemaFetch('fal')).toBe(true);
  });
});
