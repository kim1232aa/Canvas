import { describe, it, expect } from 'vitest';
import { WORKFLOW_PRESETS } from '../constants/presets';
import { extractWorkflowParameters } from './graphEngine';
import { generationReadiness } from './generationReadiness';

// Same path as the TopBar: preset nodes → extract (throws lock) → reason; both missing → 「reason；请填写提示词」.
describe('std-muapi-t2i TopBar reason after 仅载入', () => {
  const p = WORKFLOW_PRESETS.find((x) => x.id === 'std-muapi-t2i')!;
  const reason = p.pendingRecipe!;
  it('extract throws the LoRA reason, not 请填写提示词, with the preset empty prompt', () => {
    const save = p.nodes.find((n) => n.type === 'SaveImage')!;
    let msg = '';
    try { extractWorkflowParameters(p.nodes, p.connections, save.id); } catch (e: any) { msg = e.message; }
    expect(msg).toBe(reason);
    expect(msg).toMatch(/真 LoRA 地址/);
    expect(msg).toMatch(/载入后挂上/);
  });
  it('TopBar copy when both missing: LoRA first, then 请填写提示词', () => {
    expect(generationReadiness({ provider: 'muapi', model: 'flux-1-dev-style-lora-inference', prompt: '', executionBlockedReason: reason })).toBe(`${reason}；请填写提示词`);
  });
});
