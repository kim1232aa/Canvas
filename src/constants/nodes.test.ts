import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { NODE_DEFINITIONS } from './nodes';

describe('NODE_DEFINITIONS hollow-node audit', () => {
  it('does not register unimplemented ImageUpscaleWithModel', () => {
    // M41: no verified upscaler execution path (graph engine + server route) was wired this turn.
    // A shell node is worse than a missing one, so the definition stays absent.
    expect(NODE_DEFINITIONS).not.toHaveProperty('ImageUpscaleWithModel');
    expect(Object.keys(NODE_DEFINITIONS)).not.toContain('ImageUpscaleWithModel');
  });

  it('LoRALoader strength defaults are the documented recommended scale 1', () => {
    const def = NODE_DEFINITIONS.LoRALoader;
    expect(def.defaultValues?.strength_model).toBe(1);
    expect(def.defaultValues?.strength_clip).toBe(1);
    const model = def.widgets?.find((w) => w.name === 'strength_model');
    const clip = def.widgets?.find((w) => w.name === 'strength_clip');
    expect(model?.default).toBe(1);
    expect(clip?.default).toBe(1);
    expect(String(model?.label ?? '')).toContain('1.0');
  });

  it('keeps CivitaiLoRABrowserNode.search_keyword as a real canvas field', () => {
    const def = NODE_DEFINITIONS.CivitaiLoRABrowserNode;
    expect(def).toBeDefined();
    expect(def.widgets?.some((w) => w.name === 'search_keyword')).toBe(true);
    expect(def.defaultValues).toHaveProperty('search_keyword');
  });

  it('wires CivitaiLoRABrowserNode.search_keyword into CivitaiModal initialQuery', () => {
    const app = fs.readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
    const modal = fs.readFileSync(new URL('../components/CivitaiModal.tsx', import.meta.url), 'utf8');
    expect(modal).toContain('initialQuery?: string');
    expect(modal).toContain('if (opening && initialQuery !== undefined)');
    expect(modal).toContain('setQuery(initialQuery)');
    expect(app).toContain("initialQuery={targetLoRANodeId ? String(nodes.find((n) => n.id === targetLoRANodeId)?.values?.search_keyword ?? '') : undefined}");
  });
});
