import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { NODE_DEFINITIONS } from './nodes';

describe('NODE_DEFINITIONS hollow-node audit', () => {
  it('does not register unimplemented ImageUpscaleWithModel', () => {
    expect(NODE_DEFINITIONS).not.toHaveProperty('ImageUpscaleWithModel');
    expect(Object.keys(NODE_DEFINITIONS)).not.toContain('ImageUpscaleWithModel');
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
