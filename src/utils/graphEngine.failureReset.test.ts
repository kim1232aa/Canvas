// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { executeWorkflow } from './graphEngine';
import { Connection, NodeInstance } from '../types/graph';
import { EngineRegistry } from '../engines/EngineRegistry';

const node = (id: string, type: string, values: Record<string, any> = {}): NodeInstance =>
  ({ id, type, title: type, x: 0, y: 0, values, state: 'idle', progress: 0 } as unknown as NodeInstance);

describe('executeWorkflow failure resets running nodes', () => {
  afterEach(() => vi.restoreAllMocks());

  it('does not leave a KSampler stuck at running/50 when generate throws (sink selected)', async () => {
    const nodes = [
      node('c', 'CheckpointLoaderSimple', { targetProvider: 'fal', ckpt_name: 'fal-ai/flux/dev' }),
      node('p', 'CLIPTextEncode', { text: 'a cat' }),
      node('k', 'KSampler', { steps: 20 }),
      node('d', 'VAEDecode', {}),
      node('s', 'SaveImage', {}),
    ];
    const connections: Connection[] = [
      { id: 'm', fromNodeId: 'c', fromSocketId: 'MODEL', toNodeId: 'k', toSocketId: 'model', type: 'MODEL' },
      { id: 'pk', fromNodeId: 'p', fromSocketId: 'CONDITIONING', toNodeId: 'k', toSocketId: 'positive', type: 'CONDITIONING' },
      { id: 'kd', fromNodeId: 'k', fromSocketId: 'LATENT', toNodeId: 'd', toSocketId: 'samples', type: 'LATENT' },
      { id: 'ds', fromNodeId: 'd', fromSocketId: 'IMAGE', toNodeId: 's', toSocketId: 'images', type: 'IMAGE' },
    ];
    vi.spyOn(EngineRegistry, 'generate').mockRejectedValue(new Error('HTTP 402 insufficient balance'));
    const calls: Array<[string, string, number | undefined]> = [];
    await expect(
      executeWorkflow(nodes, connections, (id, state, progress) => { if (state) calls.push([id, state, progress]); }, undefined, 's'),
    ).rejects.toThrow(/402/);
    const last = (id: string) => calls.filter((c) => c[0] === id).at(-1);
    expect(calls).toContainEqual(['k', 'running', 50]);
    // The sampler is the resolved executing node, so it ends as the visible error (never left at running/50).
    expect(last('k')).toEqual(['k', 'error', 0]);
    expect(calls.filter((c) => c[1] === 'running').every((c) => last(c[0])?.[1] !== 'running')).toBe(true);
  });

  it('marks the sampler error (not idle) when the sampler itself is the failed target', async () => {
    const nodes = [
      node('c', 'CheckpointLoaderSimple', { targetProvider: 'fal', ckpt_name: 'fal-ai/flux/dev' }),
      node('k', 'KSampler', { steps: 20, prompt: 'a cat' }),
    ];
    const connections: Connection[] = [{ id: 'm', fromNodeId: 'c', fromSocketId: 'MODEL', toNodeId: 'k', toSocketId: 'model', type: 'MODEL' }];
    vi.spyOn(EngineRegistry, 'generate').mockRejectedValue(new Error('HTTP 500'));
    const calls: Array<[string, string]> = [];
    await expect(executeWorkflow(nodes, connections, (id, state) => { if (state) calls.push([id, state]); }, undefined, 'k')).rejects.toThrow(/500/);
    expect(calls.filter((c) => c[0] === 'k').at(-1)).toEqual(['k', 'error']);
  });

  it('resets an LLM reasoning node left at running when the later generate call throws', async () => {
    const nodes = [
      node('c', 'CheckpointLoaderSimple', { targetProvider: 'fal', ckpt_name: 'model' }),
      node('k', 'KSampler', {}),
      node('llm', 'LLMReasoningNode', { provider: 'openai_compat', model: 'gpt-4o', prompt: 'a cat' }),
    ];
    const connections: Connection[] = [
      { id: 'm', fromNodeId: 'c', fromSocketId: 'MODEL', toNodeId: 'k', toSocketId: 'model', type: 'MODEL' },
      { id: 'pos', fromNodeId: 'llm', fromSocketId: 'CONDITIONING', toNodeId: 'k', toSocketId: 'positive', type: 'CONDITIONING' },
    ];
    // Empty content: the reasoning branch never reports success, so only the catch path can release it.
    vi.spyOn(EngineRegistry, 'chat').mockResolvedValue({ content: '', provider: 'openai_compat', providerId: 'openai_compat', model: 'gpt-4o' } as any);
    vi.spyOn(EngineRegistry, 'generate').mockRejectedValue(new Error('HTTP 503'));
    const calls: Array<[string, string]> = [];
    await expect(executeWorkflow(nodes, connections, (id, state) => { if (state) calls.push([id, state]); }, undefined, 'k')).rejects.toThrow(/503/);
    expect(calls).toContainEqual(['llm', 'running']);
    expect(calls.filter((c) => c[0] === 'llm').at(-1)).toEqual(['llm', 'idle']);
    expect(calls.filter((c) => c[0] === 'k').at(-1)).toEqual(['k', 'error']);
  });
});
