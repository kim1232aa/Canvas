import { describe, it, expect, vi, afterEach } from 'vitest';
import { putHistoryImageOnSaveNodes } from './applyHistoryToCanvas';
import { saveWorkspaceCache, loadWorkspaceCache } from './workspaceCache';
import { WORKFLOW_PRESETS } from '../constants/presets';
import { NODE_DEFINITIONS, engineNodeTypeFor } from '../constants/nodes';
import { CivitaiDriver } from '../engines/drivers/CivitaiDriver';
import { ReplicateDriver } from '../engines/drivers/ReplicateDriver';
import { extractWorkflowParameters } from './graphEngine';

const node = (id: string, type: string, extra: any = {}) => ({ id, type, title: type, pos: { x: 0, y: 0 }, inputs: [], outputs: [], values: {}, ...extra }) as any;

describe('video result lands on SaveVideo (declared mediaType, no URL/name guess)', () => {
  it('video goes to SaveVideo only; image keeps SaveImage', () => {
    const nodes = [node('v', 'AIVideoNode'), node('sv', 'SaveVideo'), node('si', 'SaveImage')];
    const vid = putHistoryImageOnSaveNodes(nodes, 'https://cdn/x.bin', 'video');
    expect(vid.imageApplied).toBe(true);
    expect(vid.nodes.find((n) => n.id === 'sv')!.outputData).toBe('https://cdn/x.bin');
    expect(vid.nodes.find((n) => n.id === 'si')!.outputData).toBeUndefined();
    const img = putHistoryImageOnSaveNodes(nodes, 'https://cdn/clip.mp4');
    expect(img.nodes.find((n) => n.id === 'si')!.outputData).toBe('https://cdn/clip.mp4');
    expect(img.nodes.find((n) => n.id === 'sv')!.outputData).toBeUndefined();
  });

  it('SaveVideo output survives a reload of the workspace cache', () => {
    const store = new Map<string, string>();
    const storage = { setItem: (k: string, v: string) => { store.set(k, v); }, getItem: (k: string) => store.get(k) ?? null };
    const placed = putHistoryImageOnSaveNodes([node('sv', 'SaveVideo')], 'https://cdn/v.mp4', 'video').nodes;
    saveWorkspaceCache([{ id: 'p', name: 'p', nodes: placed, connections: [], spatialFrames: [] } as any], 'p', 'graph', storage);
    const { active } = loadWorkspaceCache([], storage);
    const sv = active.nodes.find((n: any) => n.id === 'sv') as any;
    expect(sv.outputData).toBe('https://cdn/v.mp4');
  });
});

describe('Civitai i2v preset declares wan.md selectors; driver does not guess video from model name', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('std-civitai-i2v AIVideoNode carries wan.md v2.2 comfy selectors (only LoRA route)', () => {
    const p = WORKFLOW_PRESETS.find((x) => x.id === 'std-civitai-i2v');
    expect(p, 'current Civitai I2V preset').toBeDefined();
    const video = p!.nodes.find((n) => n.type === 'AIVideoNode');
    expect(video, 'Civitai video node').toBeDefined();
    expect(video!.values.video_selectors).toEqual({ engine: 'wan', version: 'v2.2', provider: 'comfy' });
  });

  it('model name containing image-to-video is NOT treated as video without isVideo', async () => {
    let body: any;
    vi.stubGlobal('fetch', vi.fn(async (_u: string, o: any) => { body = JSON.parse(o.body); return new Response(JSON.stringify({ error: 'fake' }), { status: 402 }); }));
    await expect(new CivitaiDriver().generate({ model: 'some/image-to-video', prompt: 'A lighthouse above rough seas, cinematic wide shot' } as any, {})).rejects.toMatchObject({ name: 'ApiTraceError', appStatus: 402, rawBody: '{"error":"fake"}' });
    expect(body.isVideo).toBe(false);
  });

  it('declared isVideo forwards selectors from extraParams', async () => {
    let body: any;
    vi.stubGlobal('fetch', vi.fn(async (_u: string, o: any) => { body = JSON.parse(o.body); return new Response(JSON.stringify({ error: 'fake' }), { status: 402 }); }));
    await new CivitaiDriver().generate({ model: 'wan', prompt: 'p', isVideo: true, image_url: 'https://i/x.png', extraParams: { engine: 'wan', version: 'v2.6', provider: 'fal', operation: 'image-to-video' } } as any, {}).catch(() => {});
    expect(body).toMatchObject({ isVideo: true, engine: 'wan', version: 'v2.6', provider: 'fal', operation: 'image-to-video' });
  });

  it('Replicate driver routes a video node to its live-Schema predictions route with isVideo (no local refusal, no model-name guess)', async () => {
    let body: any;
    const f = vi.fn(async (_u: string, o: any) => { body = JSON.parse(o.body); return new Response(JSON.stringify({ error: 'HTTP 402: x' }), { status: 402 }); });
    vi.stubGlobal('fetch', f);
    await expect(new ReplicateDriver().generate({ model: 'minimax/video-01', prompt: 'p', isVideo: true, image_url: 'https://i/x.png' } as any, {})).rejects.toThrow(/402/);
    expect(f.mock.calls[0][0]).toBe('/api/engine/replicate/generate');
    expect(body).toMatchObject({ model: 'minimax/video-01', isVideo: true, image_url: 'https://i/x.png' });
  });
});

describe('一体化引擎 node is declaration-driven', () => {
  it('engineNodeTypeFor reads NodeDefinition.engineProvider', () => {
    expect(engineNodeTypeFor('fal')).toBe('FalAIEngineNode');
    expect(engineNodeTypeFor('gemini')).toBe('GoogleImagenNode');
    expect(engineNodeTypeFor('wavespeed')).toBeUndefined();
    expect(Object.values(NODE_DEFINITIONS).filter((d) => d.engineProvider).length).toBe(6);
  });
});

describe('user-created video seed stays unset until explicitly filled', () => {
  it('AIVideoNode declares an empty number widget; extraction does not invent a seed and preserves explicit zero', () => {
    const def = NODE_DEFINITIONS.AIVideoNode;
    const seed = def.widgets.find((x) => x.name === 'seed');
    expect(seed, 'AIVideoNode seed widget').toBeDefined();
    expect(seed).toMatchObject({ type: 'number', default: '', step: 1 });
    const values = {
      ...def.defaultValues,
      targetProvider: 'novita', model: 'user-selected/video-model',
      prompt: 'A lighthouse above rough seas, cinematic wide shot, slow orbit',
      custom_parameters: JSON.stringify({ _canvas: { scope: { provider: 'novita', model: 'user-selected/video-model' }, schemaProperties: ['prompt', 'seed'] } }),
    };
    const video = node('user-video', 'AIVideoNode', { inputs: def.inputs, outputs: def.outputs, values });
    expect(video.values.seed).toBeUndefined();
    expect(extractWorkflowParameters([video], [], video.id).seed).toBeUndefined();
    expect(extractWorkflowParameters([{ ...video, values: { ...values, seed: 0 } }], [], video.id).seed).toBe(0);
    expect(JSON.parse(values.custom_parameters)._canvas.schemaProperties).toContain('seed');
  });
});
