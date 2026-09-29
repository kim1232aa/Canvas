import { isCanvasFieldUnsupported } from './resolveCheckpoint';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { extractWorkflowParameters, executeWorkflow, resolveTargetNode } from './graphEngine';
import { Connection, NodeInstance } from '../types/graph';
import { EngineRegistry } from '../engines/EngineRegistry';
import { NormalizedGenerateResult } from '../engines/types';
import * as api from '../services/api';

describe('graphEngine - B2 & L2a & L2b 拓扑反向追踪与参数抽取隔离测试', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(api, 'getStoredApiKeys').mockReturnValue({} as any);
  });

  const createNode = (id: string, type: string, values: Record<string, any>): NodeInstance => ({
    id,
    type,
    title: type,
    pos: { x: 0, y: 0 },
    inputs: [],
    outputs: [],
    values,
  });

  it('一个画布上两个 AIVideoNode + 两个图片节点，各自带自己的 model 且不会拿到另一节点的参考图', async () => {
    // 构造单张画布：包含 2 个视频节点 + 2 个图片节点，各自带有各自的 LoadImage 参考图
    const nodes: NodeInstance[] = [
      // 视频节点 1 及专属参考图
      createNode('video-node-1', 'AIVideoNode', {
        model: 'fal-ai/wan-t2v',
        targetProvider: 'fal',
        prompt: 'flying golden dragon above misty mountains',
        duration: 5,
        fps: 16,
      }),
      createNode('load-img-v1', 'LoadImage', {
        image_url: 'https://example.com/assets/dragon-ref.png',
      }),

      // 视频节点 2 及专属参考图
      createNode('video-node-2', 'AIVideoNode', {
        model: 'fal-ai/ltx-video',
        targetProvider: 'fal',
        prompt: 'cyberpunk sports car drifting in neon rain',
        duration: 4,
        fps: 24,
      }),
      createNode('load-img-v2', 'LoadImage', {
        image_url: 'https://example.com/assets/car-ref.png',
      }),

      // 图片节点 1 (FalAIEngineNode) 及专属参考图
      createNode('image-node-1', 'FalAIEngineNode', {
        model: 'fal-ai/flux/schnell',
        prompt: 'macro close-up portrait of an orange cat',
      }),
      createNode('load-img-i1', 'LoadImage', {
        image_url: 'https://example.com/assets/cat-ref.png',
      }),

      // 图片节点 2 (FalAIEngineNode) 及专属参考图
      createNode('image-node-2', 'FalAIEngineNode', {
        model: 'fal-ai/flux/dev',
        prompt: 'serene oil painting of autumn forest lake',
      }),
      createNode('load-img-i2', 'LoadImage', {
        image_url: 'https://example.com/assets/lake-ref.png',
      }),
    ];

    // 连接线：每个 LoadImage 只接入各自对应的节点
    const connections: Connection[] = [
      {
        id: 'conn-v1',
        fromNodeId: 'load-img-v1',
        fromSocketId: 'IMAGE',
        toNodeId: 'video-node-1',
        toSocketId: 'init_image',
        type: 'IMAGE',
      },
      {
        id: 'conn-v2',
        fromNodeId: 'load-img-v2',
        fromSocketId: 'IMAGE',
        toNodeId: 'video-node-2',
        toSocketId: 'init_image',
        type: 'IMAGE',
      },
      {
        id: 'conn-i1',
        fromNodeId: 'load-img-i1',
        fromSocketId: 'IMAGE',
        toNodeId: 'image-node-1',
        toSocketId: 'image',
        type: 'IMAGE',
      },
      {
        id: 'conn-i2',
        fromNodeId: 'load-img-i2',
        fromSocketId: 'IMAGE',
        toNodeId: 'image-node-2',
        toSocketId: 'image',
        type: 'IMAGE',
      },
    ];

    // 1. 抽取视频节点 1 参数
    const paramsV1 = extractWorkflowParameters(nodes, connections, 'video-node-1');
    expect(paramsV1.checkpointModel).toBe('fal-ai/wan-t2v');
    expect(paramsV1.initImageUrl).toBe('https://example.com/assets/dragon-ref.png');
    expect(paramsV1.positivePrompt).toBe('flying golden dragon above misty mountains');
    expect(paramsV1.isVideo).toBe(true);
    expect(paramsV1.checkpointModel).not.toBe('fal-ai/flux/schnell');
    expect(paramsV1.checkpointModel).not.toBe('fal-ai/flux/dev');
    expect(paramsV1.checkpointModel).not.toBe('fal-ai/ltx-video');
    expect(paramsV1.initImageUrl).not.toBe('https://example.com/assets/car-ref.png');
    expect(paramsV1.initImageUrl).not.toBe('https://example.com/assets/cat-ref.png');
    expect(paramsV1.initImageUrl).not.toBe('https://example.com/assets/lake-ref.png');

    // 2. 抽取视频节点 2 参数
    const paramsV2 = extractWorkflowParameters(nodes, connections, 'video-node-2');
    expect(paramsV2.checkpointModel).toBe('fal-ai/ltx-video');
    expect(paramsV2.initImageUrl).toBe('https://example.com/assets/car-ref.png');
    expect(paramsV2.positivePrompt).toBe('cyberpunk sports car drifting in neon rain');
    expect(paramsV2.isVideo).toBe(true);
    expect(paramsV2.checkpointModel).not.toBe('fal-ai/wan-t2v');
    expect(paramsV2.checkpointModel).not.toBe('fal-ai/flux/schnell');
    expect(paramsV2.checkpointModel).not.toBe('fal-ai/flux/dev');
    expect(paramsV2.initImageUrl).not.toBe('https://example.com/assets/dragon-ref.png');
    expect(paramsV2.initImageUrl).not.toBe('https://example.com/assets/cat-ref.png');
    expect(paramsV2.initImageUrl).not.toBe('https://example.com/assets/lake-ref.png');

    // 3. 抽取图片节点 1 参数
    const paramsI1 = extractWorkflowParameters(nodes, connections, 'image-node-1');
    expect(paramsI1.checkpointModel).toBe('fal-ai/flux/schnell');
    expect(paramsI1.initImageUrl).toBe('https://example.com/assets/cat-ref.png');
    expect(paramsI1.positivePrompt).toBe('macro close-up portrait of an orange cat');
    expect(paramsI1.isVideo).toBe(false);
    expect(paramsI1.checkpointModel).not.toBe('fal-ai/wan-t2v');
    expect(paramsI1.checkpointModel).not.toBe('fal-ai/ltx-video');
    expect(paramsI1.checkpointModel).not.toBe('fal-ai/flux/dev');
    expect(paramsI1.initImageUrl).not.toBe('https://example.com/assets/dragon-ref.png');
    expect(paramsI1.initImageUrl).not.toBe('https://example.com/assets/car-ref.png');
    expect(paramsI1.initImageUrl).not.toBe('https://example.com/assets/lake-ref.png');

    // 4. 抽取图片节点 2 参数
    const paramsI2 = extractWorkflowParameters(nodes, connections, 'image-node-2');
    expect(paramsI2.checkpointModel).toBe('fal-ai/flux/dev');
    expect(paramsI2.initImageUrl).toBe('https://example.com/assets/lake-ref.png');
    expect(paramsI2.positivePrompt).toBe('serene oil painting of autumn forest lake');
    expect(paramsI2.isVideo).toBe(false);
    expect(paramsI2.checkpointModel).not.toBe('fal-ai/wan-t2v');
    expect(paramsI2.checkpointModel).not.toBe('fal-ai/ltx-video');
    expect(paramsI2.checkpointModel).not.toBe('fal-ai/flux/schnell');
    expect(paramsI2.initImageUrl).not.toBe('https://example.com/assets/dragon-ref.png');
    expect(paramsI2.initImageUrl).not.toBe('https://example.com/assets/car-ref.png');
    expect(paramsI2.initImageUrl).not.toBe('https://example.com/assets/cat-ref.png');

    // 5. 分别对每个节点执行 executeWorkflow，断言各自只提交自己的 model 与参数
    const generateSpy = vi.spyOn(EngineRegistry, 'generate').mockImplementation(async (provider, params): Promise<NormalizedGenerateResult> => ({
      mediaUrl: 'https://example.com/result.png',
      provider,
      providerId: provider as any,
      model: params.model,
      seed: 42,
      mediaType: params.isVideo ? 'video' : 'image',
    }));

    const states: Record<string, NodeInstance['state']> = {};
    const onNodeStateChange = (nodeId: string, state: NodeInstance['state']) => {
      states[nodeId] = state;
    };

    // 执行 video-node-1
    const resV1 = await executeWorkflow(nodes, connections, onNodeStateChange, undefined, 'video-node-1');
    expect(resV1.model).toBe('fal-ai/wan-t2v');
    expect(generateSpy).toHaveBeenLastCalledWith(
      'video',
      expect.objectContaining({
        model: 'fal-ai/wan-t2v',
        image_url: 'https://example.com/assets/dragon-ref.png',
        prompt: 'flying golden dragon above misty mountains',
        isVideo: true,
      }),
      expect.anything()
    );

    // 执行 image-node-1
    const resI1 = await executeWorkflow(nodes, connections, onNodeStateChange, undefined, 'image-node-1');
    expect(resI1.model).toBe('fal-ai/flux/schnell');
    expect(generateSpy).toHaveBeenLastCalledWith(
      'fal',
      expect.objectContaining({
        model: 'fal-ai/flux/schnell',
        image_url: 'https://example.com/assets/cat-ref.png',
        prompt: 'macro close-up portrait of an orange cat',
        isVideo: false,
      }),
      expect.anything()
    );
  });

  it('CheckpointLoaderSimple 与 KSampler 图片流与 AIVideoNode 并在同一画布时严格隔离', () => {
    const nodes: NodeInstance[] = [
      // 视频节点
      createNode('video-1', 'AIVideoNode', {
        model: 'fal-ai/wan-t2v',
        targetProvider: 'fal',
        prompt: 'ocean tide at sunset',
      }),
      // Comfy 经典流
      createNode('ckpt-1', 'CheckpointLoaderSimple', {
        ckpt_name: 'fal-ai/flux/dev',
      }),
      createNode('clip-1', 'CLIPTextEncode', {
        text: 'photorealistic mountain peaks',
      }),
      createNode('ksampler-1', 'KSampler', {
        steps: 30,
        cfg: 7.0,
      }),
      createNode('load-img-comfy', 'LoadImage', {
        image_url: 'https://example.com/comfy-init.png',
      }),
    ];

    const connections: Connection[] = [
      {
        id: 'c1',
        fromNodeId: 'ckpt-1',
        fromSocketId: 'MODEL',
        toNodeId: 'ksampler-1',
        toSocketId: 'model',
        type: 'MODEL',
      },
      {
        id: 'c2',
        fromNodeId: 'clip-1',
        fromSocketId: 'CONDITIONING',
        toNodeId: 'ksampler-1',
        toSocketId: 'positive',
        type: 'CONDITIONING',
      },
      {
        id: 'c3',
        fromNodeId: 'load-img-comfy',
        fromSocketId: 'IMAGE',
        toNodeId: 'ksampler-1',
        toSocketId: 'latent_image',
        type: 'IMAGE',
      },
    ];

    // 执行 video-1：绝不能拿到 ckpt-1 的 fal-ai/flux/dev，也不能拿到 load-img-comfy 的参考图
    const videoParams = extractWorkflowParameters(nodes, connections, 'video-1');
    expect(videoParams.checkpointModel).toBe('fal-ai/wan-t2v');
    expect(videoParams.initImageUrl).toBeUndefined();
    expect(videoParams.positivePrompt).toBe('ocean tide at sunset');

    // 执行 ksampler-1：拿到 ckpt-1 的模型和 load-img-comfy 的参考图
    const ksamplerParams = extractWorkflowParameters(nodes, connections, 'ksampler-1');
    expect(ksamplerParams.checkpointModel).toBe('fal-ai/flux/dev');
    expect(ksamplerParams.initImageUrl).toBe('https://example.com/comfy-init.png');
    expect(ksamplerParams.positivePrompt).toBe('photorealistic mountain peaks');
  });

  it('L2a: 节点未连接参考图时，画布上即使有别的 LoadImage 节点，initImageUrl 也必须为 undefined', () => {
    const nodes: NodeInstance[] = [
      createNode('video-node', 'AIVideoNode', {
        model: 'fal-ai/wan-t2v',
        targetProvider: 'fal',
        prompt: 'a running horse in desert',
      }),
      createNode('orphan-load-image', 'LoadImage', {
        image_url: 'https://example.com/orphan.png',
      }),
    ];

    // 无任何连线
    const connections: Connection[] = [];

    const params = extractWorkflowParameters(nodes, connections, 'video-node');
    expect(params.initImageUrl).toBeUndefined();
  });

  it('L2b: 提示词为空时不再使用硬编码兜底文案，而是抛出「请填写提示词」错误', () => {
    const nodes: NodeInstance[] = [
      createNode('video-node', 'AIVideoNode', {
        model: 'fal-ai/wan-t2v',
        targetProvider: 'fal',
        prompt: '', // 空提示词
      }),
    ];

    expect(() => {
      extractWorkflowParameters(nodes, [], 'video-node');
    }).toThrow('请填写提示词');
  });

  it('B2: 节点未选模型时抛出「请先选择模型」错误，绝不借用画布上其它节点的模型', () => {
    const nodes: NodeInstance[] = [
      createNode('video-node', 'AIVideoNode', {
        model: '', // 未选择模型
        prompt: 'cool animation',
      }),
      createNode('other-image-node', 'FalAIEngineNode', {
        model: 'fal-ai/flux/schnell',
        prompt: 'other image prompt',
      }),
    ];

    expect(() => {
      extractWorkflowParameters(nodes, [], 'video-node');
    }).toThrow('请先选择模型');
  });

  it('执行失败时只将错误状态标记到当前执行的节点，避免在不相关的节点上重复报两次错误', async () => {
    const nodes: NodeInstance[] = [
      createNode('video-node-1', 'AIVideoNode', {
        model: '', // 触发错误
        prompt: 'test prompt',
      }),
      createNode('video-node-2', 'AIVideoNode', {
        model: 'fal-ai/ltx-video',
        prompt: 'test prompt 2',
      }),
    ];

    const errorRecordedNodes: string[] = [];
    const onNodeStateChange = (nodeId: string, state: NodeInstance['state'], _p?: number, _out?: any, errorMsg?: string) => {
      if (state === 'error') {
        errorRecordedNodes.push(nodeId);
      }
    };

    await expect(
      executeWorkflow(nodes, [], onNodeStateChange, undefined, 'video-node-1')
    ).rejects.toThrow('请先选择模型');

    // 只有 video-node-1 被标记了错误，video-node-2 不受任何影响
    expect(errorRecordedNodes).toEqual(['video-node-1']);
  });

  it('B1: Fal schnell + connected LoRA extracts Fal params (no client pre-send throw) so executeWorkflow can POST /api/fal/generate', () => {
    const nodes: NodeInstance[] = [
      createNode('fal-1', 'FalAIEngineNode', {
        model: 'fal-ai/flux/schnell',
        prompt: 'a test astronaut',
      }),
      createNode('lora-1', 'LoRALoader', {
        lora_name: 'koda',
        strength_model: 1.0,
        strength_clip: 1.0,
      }),
    ];
    const connections: Connection[] = [
      {
        id: 'c-lora',
        fromNodeId: 'lora-1',
        fromSocketId: 'MODEL',
        toNodeId: 'fal-1',
        toSocketId: 'lora',
        type: 'MODEL',
      },
    ];
    const params = extractWorkflowParameters(nodes, connections, 'fal-1');
    expect(params.targetProvider).toBe('fal');
    expect(params.checkpointModel).toBe('fal-ai/flux/schnell');
    expect(params.loras.map((l) => l.name)).toContain('koda');
  });

  it('B1-r2b: Fal + LoRA + zombie Checkpoint/KSampler auto-detects Fal, never HuggingFace', async () => {
    const nodes: NodeInstance[] = [
      createNode('fal-1', 'FalAIEngineNode', {
        model: 'fal-ai/flux/schnell',
        prompt: 'a futuristic astronaut',
      }),
      createNode('lora-1', 'LoRALoader', {
        lora_name: 'koda',
        strength_model: 1.0,
        strength_clip: 1.0,
        base_model: 'Flux.1 D',
      }),
      createNode('ckpt-zombie', 'CheckpointLoaderSimple', {
        ckpt_name: 'Tongyi-MAI/Z-Image-Turbo',
      }),
      createNode('ksampler-1', 'KSampler', { steps: 20, cfg: 7 }),
      createNode('clip-1', 'CLIPTextEncode', { text: 'zombie prompt' }),
      createNode('latent-1', 'EmptyLatentImage', { width: 1024, height: 1024 }),
    ];
    const connections: Connection[] = [
      {
        id: 'c-ckpt',
        fromNodeId: 'ckpt-zombie',
        fromSocketId: 'MODEL',
        toNodeId: 'ksampler-1',
        toSocketId: 'model',
        type: 'MODEL',
      },
      {
        id: 'c-clip',
        fromNodeId: 'clip-1',
        fromSocketId: 'CONDITIONING',
        toNodeId: 'ksampler-1',
        toSocketId: 'positive',
        type: 'CONDITIONING',
      },
      {
        id: 'c-latent',
        fromNodeId: 'latent-1',
        fromSocketId: 'LATENT',
        toNodeId: 'ksampler-1',
        toSocketId: 'latent_image',
        type: 'LATENT',
      },
    ];

    expect(resolveTargetNode(nodes, connections).type).toBe('FalAIEngineNode');

    const params = extractWorkflowParameters(nodes, connections);
    expect(params.targetProvider).toBe('fal');
    expect(params.checkpointModel).toBe('fal-ai/flux/schnell');
    expect(params.checkpointModel).not.toContain('Z-Image');
    expect(params.loras.map((l) => l.name)).toContain('koda');

    const generateSpy = vi.spyOn(EngineRegistry, 'generate').mockImplementation(async (provider, p): Promise<NormalizedGenerateResult> => ({
      mediaUrl: 'https://example.com/result.png',
      provider,
      providerId: provider as any,
      model: p.model,
      seed: 1,
      mediaType: 'image',
    }));

    await executeWorkflow(nodes, connections, () => {}, undefined);
    // Schema marks fal-ai/flux/schnell.loras unsupported → omit from payload (values stay in workflow extract).
    expect(generateSpy).toHaveBeenCalledWith(
      'fal',
      expect.objectContaining({
        model: 'fal-ai/flux/schnell',
        loras: undefined,
      }),
      expect.anything()
    );
    expect(generateSpy).not.toHaveBeenCalledWith('huggingface', expect.anything(), expect.anything());
  });

  it('B1-r2b: CLIP connected to Fal prefers Fal over zombie KSampler when CLIP is selected', () => {
    const nodes: NodeInstance[] = [
      createNode('fal-1', 'FalAIEngineNode', {
        model: 'fal-ai/flux/schnell',
        prompt: '',
      }),
      createNode('clip-fal', 'CLIPTextEncode', { text: 'fal prompt' }),
      createNode('ckpt-zombie', 'CheckpointLoaderSimple', {
        ckpt_name: 'Tongyi-MAI/Z-Image-Turbo',
      }),
      createNode('ksampler-1', 'KSampler', { steps: 20 }),
      createNode('lora-1', 'LoRALoader', { lora_name: 'koda', strength_model: 1 }),
    ];
    const connections: Connection[] = [
      {
        id: 'c-clip-fal',
        fromNodeId: 'clip-fal',
        fromSocketId: 'CONDITIONING',
        toNodeId: 'fal-1',
        toSocketId: 'prompt',
        type: 'CONDITIONING',
      },
      {
        id: 'c-ckpt',
        fromNodeId: 'ckpt-zombie',
        fromSocketId: 'MODEL',
        toNodeId: 'ksampler-1',
        toSocketId: 'model',
        type: 'MODEL',
      },
    ];
    const params = extractWorkflowParameters(nodes, connections, 'clip-fal');
    expect(params.targetProvider).toBe('fal');
    expect(params.checkpointModel).toBe('fal-ai/flux/schnell');
    expect(params.positivePrompt).toBe('fal prompt');
  });

});

describe('F5 omit unset seed/sampler defaults', () => {
  const node = (id: string, type: string, values: Record<string, any>): NodeInstance => ({
    id, type, title: type, pos: { x: 0, y: 0 }, inputs: [], outputs: [], values,
  });
  const mockGenerate = (seed: number | null) =>
    vi.spyOn(EngineRegistry, 'generate').mockImplementation(async (provider, p): Promise<NormalizedGenerateResult> => ({
      mediaUrl: 'https://example.com/r.png', provider, providerId: provider as any, model: p.model, seed, mediaType: 'image',
    }));
  const ksGraph = (ksVals: Record<string, any>) => ({
    nodes: [
      node('ckpt', 'CheckpointLoaderSimple', { ckpt_name: 'fal-ai/flux/dev', targetProvider: 'fal' }),
      node('clip', 'CLIPTextEncode', { text: 'a cat' }),
      node('ks', 'KSampler', ksVals),
    ],
    conns: [
      { id: 'c1', fromNodeId: 'ckpt', fromSocketId: 'MODEL', toNodeId: 'ks', toSocketId: 'model', type: 'MODEL' },
      { id: 'c2', fromNodeId: 'clip', fromSocketId: 'CONDITIONING', toNodeId: 'ks', toSocketId: 'positive', type: 'CONDITIONING' },
    ] as Connection[],
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(api, 'getStoredApiKeys').mockReturnValue({} as any);
  });

  it('GoogleImagenNode: no seed/steps/cfg/sampler/scheduler invented, generate gets no seed, history seed null', async () => {
    const rand = vi.spyOn(Math, 'random');
    const nodes = [node('g', 'GoogleImagenNode', { model: 'gemini-3.1-flash-image', prompt: 'a fox' })];
    const p = extractWorkflowParameters(nodes, [], 'g');
    for (const k of ['seed', 'steps', 'cfg', 'sampler', 'scheduler', 'denoise', 'width', 'height'] as const) {
      expect(p[k]).toBeUndefined();
    }
    const spy = mockGenerate(null);
    const res = await executeWorkflow(nodes, [], () => {}, undefined, 'g');
    const sent = spy.mock.calls[0][1];
    expect(sent.seed).toBeUndefined();
    expect(sent.extraParams).not.toHaveProperty('sampler_name');
    expect(sent.extraParams).not.toHaveProperty('scheduler');
    expect(res.seed).toBeNull();
    expect(rand).not.toHaveBeenCalled();
  });

  it('KSampler + CheckpointLoader gemini: imported long seed omitted from generate; history seed null', async () => {
    const nodes = [
      node('ckpt', 'CheckpointLoaderSimple', { ckpt_name: 'gemini-3.1-flash-image', targetProvider: 'gemini' }),
      node('clip', 'CLIPTextEncode', { text: 'a fox' }),
      node('ks', 'KSampler', { control_after_generate: 'fixed', seed: 1847392847561, steps: 20, cfg: 7 }),
    ];
    const conns = [
      { id: 'c1', fromNodeId: 'ckpt', fromSocketId: 'MODEL', toNodeId: 'ks', toSocketId: 'model', type: 'MODEL' },
      { id: 'c2', fromNodeId: 'clip', fromSocketId: 'CONDITIONING', toNodeId: 'ks', toSocketId: 'positive', type: 'CONDITIONING' },
    ] as Connection[];
    const p = extractWorkflowParameters(nodes, conns, 'ks');
    expect(p.targetProvider).toBe('gemini');
    expect(p.seed).toBe(1847392847561); // widget 仍可残留导入值
    expect(isCanvasFieldUnsupported('gemini', 'gemini-3.1-flash-image', 'seed')).toBe(true);
    const spy = mockGenerate(null);
    const res = await executeWorkflow(nodes, conns, () => {}, undefined, 'ks');
    const sent = spy.mock.calls[0][1];
    expect(sent.seed).toBeUndefined();
    expect(res.seed).toBeNull();
  });

  it('FalAIEngineNode with only model+prompt: no forged 28/3.5/1024/seed', async () => {
    const nodes = [node('f', 'FalAIEngineNode', { model: 'fal-ai/flux/dev', prompt: 'a fox' })];
    const p = extractWorkflowParameters(nodes, [], 'f');
    expect([p.steps, p.cfg, p.width, p.height, p.seed, p.sampler, p.scheduler]).toEqual(Array(7).fill(undefined));
    const spy = mockGenerate(null);
    await executeWorkflow(nodes, [], () => {}, undefined, 'f');
    const sent = spy.mock.calls[0][1];
    expect([sent.steps, sent.cfg, sent.width, sent.height, sent.seed, sent.denoise]).toEqual(Array(6).fill(undefined));
  });

  it('FalAIEngineNode with explicit steps/guidance/resolution passes them through', () => {
    const nodes = [node('f', 'FalAIEngineNode', {
      model: 'fal-ai/flux/dev', prompt: 'a fox', steps: 28, guidance_scale: 3.5, resolution: '1024x1024',
    })];
    const p = extractWorkflowParameters(nodes, [], 'f');
    expect([p.steps, p.cfg, p.width, p.height]).toEqual([28, 3.5, 1024, 1024]);
  });

  it('KSampler fixed seed 12345 kept; seed 0 kept; unset seed stays undefined', () => {
    let g = ksGraph({ control_after_generate: 'fixed', seed: 12345 });
    expect(extractWorkflowParameters(g.nodes, g.conns, 'ks').seed).toBe(12345);
    g = ksGraph({ control_after_generate: 'fixed', seed: 0 });
    expect(extractWorkflowParameters(g.nodes, g.conns, 'ks').seed).toBe(0);
    g = ksGraph({ steps: 20 });
    const p = extractWorkflowParameters(g.nodes, g.conns, 'ks');
    expect(p.seed).toBeUndefined();
    expect(p.steps).toBe(20);
    expect([p.cfg, p.sampler, p.scheduler, p.denoise, p.width, p.height]).toEqual(Array(6).fill(undefined));
  });

  it('KSampler + init image: denoise is not forged to 0.65', () => {
    const g = ksGraph({ steps: 20 });
    g.nodes.push(node('img', 'LoadImage', { image_url: 'https://example.com/i.png' }));
    g.conns.push({ id: 'c3', fromNodeId: 'img', fromSocketId: 'IMAGE', toNodeId: 'ks', toSocketId: 'latent_image', type: 'IMAGE' });
    const p = extractWorkflowParameters(g.nodes, g.conns, 'ks');
    expect(p.initImageUrl).toBe('https://example.com/i.png');
    expect(p.denoise).toBeUndefined();
  });

  it('KSampler randomize → finite seed (user opted in)', () => {
    const g = ksGraph({ control_after_generate: 'randomize', seed: 1 });
    expect(Number.isFinite(extractWorkflowParameters(g.nodes, g.conns, 'ks').seed)).toBe(true);
  });
});


describe('graphEngine - F4 AIVideoNode provider sync / reject empty & mismatch', () => {
  const createNode = (id: string, type: string, values: Record<string, any>): NodeInstance => ({
    id,
    type,
    title: type,
    pos: { x: 0, y: 0 },
    inputs: [],
    outputs: [],
    values,
  });

  it('F4: empty targetProvider/provider is rejected (never Fal fallback)', () => {
    const nodes: NodeInstance[] = [
      createNode('video-node', 'AIVideoNode', {
        model: 'fal-ai/wan-t2v',
        prompt: 'cinematic orbit',
        // no targetProvider / provider
      }),
    ];
    expect(() => extractWorkflowParameters(nodes, [], 'video-node')).toThrow(/视频服务商|不会回退到 Fal/);
  });

  it('F4: schema model provider mismatch with targetProvider is rejected', () => {
    const nodes: NodeInstance[] = [
      createNode('video-node', 'AIVideoNode', {
        model: 'text2video_wan27', // tensorart in schema
        targetProvider: 'fal',
        prompt: 'cinematic orbit',
      }),
    ];
    expect(() => extractWorkflowParameters(nodes, [], 'video-node')).toThrow(/服务商不一致|不会回退到 Fal/);
  });

  it('F4: explicit Fal provider with matching Fal model still works', () => {
    const nodes: NodeInstance[] = [
      createNode('video-node', 'AIVideoNode', {
        model: 'fal-ai/wan-t2v',
        targetProvider: 'fal',
        prompt: 'cinematic orbit',
        duration: 5,
      }),
    ];
    const params = extractWorkflowParameters(nodes, [], 'video-node');
    expect(params.isVideo).toBe(true);
    expect(params.videoProvider).toBe('fal');
    expect(params.checkpointModel).toBe('fal-ai/wan-t2v');
    expect(params.targetProvider).toBe('video');
  });

  it('F4: mirrored provider field alone is accepted when targetProvider empty', () => {
    const nodes: NodeInstance[] = [
      createNode('video-node', 'AIVideoNode', {
        model: 'agnes-video-2.5-flash',
        provider: 'agnes',
        prompt: 'cinematic orbit',
      }),
    ];
    const params = extractWorkflowParameters(nodes, [], 'video-node');
    expect(params.videoProvider).toBe('agnes');
  });
});
