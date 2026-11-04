import { describe, it, expect, vi, afterEach } from 'vitest';
import { putHistoryImageOnSaveNodes } from './applyHistoryToCanvas';
import { saveWorkspaceCache, loadWorkspaceCache } from './workspaceCache';
import { WORKFLOW_PRESETS } from '../constants/presets';
import { NODE_DEFINITIONS, engineNodeTypeFor } from '../constants/nodes';
import { CivitaiDriver } from '../engines/drivers/CivitaiDriver';
import { ReplicateDriver } from '../engines/drivers/ReplicateDriver';

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
    const p = WORKFLOW_PRESETS.find((x) => x.id === 'std-civitai-i2v')!;
    const vid = p.nodes.find((n) => n.type === 'AIVideoNode')!;
    expect(vid.values.video_selectors).toEqual({ engine: 'wan', version: 'v2.2', provider: 'comfy' });
  });

  it('model name containing image-to-video is NOT treated as video without isVideo', async () => {
    let body: any;
    vi.stubGlobal('fetch', vi.fn(async (_u: string, o: any) => { body = JSON.parse(o.body); return new Response(JSON.stringify({ error: 'fake' }), { status: 402 }); }));
    await new CivitaiDriver().generate({ model: 'some/image-to-video', prompt: 'p' } as any, {}).catch(() => {});
    expect(body.isVideo).toBe(false);
  });

  it('declared isVideo forwards selectors from extraParams', async () => {
    let body: any;
    vi.stubGlobal('fetch', vi.fn(async (_u: string, o: any) => { body = JSON.parse(o.body); return new Response(JSON.stringify({ error: 'fake' }), { status: 402 }); }));
    await new CivitaiDriver().generate({ model: 'wan', prompt: 'p', isVideo: true, image_url: 'https://i/x.png', extraParams: { engine: 'wan', version: 'v2.6', provider: 'fal', operation: 'image-to-video' } } as any, {}).catch(() => {});
    expect(body).toMatchObject({ isVideo: true, engine: 'wan', version: 'v2.6', provider: 'fal', operation: 'image-to-video' });
  });

  it('Replicate driver refuses a video node before any request (no image-only path reuse)', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    await expect(new ReplicateDriver().generate({ model: 'minimax/video-01', prompt: 'p', isVideo: true, image_url: 'https://i/x.png' } as any, {})).rejects.toThrow(/img2video/);
    expect(f).not.toHaveBeenCalled();
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

describe('Novita I2V seed (required by SDK) is an empty, editable field', () => {
  it('AIVideoNode declares a seed widget with empty default; Novita preset leaves it unset and declares seed', () => {
    const w = NODE_DEFINITIONS.AIVideoNode.widgets.find((x) => x.name === 'seed')!;
    expect(w.default).toBe('');
    const vid = WORKFLOW_PRESETS.find((x) => x.id === 'std-novita-i2v')!.nodes.find((n) => n.type === 'AIVideoNode')!;
    expect(vid.values.seed).toBeUndefined();
    expect(JSON.parse(vid.values.custom_parameters)._canvas.schemaProperties).toContain('seed');
  });
});
